/**
 * Prompt generation for DSH Goal Mode
 */
export function buildStatePromptInjection(snapshot, pendingNudge) {
  const lang = snapshot.lang || 'en';
  const hasMilestones = snapshot.milestones && snapshot.milestones.length > 0;
  const etaText = snapshot.formattedETA ? ` (ETA: ${snapshot.formattedETA})` : '';

  let nudgeText = '';
  if (pendingNudge) {
    if (lang === 'zh') {
      nudgeText = `\n\n🚨 用户紧急补充说明 / 调整方向:\n"${pendingNudge}"\n你必须根据此说明调整近期的具体执行步骤！\n`;
    } else {
      nudgeText = `\n\n🚨 URGENT USER CLARIFICATION / STEERING:\n"${pendingNudge}"\nYou must adjust your immediate actions according to this guidance!\n`;
    }
  }

  if (lang === 'zh') {
    const milestonesText = hasMilestones
      ? snapshot.milestones
          .map((m, i) => `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${m.notes ? ` (${m.notes})` : ''}`)
          .join('\n')
      : '  (工作计划尚未建立 — 请立即调用 goal_set_milestones 设定初始里程碑！)';

    return (
      nudgeText +
      `\n\n[DSH GOAL MODE ACTIVE]\n` +
      `目标: "${snapshot.title}"\n` +
      `运行时间: ${snapshot.formattedElapsed}${etaText} | 迭代轮次: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
      `工作计划:\n` +
      `${milestonesText}\n\n` +
      `Goal Mode 执行契约 (必须严格遵循):\n` +
      `1. ${hasMilestones ? '按部就班推进当前进行中的里程碑。' : '第一步核心指令: 立即调用 goal_set_milestones 制定 3-7 个具体里程碑。在完成此工具调用前严禁执行其他操作！'}\n` +
      `2. 推进里程碑时，必须通过 goal_update_progress 工具更新状态（开始前标为 in_progress，完成后标为 completed 并附简要说明）。\n` +
      `3. 当所有里程碑全部完成后，调用 goal_finish 工具提交详细成果总结。`
    );
  }

  const milestonesText = hasMilestones
    ? snapshot.milestones
        .map((m, i) => `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${m.notes ? ` (${m.notes})` : ''}`)
        .join('\n')
    : '  (Work plan is not yet established — call goal_set_milestones immediately with initial steps!)';

  return (
    nudgeText +
    `\n\n[DSH GOAL MODE ACTIVE]\n` +
    `Goal: "${snapshot.title}"\n` +
    `Elapsed Time: ${snapshot.formattedElapsed}${etaText} | Iteration: ${snapshot.iterationsCount}/${snapshot.maxIterations}\n` +
    `Work Plan:\n` +
    `${milestonesText}\n\n` +
    `Goal Mode Instructions (MANDATORY TO FOLLOW):\n` +
    `1. ${hasMilestones ? 'Execute the current active milestone from the work plan.' : 'YOUR FIRST STEP: Immediately call tool goal_set_milestones with the list of milestones (3-7 concrete steps). You must not execute work or finish turn without calling goal_set_milestones!'}\n` +
    `2. As each milestone progresses, update its status via tool goal_update_progress (status: "in_progress" before starting, status: "completed" upon completion with brief notes).\n` +
    `3. When all milestones are completed, call tool goal_finish with a detailed summary of achieved results.`
  );
}
