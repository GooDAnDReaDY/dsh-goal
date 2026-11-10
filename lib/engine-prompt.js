import { detectLanguage } from "./goal-engine.js";
import { isMilestoneBlocked } from './engine-milestones.js';
import { buildCompactedMilestonesHistory } from './engine-compaction.js';

/**
 * Prompt generation for DSH Goal Mode
 */
export function buildStatePromptInjection(snapshot, pendingNudge) {
  const lang = snapshot.lang || 'en';
  const hasMilestones = snapshot.milestones && snapshot.milestones.length > 0;
  const etaText = snapshot.formattedETA ? ` (ETA: ${snapshot.formattedETA})` : '';

  let operatorAnswerText = '';
  if (snapshot.operatorQuery?.answer && !snapshot.operatorQuery.consumed) {
    snapshot.operatorQuery.consumed = true;
    if (lang === 'zh') {
      operatorAnswerText = `\n\n[操作员答复 / OPERATOR RESPONSE]\n你之前提出的问题: "${snapshot.operatorQuery.question}"\n操作员给出的明确指令: "${snapshot.operatorQuery.answer}"\n请严格根据操作员的答复继续推进任务，切勿再对此问题做无谓猜测！\n`;
    } else {
      operatorAnswerText = `\n\n[OPERATOR RESPONSE TO YOUR QUERY]\nYour Question: "${snapshot.operatorQuery.question}"\nOperator Answer: "${snapshot.operatorQuery.answer}"\nStrictly follow the operator's response and proceed with executing the goal without second-guessing!\n`;
    }
  }

  let directiveText = '';
  if (snapshot.userDirective && !snapshot.userDirectiveConsumed) {
    if (lang === 'zh') {
      directiveText = `\n\n🛑 用户干预指令 (USER INTERVENTION DIRECTIVE):\n"${snapshot.userDirective}"\n你必须无条件优先遵循此指令，调整接下来的执行决策与步骤！\n`;
    } else {
      directiveText = `\n\n🛑 USER INTERVENTION DIRECTIVE:\n"${snapshot.userDirective}"\nYou must prioritize and follow this directive immediately in your next decisions and actions!\n`;
    }
  }

  let nudgeText = '';
  if (pendingNudge) {
    if (lang === 'zh') {
      nudgeText = `\n\n🚨 用户紧急补充说明 / 调整方向:\n"${pendingNudge}"\n你必须根据此说明调整近期的具体执行步骤！\n`;
    } else {
      nudgeText = `\n\n🚨 URGENT USER CLARIFICATION / STEERING:\n"${pendingNudge}"\nYou must adjust your immediate actions according to this guidance!\n`;
    }
  }

  let budgetWarningText = '';
  if (snapshot.budgetAutoScaled) {
    if (lang === 'zh') {
      budgetWarningText = `\n\n💡 TOKEN 预算自动延展通知:\n检测到目标已接近尾声，系统已自动按策略扩充了缓冲预算。请集中精力尽快完成最后阶段，不要展开多余任务！\n`;
    } else {
      budgetWarningText = `\n\n💡 TOKEN BUDGET AUTO-SCALED:\nGoal is near completion; an automatic buffer extension was granted. Focus strictly on wrapping up the remaining milestones!\n`;
    }
  } else if (snapshot.budgetWarningTriggered) {
    const total = snapshot.tokensUsage?.totalTokens || 0;
    const max = snapshot.maxTokenBudget || 0;
    const pct = max > 0 ? Math.round((total / max) * 100) : 0;
    if (lang === 'zh') {
      budgetWarningText = `\n\n⚠️ TOKEN 预算预警 (已消耗 ${pct}%: ${total.toLocaleString('en-US')}/${max.toLocaleString('en-US')}):\nToken 预算即将耗尽！严禁开展额外探索，必须专注于立即完成当前里程碑并调用 goal_finish 提交成果！\n`;
    } else {
      budgetWarningText = `\n\n⚠️ TOKEN BUDGET ALERT (${pct}% consumed: ${total.toLocaleString('en-US')}/${max.toLocaleString('en-US')}):\nToken budget is nearing exhaustion! Avoid exploratory turns and focus strictly on completing active milestones and calling goal_finish immediately!\n`;
    }
  }

  let costWarningText = '';
  if (snapshot.costLimitExceeded) {
    const formatted = snapshot.costUsage?.formattedCost || ".00";
    const limit = "$" + (snapshot.maxCostBudget || 0).toFixed(2);
    if (lang === "zh") {
      costWarningText = "\n\n🚨 财务成本预算超限熔断警告 (" + formatted + " / " + limit + "):\n当前目标已超出设定的最高财务预算限制！严禁发起任何额外的模型调用，必须立即调用 goal_finish 提交已有成果并退出！\n";
    } else {
      costWarningText = "\n\n🚨 FINANCIAL COST BUDGET EXCEEDED (" + formatted + " / " + limit + "):\nGoal cost has exceeded the maximum allocated financial budget! Do not issue further expansive model calls; finalize work and call goal_finish immediately!\n";
    }
  } else if (snapshot.costWarningTriggered) {
    const formatted = snapshot.costUsage?.formattedCost || ".00";
    const limit = "$" + (snapshot.maxCostBudget || 0).toFixed(2);
    if (lang === "zh") {
      costWarningText = "\n\n⚠️ 财务成本预算预警 (" + formatted + " / " + limit + "):\n财务消耗即将达到设定上限！请高度精简提示词与回答，尽快完成当前里程碑并调用 goal_finish！\n";
    } else {
      costWarningText = "\n\n⚠️ FINANCIAL COST ALERT (" + formatted + " / " + limit + "):\nCost budget is nearing threshold! Be concise, wrap up pending milestones, and call goal_finish promptly!\n";
    }
  }

  let subGoalContextText = '';
  if (snapshot.isSubGoal) {
    if (lang === 'zh') {
      subGoalContextText = `\n\n[子目标隔离执行上下文 / ISOLATED SUB-GOAL EXECUTION CONTEXT]\n` +
        `你当前处于从主目标派生出的隔离子目标中 (主目标 ID: "${snapshot.parentGoalId || 'parent'}")。\n` +
        `请严格专注于当前子目标的独立交付！所有里程碑完成后，立即调用 goal_finish 提交最终成果并将控制权移交回主目标。\n`;
    } else {
      subGoalContextText = `\n\n[ISOLATED SUB-GOAL EXECUTION CONTEXT]\n` +
        `You are running inside an isolated sub-goal spawned by parent goal (Parent Goal ID: "${snapshot.parentGoalId || 'parent'}").\n` +
        `Focus strictly on delivering this specific sub-goal objective! When all sub-milestones are completed, call tool goal_finish immediately to return deliverables and control to the parent goal.\n`;
    }
  }

  const allMilestones = snapshot.milestones || [];
  const formatMilestone = (m, i) => {
    const origIdx = allMilestones.indexOf(m);
    const num = origIdx >= 0 ? origIdx + 1 : i + 1;
    const depCheck = isMilestoneBlocked(m, allMilestones);
    const blockedLabel = depCheck.blocked
      ? ` (BLOCKED by ${depCheck.missingDependencies.join(', ')})`
      : '';
    let line = `  ${num}. [${m.status.toUpperCase()}] ${m.title}${blockedLabel}${m.notes ? ` (${m.notes})` : ''}`;
    if (Array.isArray(m.checklist) && m.checklist.length > 0) {
      const checkLines = m.checklist
        .map((item) => `      [${item.done ? 'x' : ' '}] ${item.text}`)
        .join('\n');
      line += `\n${checkLines}`;
    }
    return line;
  };

  const enableCompaction = snapshot.enableMilestoneCompaction !== false;
  const completedMilestones = allMilestones.filter((m) => m && m.status === 'completed');
  const activeMilestones = allMilestones.filter((m) => m && m.status !== 'completed');
  const shouldCompact = enableCompaction && completedMilestones.length > 0 && activeMilestones.length > 0;

  let compactedBlock = '';
  if (shouldCompact) {
    compactedBlock = `${buildCompactedMilestonesHistory(completedMilestones, lang)}\n\n`;
  }

  const displayMilestones = shouldCompact ? activeMilestones : allMilestones;

  if (lang === 'zh') {
    const planTitle = shouldCompact ? '当前进行中与后续工作计划:' : '工作计划:';
    const milestonesText = hasMilestones
      ? displayMilestones.map(formatMilestone).join('\n')
      : '  (工作计划尚未建立 — 请立即调用 goal_set_milestones 设定初始里程碑！)';

    return (
      subGoalContextText +
      operatorAnswerText +
      directiveText +
      nudgeText +
      budgetWarningText +
    costWarningText +
      costWarningText +
      `\n\n[DSH GOAL MODE ACTIVE]\n` +
      `目标: "${snapshot.title}"\n` +
      `运行时间: ${snapshot.formattedElapsed}${etaText} | 迭代轮次: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
      `${compactedBlock}${planTitle}\n` +
      `${milestonesText}\n\n` +
      `Goal Mode 执行契约 (必须严格遵循):\n` +
      `1. ${hasMilestones ? '按部就班推进当前进行中的里程碑。注意：标记为 [BLOCKED] 的里程碑在前置依赖完成前严禁推进。' : '第一步核心指令: 立即调用 goal_set_milestones 制定 3-7 个具体里程碑。在完成此工具调用前严禁执行其他操作！'}\n` +
      `2. 推进里程碑时，必须通过 goal_update_progress 工具更新状态（开始前标为 in_progress，完成后标为 completed 并附简要说明）。如有细分子任务，可通过 checklist 字段同步进度。\n` +
      `3. 当所有里程碑全部完成后，调用 goal_finish 工具提交详细成果总结。`
    );
  }

  const planTitle = shouldCompact ? 'Active & Upcoming Work Plan:' : 'Work Plan:';
  const milestonesText = hasMilestones
    ? displayMilestones.map(formatMilestone).join('\n')
    : '  (Work plan is not yet established — call goal_set_milestones immediately with initial steps!)';

  return (
    subGoalContextText +
    operatorAnswerText +
    directiveText +
    nudgeText +
    budgetWarningText +
    costWarningText +
    `\n\n[DSH GOAL MODE ACTIVE]\n` +
    `Goal: "${snapshot.title}"\n` +
    `Elapsed Time: ${snapshot.formattedElapsed}${etaText} | Iteration: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
    `${compactedBlock}${planTitle}\n` +
    `${milestonesText}\n\n` +
    `Goal Mode Instructions (MANDATORY TO FOLLOW):\n` +
    `1. ${hasMilestones ? 'Execute the current active milestone from the work plan. Note: Milestones marked [BLOCKED] must not be started until prerequisite milestones are COMPLETED.' : 'YOUR FIRST STEP: Immediately call tool goal_set_milestones with the list of milestones (3-7 concrete steps). You must not execute work or finish turn without calling goal_set_milestones!'}\n` +
    `2. As each milestone progresses, update its status via tool goal_update_progress (status: "in_progress" before starting, status: "completed" upon completion with brief notes). If sub-tasks exist, pass checklist array to track items.\n` +
    `3. When all milestones are completed, call tool goal_finish with a detailed summary of achieved results.`
  );
}
