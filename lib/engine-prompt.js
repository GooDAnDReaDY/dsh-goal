import { detectLanguage } from "./goal-engine.js";
import { isMilestoneBlocked } from './engine-milestones.js';

/**
 * Prompt generation for DSH Goal Mode
 */
export function buildStatePromptInjection(snapshot, pendingNudge) {
  const lang = snapshot.lang || 'en';
  const hasMilestones = snapshot.milestones && snapshot.milestones.length > 0;
  const etaText = snapshot.formattedETA ? ` (ETA: ${snapshot.formattedETA})` : '';

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

  const allMilestones = snapshot.milestones || [];
  const formatMilestone = (m, i) => {
    const depCheck = isMilestoneBlocked(m, allMilestones);
    const blockedLabel = depCheck.blocked
      ? ` (BLOCKED by ${depCheck.missingDependencies.join(', ')})`
      : '';
    let line = `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${blockedLabel}${m.notes ? ` (${m.notes})` : ''}`;
    if (Array.isArray(m.checklist) && m.checklist.length > 0) {
      const checkLines = m.checklist
        .map((item) => `      [${item.done ? 'x' : ' '}] ${item.text}`)
        .join('\n');
      line += `\n${checkLines}`;
    }
    return line;
  };

  if (lang === 'zh') {
    const milestonesText = hasMilestones
      ? snapshot.milestones.map(formatMilestone).join('\n')
      : '  (工作计划尚未建立 — 请立即调用 goal_set_milestones 设定初始里程碑！)';

    return (
      directiveText +
      nudgeText +
      budgetWarningText +
      `\n\n[DSH GOAL MODE ACTIVE]\n` +
      `目标: "${snapshot.title}"\n` +
      `运行时间: ${snapshot.formattedElapsed}${etaText} | 迭代轮次: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
      `工作计划:\n` +
      `${milestonesText}\n\n` +
      `Goal Mode 执行契约 (必须严格遵循):\n` +
      `1. ${hasMilestones ? '按部就班推进当前进行中的里程碑。注意：标记为 [BLOCKED] 的里程碑在前置依赖完成前严禁推进。' : '第一步核心指令: 立即调用 goal_set_milestones 制定 3-7 个具体里程碑。在完成此工具调用前严禁执行其他操作！'}\n` +
      `2. 推进里程碑时，必须通过 goal_update_progress 工具更新状态（开始前标为 in_progress，完成后标为 completed 并附简要说明）。如有细分子任务，可通过 checklist 字段同步进度。\n` +
      `3. 当所有里程碑全部完成后，调用 goal_finish 工具提交详细成果总结。`
    );
  }

  const milestonesText = hasMilestones
    ? snapshot.milestones.map(formatMilestone).join('\n')
    : '  (Work plan is not yet established — call goal_set_milestones immediately with initial steps!)';

  return (
    directiveText +
    nudgeText +
    budgetWarningText +
    `\n\n[DSH GOAL MODE ACTIVE]\n` +
    `Goal: "${snapshot.title}"\n` +
    `Elapsed Time: ${snapshot.formattedElapsed}${etaText} | Iteration: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
    `Work Plan:\n` +
    `${milestonesText}\n\n` +
    `Goal Mode Instructions (MANDATORY TO FOLLOW):\n` +
    `1. ${hasMilestones ? 'Execute the current active milestone from the work plan. Note: Milestones marked [BLOCKED] must not be started until prerequisite milestones are COMPLETED.' : 'YOUR FIRST STEP: Immediately call tool goal_set_milestones with the list of milestones (3-7 concrete steps). You must not execute work or finish turn without calling goal_set_milestones!'}\n` +
    `2. As each milestone progresses, update its status via tool goal_update_progress (status: "in_progress" before starting, status: "completed" upon completion with brief notes). If sub-tasks exist, pass checklist array to track items.\n` +
    `3. When all milestones are completed, call tool goal_finish with a detailed summary of achieved results.`
  );
}


/**
 * Format goal start prompt with mandatory milestone contract
 * @param {string} goalText
 * @param {string} [explicitLang]
 * @returns {string}
 */
export function formatGoalStartPrompt(goalText, explicitLang) {
  const lang = explicitLang || detectLanguage(goalText);
  if (lang === "zh") {
    return `🎯 目标模式已激活 (Goal Mode): "${goalText}"\n\n` +
      `自主执行契约：\n` +
      `1. 第一步必选动作：在开展任何工作或回复之前，你的第一个动作必须是调用 goal_set_milestones 工具，提交包含 3-7 个具体连续步骤的工作计划。用户将在界面中实时查看此计划。\n` +
      `2. 第二步：计划确立后开始执行任务。在开始每个步骤前，通过 goal_update_progress(milestone_id, "in_progress") 标记其为进行中。\n` +
      `3. 第三步：完成某一步骤后，通过 goal_update_progress(milestone_id, "completed", "阶段简要成果") 标记为已完成。\n` +
      `4. 第四步：当所有里程碑全部完成后，调用 goal_finish(summary) 工具并附带详尽的最终成果总结。`;
  }

  return `🎯 Goal Mode activated: "${goalText}"\n\n` +
    `STRICT AUTONOMOUS CONTRACT:\n` +
    `1. MANDATORY STEP 1: Your FIRST action BEFORE doing any other work or reply MUST be calling tool goal_set_milestones with an array of 3-7 concrete, sequential milestones. The user sees this plan in real time.\n` +
    `2. STEP 2: After establishing the plan, proceed to execute milestones. Before starting each milestone, mark it as in_progress via goal_update_progress(milestone_id, "in_progress").\n` +
    `3. STEP 3: Upon completing a milestone, mark it as completed via goal_update_progress(milestone_id, "completed", "brief milestone outcome").\n` +
    `4. STEP 4: When all milestones are completed, call tool goal_finish(summary) with a comprehensive summary of achieved results.`;
}
