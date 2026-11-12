import { MilestoneStatus, GoalMode, detectLanguage, isPathInsideOrEqual, getSafeCwd } from './goal-engine-constants.js';
import { isValidGitRef } from './engine-git-branch.js';
import { saveGoalArtifact, rollbackToCheckpoint } from './engine-reports.js';
import { getTemplatesCatalogue, instantiateTemplate } from './engine-templates.js';
import { parseIssueChecklist } from './engine-issue-sync.js';
import { dispatchGoalTelegramNotification } from './engine-release-notes.js';
import { formatOperatorAnswerPrompt } from './engine-operator-query.js';

/**
 * Dispatches and executes a goal action payload for POST /dsh-goal/action (#189).
 *
 * @param {object} data
 * @param {object} options
 * @returns {Promise<{ handled: boolean, result?: any }>}
 */
export function executeGoalAction(data, {
  req,
  res,
  sid,
  engine,
  goalsService,
  getConfig,
  stopRunningAgents,
  resumeActiveAgent,
  sessionAgents,
  addonStore,
  budgetGuard,
  snapshotManager,
  milestoneManager,
  broadcastEvent,
  logger = console,
  ctx,
} = {}) {
  const { action, title, description, reason, milestoneId, status, notes } = data;
  let result = null;

              switch (action) {
                case 'start': {
                  const cleanTitle = typeof title === 'string' ? title.trim() : '';
                  if (!cleanTitle) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Goal title cannot be empty' }));
                    return { handled: true };
                  }
                  const trustedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    trustedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  let safeStartCwd = undefined;
                  if (data.cwd) {
                    const validated = getSafeCwd(data.cwd, trustedRoots);
                    if (!validated) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: 'Invalid or unauthorized working directory' }));
                      return { handled: true };
                    }
                    safeStartCwd = validated;
                  }
                  const detectedLang = data.lang || detectLanguage(cleanTitle);
                  const conf = typeof getConfig === 'function' ? getConfig() : { maxIterations: 25 };

                  if (engine) {
                    result = engine.startGoal(cleanTitle, {
                      description: typeof description === 'string' ? description.trim() : '',
                      maxIterations: conf.maxIterations || 25,
                      lang: detectedLang,
                      cwd: safeStartCwd,
                      issueBody: data.issueBody,
                      mode: data.mode,
                      maxCostBudget: data.maxCostBudget,
                      currency: data.currency,
                    }, sid);
                  } else {
                    let parsedMilestones = [];
                    if (data.issueBody) {
                      parsedMilestones = parseIssueChecklist(data.issueBody);
                    }
                    const initialMode = data.mode === 'plan' ? 'plan' : 'act';
                    result = {
                      title: cleanTitle,
                      sessionId: sid,
                      hasActiveGoal: true,
                      mode: initialMode,
                      state: initialMode === 'plan' ? 'PLANNING' : 'RUNNING',
                      milestones: parsedMilestones,
                    };
                  }

                  const isPlan = result?.mode === 'plan' || (engine && typeof engine.isPlanMode === 'function' && engine.isPlanMode(sid));
                  const startPrompt = isPlan
                    ? (detectedLang === 'zh'
                      ? `🎯 目标已确立（规划模式/Plan Mode）：“${cleanTitle}”。请通过 goal_milestones 制定工作计划并列出检查清单。在操作者批准前，请勿进行写文件等变更操作。`
                      : `🎯 Goal established in Plan Mode: "${cleanTitle}". Formulate milestones and checklist via goal_milestones and goal_checklist. Do not modify files until the operator approves the plan.`)
                    : (detectedLang === 'zh'
                      ? `🎯 目标已确立：“${cleanTitle}”。请立即通过 goal_milestones 制定工作计划并开始执行。`
                      : `🎯 Goal established: "${cleanTitle}". Formulate milestones via goal_milestones and proceed.`);

                  if (typeof resumeActiveAgent === 'function') {
                    resumeActiveAgent(startPrompt, sid);
                  }
                  break;
                }

                case 'nudge': {
                  const text = (typeof data.text === 'string' ? data.text : (data.notes || data.nudge || '')).trim();
                  if (!text) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Nudge text cannot be empty' }));
                    return { handled: true };
                  }
                  if (engine) {
                    result = engine.nudge(text, sid);
                    if (data.resume) {
                      engine.resume(sid);
                      const prompt = engine.getStatePromptInjection(sid);
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { nudged: true, text };
                  }
                  break;
                }

                case 'pause':
                  if (engine) {
                    result = engine.pause(reason || 'Paused by user interface', sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'resume':
                  if (engine) {
                    result = engine.resume(sid);
                  }
                  if (typeof resumeActiveAgent === 'function') {
                    resumeActiveAgent(undefined, sid);
                  }
                  break;

                case 'cancel':
                  if (engine) {
                    result = engine.cancel(reason || 'Goal cancelled by user', sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'clear':
                  if (engine) {
                    result = engine.clear(sid);
                  }
                  if (addonStore && typeof addonStore.removeGoalData === 'function') {
                    addonStore.removeGoalData(sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  if (sessionAgents) {
                    sessionAgents.delete(sid);
                  }
                  break;

                case 'update_milestone': {
                  if (!milestoneId || !status) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'milestoneId and status are required' }));
                    return { handled: true };
                  }
                  const validStatuses = Object.values(MilestoneStatus);
                  if (!validStatuses.includes(status)) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` }));
                    return { handled: true };
                  }
                  if (engine) {
                    const ok = engine.updateMilestone(milestoneId, status, notes, sid, data.checklist);
                    if (!ok) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: `Milestone with id "${milestoneId}" not found` }));
                      return { handled: true };
                    }
                    result = engine.getSnapshot(sid);
                  } else if (milestoneManager) {
                    const ok = milestoneManager.updateMilestone(sid, milestoneId, { status, notes });
                    if (!ok) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: `Milestone with id "${milestoneId}" not found` }));
                      return { handled: true };
                    }
                    result = { ok: true, milestones: milestoneManager.getMilestones(sid) };
                  }
                  break;
                }

                case 'toggle_checklist_item': {
                  if (!milestoneId || data.itemIndex === undefined) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'milestoneId and itemIndex are required' }));
                    return { handled: true };
                  }
                  if (engine) {
                    const ok = engine.toggleChecklistItem(milestoneId, data.itemIndex, data.done, sid);
                    if (!ok) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: `Milestone checklist item not found` }));
                      return { handled: true };
                    }
                    result = engine.getSnapshot(sid);
                  } else if (milestoneManager) {
                    const ok = milestoneManager.toggleChecklistItem(sid, milestoneId, data.itemIndex, data.done);
                    if (!ok) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: `Milestone checklist item not found` }));
                      return { handled: true };
                    }
                    result = { ok: true, milestones: milestoneManager.getMilestones(sid) };
                  }
                  break;
                }

                case 'extend_budget': {
                  const addTokens = data.addTokens || 50000;
                  if (engine) {
                    const ok = engine.extendBudget(addTokens, sid);
                    if (!ok) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: 'No active goal found to extend budget' }));
                      return { handled: true };
                    }
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(undefined, sid);
                    }
                    result = engine.getSnapshot(sid);
                  } else if (budgetGuard) {
                    budgetGuard.extendBudget(sid, addTokens);
                    result = { ok: true, extendedBy: addTokens };
                  }
                  break;
                }

                case 'rollback_milestone': {
                  const commit = data.commit || data.checkpointCommit;
                  if (!commit) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'commit hash is required for rollback' }));
                    return { handled: true };
                  }
                  const sessionGoal = engine ? engine.getGoal(sid) : null;
                  const allowedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    allowedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  if (sessionGoal?.cwd) {
                    const isCwdAllowed = allowedRoots.some((root) => isPathInsideOrEqual(root, sessionGoal.cwd));
                    if (isCwdAllowed) {
                      allowedRoots.push(sessionGoal.cwd);
                    }
                  }
                  const safeCwd = getSafeCwd(data.cwd, allowedRoots);
                  if (!safeCwd) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid or non-existent working directory' }));
                    return { handled: true };
                  }
                  const ok = rollbackToCheckpoint(commit, safeCwd);
                  if (!ok) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: `Failed to rollback to checkpoint ${commit}` }));
                    return { handled: true };
                  }
                  result = engine ? engine.getSnapshot(sid) : { ok: true, rolledBack: commit };
                  break;
                }

                case 'save_artifact': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'No active goal to save artifact for' }));
                    return { handled: true };
                  }
                  const sessionGoal = engine ? engine.getGoal(sid) : null;
                  const allowedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    allowedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  if (sessionGoal?.cwd) {
                    const isCwdAllowed = allowedRoots.some((root) => isPathInsideOrEqual(root, sessionGoal.cwd));
                    if (isCwdAllowed) {
                      allowedRoots.push(sessionGoal.cwd);
                    }
                  }
                  const safeCwd = getSafeCwd(data.cwd, allowedRoots);
                  if (!safeCwd) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid or non-existent working directory' }));
                    return { handled: true };
                  }
                  const artifact = saveGoalArtifact(snap || { objective: 'Goal Report' }, safeCwd);
                  if (!artifact) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Failed to write goal artifact to disk' }));
                    return { handled: true };
                  }
                  res.statusCode = 200;
                  res.end(JSON.stringify({ ok: true, artifact, state: snap || {} }));
                  return { handled: true };
                }

                case 'intervene': {
                  if (engine) {
                    result = engine.intervene(data, sid);
                    if (data.resume) {
                      engine.resume(sid);
                      const prompt = engine.getStatePromptInjection(sid);
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { intervened: true };
                  }
                  break;
                }

                case 'preplan_approve': {
                  if (engine) {
                    result = engine.approvePreplan(sid);
                    const prompt = engine.getStatePromptInjection(sid);
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  }
                  break;
                }

                case 'set_mode': {
                  const targetMode = data.mode;
                  if (targetMode !== GoalMode.PLAN && targetMode !== GoalMode.ACT) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: `Invalid mode "${targetMode}". Must be "plan" or "act".` }));
                    return { handled: true };
                  }
                  if (engine) {
                    const snap = engine.getSnapshot(sid);
                    if (!snap || !snap.hasActiveGoal) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: 'No active goal found to set mode' }));
                      return { handled: true };
                    }
                    result = engine.setMode(targetMode, sid);
                    if (targetMode === GoalMode.ACT) {
                      const detectedLang = snap.lang || 'en';
                      const prompt = detectedLang === 'zh'
                        ? '⚡ 执行模式（Act Mode）已激活。请继续推进目标任务。'
                        : '⚡ Act Mode activated by operator. Proceed with task execution.';
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { mode: targetMode, state: targetMode === GoalMode.PLAN ? 'PLANNING' : 'RUNNING' };
                  }
                  break;
                }

                case 'answer_operator': {
                  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
                  const optionIndex = typeof data.optionIndex === 'number' ? data.optionIndex : (typeof data.option_index === 'number' ? data.option_index : null);
                  if (engine && typeof engine.answerOperator === 'function') {
                    const ansRes = engine.answerOperator({ answer, optionIndex }, sid);
                    if (!ansRes.ok) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: ansRes.error || 'Failed to submit operator answer' }));
                      return { handled: true };
                    }
                    result = { ok: true, answer: ansRes.answer, state: engine.getSnapshot(sid) };
                    const snap = engine.getSnapshot(sid);
                    const detectedLang = snap?.lang || 'en';
                    const goal = engine.goals?.get ? engine.goals.get(sid) : (engine.goal || snap);
                    const prompt = formatOperatorAnswerPrompt(goal, detectedLang) || (detectedLang === 'zh'
                      ? `✅ 操作员已答复你的提问: "${ansRes.answer}"。请继续执行任务。`
                      : `✅ Operator answered your query: "${ansRes.answer}". Proceed with task execution.`);
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  } else {
                    result = { ok: true, answer };
                  }
                  break;
                }

                case 'approve_plan': {
                  if (engine) {
                    const snap = engine.getSnapshot(sid);
                    if (!snap || !snap.hasActiveGoal) {
                      res.statusCode = 404;
                      res.end(JSON.stringify({ error: 'No active goal found to approve plan' }));
                      return { handled: true };
                    }
                    result = engine.approvePlan(sid);
                    const detectedLang = snap.lang || 'en';
                    const prompt = detectedLang === 'zh'
                      ? '✅ 操作者已批准计划。执行模式（Act Mode）已激活。请立即开始具体代码与任务实现。'
                      : '✅ Plan approved by operator. Act Mode activated. Proceed with implementation.';
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  } else {
                    result = { mode: GoalMode.ACT, state: 'RUNNING', approved: true };
                  }
                  break;
                }

                case 'branch_action': {
                  const op = String(data.operation || data.branchOperation || 'merge').toLowerCase();
                  const targetBranch = String(data.targetBranch || 'main');
                  if (!isValidGitRef(targetBranch)) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: `Invalid targetBranch ref: "${targetBranch}"` }));
                    return { handled: true };
                  }
                  if (op !== 'merge' && op !== 'discard') {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: `Invalid branch operation: "${op}". Allowed: merge, discard` }));
                    return { handled: true };
                  }
                  if (engine) {
                    if (op === 'merge') {
                      const ok = engine.mergeGoalBranch(targetBranch, sid);
                      if (!ok) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: `Failed to merge goal branch into ${targetBranch}` }));
                        return { handled: true };
                      }
                    } else if (op === 'discard') {
                      const ok = engine.discardGoalBranch(targetBranch, sid);
                      if (!ok) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: 'Failed to discard goal branch' }));
                        return { handled: true };
                      }
                    }
                    result = engine.getSnapshot(sid);
                  }
                  break;
                }

                case 'templates':
                  res.statusCode = 200;
                  res.end(JSON.stringify({ ok: true, templates: getTemplatesCatalogue() }));
                  return { handled: true };

                case 'kanban_move': {
                  if (engine) {
                    result = engine.handleKanbanCardMove(data, sid);
                    if (!result.ok) res.statusCode = 400;
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'kanban_sync': {
                  if (engine) {
                    return (async () => {
                      const resVal = await engine.syncKanban(sid, { ctx });
                      if (!resVal.ok && !resVal.skipped) res.statusCode = 400;
                      return { handled: false, result: resVal };
                    })();
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'spawn_subgoal': {
                  const subTitle = typeof data.title === 'string' ? data.title.trim() : '';
                  if (!subTitle) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Sub-goal title is required' }));
                    return { handled: true };
                  }
                  if (engine) {
                    const spawnRes = engine.spawnSubGoal({
                      title: subTitle,
                      prompt: data.prompt || data.description,
                      maxIterations: data.maxIterations ?? data.max_iterations,
                      inheritContext: data.inheritContext ?? data.inherit_context,
                    }, sid);
                    if (!spawnRes.ok) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: spawnRes.error || 'Failed to spawn sub-goal' }));
                      return { handled: true };
                    }
                    result = spawnRes;
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'instantiate_template': {
                  const tplId = data.templateId || data.id;
                  if (!tplId) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'templateId is required' }));
                    return { handled: true };
                  }
                  const instance = instantiateTemplate(tplId, data.inputs || {});
                  if (!instance) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: `Template "${tplId}" not found` }));
                    return { handled: true };
                  }
                  res.statusCode = 200;
                  res.end(JSON.stringify({ ok: true, template: instance }));
                  return { handled: true };
                }

                case 'export_release_notes': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'No active goal found to export release notes' }));
                    return { handled: true };
                  }
                  const markdown = engine ? engine.exportReleaseNotes(sid, data.options || {}) : '';
                  res.statusCode = 200;
                  res.end(JSON.stringify({ ok: true, releaseNotes: markdown, state: snap || {} }));
                  return { handled: true };
                }

                case 'notify_telegram': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'No active goal found to dispatch notification' }));
                    return { handled: true };
                  }
                  return (async () => {
                    const goal = engine ? engine.getGoal(sid) : null;
                    const notifyRes = await dispatchGoalTelegramNotification(goal, { engine, ctx });
                    if (!notifyRes.ok) {
                      res.statusCode = 500;
                    }
                    res.end(JSON.stringify(notifyRes));
                    return { handled: true };
                  })();
                }

                default:
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
                  return { handled: true };
              }

  return { handled: false, result };
}
