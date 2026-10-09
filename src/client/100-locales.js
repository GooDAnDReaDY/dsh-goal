    // --- LOCALIZATION DICTIONARIES ---

    const LOCALES = {

      en: {

        goalLabel: 'Current goal',
        version: 'Version',
        updateAvailable: 'available',
        upToDate: 'Up to date',
        updateBtn: 'Update',
        updating: 'Updating…',
        checkUpdate: 'Check update',
        checking: 'Checking…',
        updateDone: 'Updated successfully. Please restart DSH to apply.',
        updateFailed: 'Update failed: ',
        compactDock: 'Collapse to compact pill',
        expandDock: 'Expand goal banner',
        saveArtifact: 'Save Run Artifact',
        artifactSaved: '✅ Artifact Saved (.dsh/goals/)',
        saveArtifactFailed: 'Artifact save failed',
        extendBudgetBtn: '+50k Tokens & Resume',
        budgetExceededBadge: 'Budget Limit Reached',
        budgetLabel: 'Token Budget (0 for unlimited):',
        budgetWarnLabel: 'Budget Warning Threshold (%):',
        autoCheckpointLabel: 'Auto-create Git checkpoint on milestone completed',
        rollbackBtn: 'Rollback to Checkpoint',
        rollbackConfirm: 'Rollback working tree to this checkpoint?',
        rollbackSuccess: 'Rolled back to checkpoint',
        interveneTitle: 'Pause & Intervene',
        interveneDesc: 'Goal is paused. Steer agent behavior with direct guidance before resuming.',
        interveneDirectivePlaceholder: 'Enter directive instructions for the agent...',
        interveneApply: 'Apply Directive & Resume',
        interveneApplied: 'Directive Applied',
        liveActivityTitle: 'Live Activity Feed',
        preplanTitle: 'Smart Pre-plan Ready',
        preplanApprove: 'Approve & Start Plan',
        mergeBranch: 'Merge Branch',
        discardBranch: 'Discard Branch',
        retrospectiveTitle: 'Goal Retrospective',
        templatesTitle: 'Goal Templates',
        waitingPrereq: 'waiting for prereq',

        goalCompleted: 'Goal completed',

        clearGoal: 'Clear goal',

        closeBanner: 'Close goal banner',

        pause: 'Pause',

        paused: 'Paused',

        resume: 'Resume',

        details: 'Expand Goal Details',

        modalTitle: 'Goal Plan & Status',

        modalTitleCompleted: 'Goal Completed: Plan & Results',

        time: 'Running time',

        eta: 'ETA',

        tokens: 'Tokens',

        iterations: 'Iterations',

        progress: 'Progress',

        done: 'Done',

        milestones: 'Plan of work:',

        noMilestones: 'Agent is preparing the plan of work...',

        close: 'Close',

        pluginTitle: 'Goal Mode & Autonomous Loop',

        pluginDesc: 'Goal banner above composer dock, milestone decomposition, and auto-drive',

        maxIterLabel: 'Max iterations (Safety Limit):',

        autoDriveLabel: 'Auto-drive: keep the loop running automatically',

        soundLabel: 'Sound when a goal completes',

        quickLaunchLabel: 'Quick launch goal button above composer dock',

        quickLaunch: 'Start Goal',

        quickLaunchTitle: 'Quick Launch Goal',

        quickLaunchDesc: 'Define the objective for the agent in autonomous mode:',

        quickLaunchPlaceholder: 'e.g. Implement report export and cover with unit tests...',

        startGoal: 'Start Goal',

        copyReport: '📋 Copy Report in Markdown',

        reportCopied: '✅ Copied!',

        save: 'Save',

        saving: 'Saving…',

        discard: 'Discard changes',

        resetField: 'Default',

        overridden: 'overridden',

        saveFailed: 'Not saved — fix the values and try again',

        loading: 'Loading settings…',

        unavailable: 'Settings unavailable',

        localeCode: 'en',

        copyPRComment: '🐙 Copy for GitHub PR',

        prCommentCopied: '✅ PR Report Copied!',

        nudgePlaceholder: '💡 Clarify task or steer agent...',

        sendNudge: 'Steer',

        nudgeSent: '✅ Steering sent!',

        copyGitDiff: 'Click to copy git diff command',

        toolFailLabel: 'Tool-Failure Breaker Limit:',

        toolFailHint: 'Auto-pause goal if N consecutive turns hit tool execution errors (0 to disable)',

        notifLabel: 'Native browser desktop notifications on completion',

      },

      zh: {

        goalLabel: '当前目标',
        version: '版本',
        updateAvailable: '可更新',
        upToDate: '已是最新',
        updateBtn: '更新',
        updating: '正在更新…',
        checkUpdate: '检查更新',
        checking: '正在检查…',
        updateDone: '更新成功。请重启 DSH 以生效。',
        updateFailed: '更新失败：',
        compactDock: '收起为迷你胶囊',
        expandDock: '展开目标横幅',
        saveArtifact: '导出运行报告工件',
        artifactSaved: '✅ 工件已保存 (.dsh/goals/)',
        saveArtifactFailed: '工件保存失败',
        extendBudgetBtn: '追加 50k Tokens 并恢复',
        budgetExceededBadge: '已达 Token 预算上限',
        budgetLabel: 'Token 预算上限 (0 为不限制)：',
        budgetWarnLabel: '预算预警阈值 (%)：',
        autoCheckpointLabel: '里程碑完成时自动创建 Git 检查点',
        rollbackBtn: '回滚到该检查点',
        rollbackConfirm: '确定将工作区代码回滚至该里程碑检查点吗？',
        rollbackSuccess: '已成功回滚到检查点',
        interveneTitle: '暂停并干预',
        interveneDesc: '目标已暂停。在恢复前向智能体发送直接指引。',
        interveneDirectivePlaceholder: '输入给智能体的指导指令...',
        interveneApply: '应用指引并继续',
        interveneApplied: '已应用干预',
        liveActivityTitle: '实时动态',
        preplanTitle: '智能预规划就绪',
        preplanApprove: '批准并启动计划',
        mergeBranch: '合并分支',
        discardBranch: '放弃分支',
        retrospectiveTitle: '目标复盘报告',
        templatesTitle: '目标模板',
        waitingPrereq: '等待前置依赖',

        goalCompleted: '目标已完成',

        clearGoal: '清除目标',

        closeBanner: '关闭目标横幅',

        pause: '暂停',

        paused: '已暂停',

        resume: '恢复',

        details: '展开目标详情',

        modalTitle: '目标计划与状态',

        modalTitleCompleted: '目标已完成：计划与成果',

        time: '运行时间',

        eta: '预估剩余 (ETA)',

        tokens: 'Token 消耗',

        iterations: '迭代次数',

        progress: '进度',

        done: '已完成',

        milestones: '工作计划：',

        noMilestones: '智能体正在制定工作计划...',

        close: '关闭',

        pluginTitle: '目标模式与自主循环 (Goal Mode)',

        pluginDesc: '输入框上方常驻目标横幅、里程碑拆解与自主循环',

        maxIterLabel: '最大迭代次数 (Safety Limit)：',

        autoDriveLabel: '自动执行：在各轮次间自动保持循环',

        soundLabel: '目标完成时播放提示音',

        quickLaunchLabel: '在输入框上方显示快速启动目标按钮',

        quickLaunch: '启动目标',

        quickLaunchTitle: '快速启动目标',

        quickLaunchDesc: '为自主模式下的智能体设定任务目标：',

        quickLaunchPlaceholder: '例如：实现报表导出功能并编写单元测试...',

        startGoal: '启动目标',

        copyReport: '📋 复制 Markdown 报告',

        reportCopied: '✅ 已复制！',

        save: '保存',

        saving: '保存中…',

        discard: '放弃更改',

        resetField: '恢复默认',

        overridden: '已修改',

        saveFailed: '保存失败 — 请检查并重试',

        loading: '正在加载设置…',

        unavailable: '设置不可用',

        localeCode: 'zh',

        copyPRComment: '🐙 复制为 GitHub PR 报告',

        prCommentCopied: '✅ PR 报告已复制！',

        nudgePlaceholder: '💡 补充要求或调整智能体方向...',

        sendNudge: '下达指令',

        nudgeSent: '✅ 指令已发送！',

        copyGitDiff: '点击复制 git diff 命令',

        toolFailLabel: '工具调用连续故障断路器阈值：',

        toolFailHint: '连续 N 轮遭遇工具调用错误时自动暂停（0 表示禁用）',

        notifLabel: '目标完成时发送浏览器桌面原生通知',

      },

      };

