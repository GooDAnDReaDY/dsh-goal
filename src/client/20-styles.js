    // --- STYLES AND CSS RULES (DSH DESIGN SYSTEM) ---

    const CSS_STYLES = `

      .dsh-goal-dock {

        box-sizing: border-box;

        width: calc(100% - var(--dsh-composer-side-clearance, 0px) * 2 - var(--dsh-composer-dock-inset, 0px) * 4);

        max-width: calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 0px) * 4);

        margin: 0 auto 8px auto;

        display: flex;

        justify-content: center;

      }

      .dsh-goal-dock-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--dsw-alias-surface-raised);
        border: 1px solid var(--dsw-alias-border-subtle);
        border-radius: 9999px;
        padding: 4px 12px;
        box-shadow: var(--dsw-alias-shadow-md);
        backdrop-filter: blur(8px);
        font-size: 13px;
        max-width: 100%;
        box-sizing: border-box;
      }
      .dsh-goal-dock-pill .dsh-goal-title {
        max-width: 260px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
      }
      .dsh-goal-checklist {
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dsh-goal-checklist-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
        user-select: none;
      }
      .dsh-goal-checklist-item input[type="checkbox"] {
        cursor: pointer;
        margin: 0;
      }
      .dsh-goal-budget-warn {
        color: var(--dsw-alias-status-warning);
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
      }
      .dsh-goal-dock.dsh-goal-dock-quick {

        justify-content: flex-start;

        margin-bottom: 4px;

      }

      .dsh-goal-template-chips {

        display: flex;

        flex-wrap: wrap;

        gap: 6px;

        margin-bottom: 12px;

      }

      .dsh-goal-template-chip {

        appearance: none;

        font: inherit;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 999px;

        padding: 3px 8px;

        font-size: 11px;

        color: var(--dsw-alias-label-secondary);

        cursor: pointer;

        display: inline-flex;

        align-items: center;

        gap: 4px;

        transition: all 0.12s ease;

      }

      .dsh-goal-template-chip:hover {

        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-3));

        border-color: var(--dsw-alias-label-tertiary);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-nudge-box {

        display: flex;

        align-items: center;

        gap: 8px;

        margin-top: 4px;

      }

      .dsh-goal-git-badge {

        display: inline-flex;

        align-items: center;

        gap: 4px;

        font-family: monospace;

        font-size: 11px;

        padding: 2px 6px;

        border-radius: 4px;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        color: var(--dsw-alias-label-secondary);

        cursor: pointer;

      }

      .dsh-goal-git-badge:hover {

        color: var(--dsw-alias-label-primary);

        border-color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-quicklaunch-btn {

        appearance: none;

        font: inherit;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 999px;

        padding: 4px 11px;

        color: var(--dsw-alias-label-secondary);

        font-size: 12px;

        font-weight: 500;

        cursor: pointer;

        display: inline-flex;

        align-items: center;

        gap: 6px;

        transition: all 0.15s ease;

        box-shadow: var(--dsw-alias-shadow-s, 0 1px 2px transparent);

      }

      .dsh-goal-quicklaunch-btn:hover {

        background: var(--dsw-alias-bg-layer-3);

        border-color: var(--dsw-alias-label-tertiary);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-banner {

        box-sizing: border-box;

        width: 100%;

        display: flex;

        align-items: center;

        justify-content: space-between;

        background: var(--dsw-alias-bg-layer-3);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 12px;

        padding: 7px 14px;

        font-family: inherit;

        font-size: 13px;

        color: var(--dsw-alias-label-primary);

        user-select: none;

        box-shadow: var(--dsw-alias-shadow-m, 0 1px 4px transparent);

        transition: all 0.15s ease;

      }

      .dsh-goal-banner:hover {

        border-color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-banner.completed {

        border-color: var(--dsw-alias-state-success-primary);

        background: var(--dsw-alias-bg-layer-3);

      }

      .dsh-goal-left {

        display: flex;

        align-items: center;

        gap: 8px;

        min-width: 0;

        flex: 1;

      }

      .dsh-goal-icon {

        color: var(--dsw-alias-label-secondary);

        flex-shrink: 0;

        display: flex;

        align-items: center;

      }

      .dsh-goal-badge {

        font-size: 11px;

        padding: 2px 8px;

        border-radius: 999px;

        border: 1px solid var(--dsw-alias-border-l2);

        display: inline-flex;

        align-items: center;

        gap: 4px;

        font-weight: 600;

        white-space: nowrap;

        background: var(--dsw-alias-bg-layer-2);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-badge-ok {

        border-color: var(--dsw-alias-state-success-primary);

        color: var(--dsw-alias-state-success-primary);

        background: var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-hover));

      }

      .dsh-goal-badge-warn {

        border-color: var(--dsw-alias-state-warning-primary);

        color: var(--dsw-alias-state-warning-primary);

        background: var(--dsw-alias-state-warning-bg, var(--dsw-alias-bg-hover));

      }

      .dsh-goal-badge-plan {

        border-color: var(--dsw-alias-brand-primary);

        color: var(--dsw-alias-brand-primary);

        background: var(--dsw-alias-bg-hover);

      }

      .dsh-goal-badge-act {

        border-color: var(--dsw-alias-state-success-primary);

        color: var(--dsw-alias-state-success-primary);

        background: var(--dsw-alias-bg-hover);

      }

      .dsh-goal-btn-approve {

        background: var(--dsw-alias-state-success-primary) !important;

        color: var(--dsw-alias-bg-layer-3) !important;

        font-weight: 600 !important;

        border: none !important;

        cursor: pointer;

      }

      .dsh-goal-btn-approve:hover {

        opacity: 0.88;

      }

      .dsh-goal-plan-banner {

        display: flex;

        align-items: center;

        justify-content: space-between;

        padding: 8px 12px;

        margin-bottom: 12px;

        border-radius: 6px;

        background: var(--dsw-alias-bg-hover);

        border: 1px solid var(--dsw-alias-brand-primary);

      }

      .dsh-goal-label {

        font-weight: 600;

        color: var(--dsw-alias-label-primary);

        white-space: nowrap;

      }

      .dsh-goal-label.completed {

        color: var(--dsw-alias-state-success-primary);

      }

      .dsh-goal-title {

        color: var(--dsw-alias-label-secondary);

        overflow: hidden;

        text-overflow: ellipsis;

        white-space: nowrap;

        font-weight: 400;

        flex: 1;

        min-width: 0;

      }

      .dsh-goal-time {

        color: var(--dsw-alias-label-secondary);

        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

        font-size: 12px;

        font-weight: 500;

        white-space: nowrap;

        display: inline-flex;

        align-items: center;

        gap: 4px;

        flex-shrink: 0;

      }

      .dsh-goal-right {

        display: flex;

        align-items: center;

        gap: 8px;

        margin-left: 12px;

        flex-shrink: 0;

      }

      .dsh-goal-btn {

        appearance: none;

        font: inherit;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        padding: 5px 8px;

        margin: 0;

        color: var(--dsw-alias-label-primary);

        cursor: pointer;

        display: inline-flex;

        align-items: center;

        justify-content: center;

        gap: 5px;

        border-radius: 8px;

        font-size: 12px;

        font-weight: 500;

        transition: all 0.15s ease;

      }

      .dsh-goal-btn:hover:not(:disabled) {

        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));

        border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2));

      }

      .dsh-goal-btn.icon-only {

        padding: 4px 6px;

        border-radius: 6px;

        border-color: transparent;

        background: transparent;

        color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-btn.icon-only:hover {

        color: var(--dsw-alias-label-primary);

        background: var(--dsw-alias-bg-layer-2);

        border-color: var(--dsw-alias-border-l2);

      }

      .dsh-goal-btn.close {

        font-size: 13px;

        font-weight: bold;

        padding: 3px 6px;

      }

      .dsh-goal-btn.close:hover {

        color: var(--dsw-alias-state-error-primary);

      }

      .dsh-goal-btn-primary {

        background: var(--dsw-alias-label-primary);

        color: var(--dsw-alias-bg-layer-3);

        border-color: transparent;

      }

      .dsh-goal-btn-primary:hover:not(:disabled) {

        opacity: 0.88;

      }

      .dsh-goal-btn-danger {

        color: var(--dsw-alias-state-error-primary);

        border-color: var(--dsw-alias-state-error-border, var(--dsw-alias-border-l1));

      }

      .dsh-goal-btn-danger:hover:not(:disabled) {

        background: var(--dsw-alias-state-error-bg, var(--dsw-alias-bg-hover)) !important;

        border-color: var(--dsw-alias-state-error-primary);

      }

      /* Modal Details */

      .dsh-goal-modal-overlay {

        position: fixed;

        inset: 0;

        background: var(--dsw-alias-mask-bg, var(--dsw-alias-bg-primary));

        display: flex;

        align-items: center;

        justify-content: center;

        z-index: 10000;

        backdrop-filter: blur(4px);

      }

      .dsh-goal-modal {

        background: var(--dsw-alias-bg-layer-3);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 12px;

        width: 560px;

        max-width: 90vw;

        max-height: 80vh;

        display: flex;

        flex-direction: column;

        box-shadow: var(--dsw-alias-shadow-l, 0 16px 36px var(--dsw-alias-border-l1));

      }

      .dsh-goal-modal-head {

        padding: 16px 20px;

        border-bottom: 1px solid var(--dsw-alias-border-l2);

        display: flex;

        align-items: center;

        justify-content: space-between;

      }

      .dsh-goal-modal-title {

        font-size: 16px;

        font-weight: 600;

        color: var(--dsw-alias-label-primary);

        display: flex;

        align-items: center;

        gap: 8px;

      }

      .dsh-goal-modal-body {

        padding: 18px 20px;

        overflow-y: auto;

        display: flex;

        flex-direction: column;

        gap: 14px;

      }

      .dsh-goal-stat-grid {

        display: grid;

        grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));

        gap: 10px;

      }

      .dsh-goal-stat-box {

        padding: 10px 12px;

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 8px;

        background: var(--dsw-alias-bg-layer-2);

        display: flex;

        flex-direction: column;

        gap: 2px;

      }

      .dsh-goal-stat-val {

        font-size: 15px;

        font-weight: 700;

        color: var(--dsw-alias-label-primary);

        overflow: hidden;

        text-overflow: ellipsis;

        white-space: nowrap;

      }

      .dsh-goal-stat-lbl {

        font-size: 11px;

        color: var(--dsw-alias-label-secondary);

        white-space: nowrap;

      }

      .dsh-goal-milestone-item {

        display: flex;

        align-items: flex-start;

        gap: 10px;

        padding: 10px 12px;

        border-radius: 8px;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        font-size: 13px;

        transition: all 0.15s ease;

      }

      .dsh-goal-modal-foot {

        padding: 14px 20px;

        border-top: 1px solid var(--dsw-alias-border-l2);

        display: flex;

        justify-content: flex-end;

        align-items: center;

        gap: 10px;

        flex-wrap: wrap;

      }

      .dsh-goal-btn-copy {

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-btn-copy.copied {

        background: var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-hover));

        border-color: var(--dsw-alias-state-success-primary);

        color: var(--dsw-alias-state-success-primary);

      }

      /* Settings Card (clinebot pattern) */

      .dsh-goal-card {

        border: 1px solid var(--dsw-alias-border-l2);

        background: var(--dsw-alias-bg-layer-3);

        border-radius: 12px;

        list-style: none;

        margin-bottom: 12px;

        transition: border-color 0.15s ease;

      }

      .dsh-goal-card:hover {

        border-color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-card-head {

        appearance: none;

        width: 100%;

        font: inherit;

        color: inherit;

        text-align: left;

        cursor: pointer;

        background: transparent;

        border: 0;

        border-radius: 12px;

        display: flex;

        align-items: center;

        gap: 12px;

        padding: 16px 20px;

      }

      .dsh-goal-card-title {

        color: var(--dsw-alias-label-primary);

        font-size: 15px;

        font-weight: 600;

        line-height: 1.4;

      }

      .dsh-goal-card-sub {

        color: var(--dsw-alias-label-secondary);

        font-size: 13px;

      }

      .dsh-goal-card-body {

        border-top: 1px solid var(--dsw-alias-border-l2);

        margin: 0 20px;

        padding: 16px 0 16px;

        display: flex;

        flex-direction: column;

        gap: 14px;

      }

      .dsh-goal-card-field {

        display: flex;

        flex-direction: column;

        gap: 6px;

      }

      .dsh-goal-field-label-row {

        display: flex;

        align-items: center;

        justify-content: space-between;

        font-size: 13px;

        font-weight: 500;

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-field-meta {

        display: flex;

        align-items: center;

        gap: 6px;

        font-size: 11px;

        color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-override-tag {

        font-size: 11px;

        padding: 2px 6px;

        border-radius: 4px;

        background: var(--dsw-alias-bg-layer-2);

        color: var(--dsw-alias-label-secondary);

        border: 1px solid var(--dsw-alias-border-l2);

      }

      .dsh-goal-card-input {

        height: 36px;

        border: 1px solid var(--dsw-alias-border-l2);

        background: var(--dsw-alias-bg-layer-2);

        color: var(--dsw-alias-label-primary);

        border-radius: 8px;

        padding: 0 12px;

        font-size: 13px;

        width: 100%;

        box-sizing: border-box;

      }

      .dsh-goal-card-input:focus {

        outline: none;

        border-color: var(--dsw-alias-state-brand-primary);

      }

      .dsh-goal-card-input[aria-invalid="true"] {

        border-color: var(--dsw-alias-state-error-primary);

      }

      .dsh-goal-chev {

        margin-left: auto;

        flex: none;

        color: var(--dsw-alias-label-tertiary);

        transition: transform .16s ease;

      }

      .dsh-goal-chev-open {

        transform: rotate(180deg);

      }

      .dsh-goal-check-row {

        display: flex;

        align-items: center;

        justify-content: space-between;

        padding: 6px 0;

      }

      .dsh-goal-check {

        display: flex;

        align-items: center;

        gap: 8px;

        font-size: 13px;

        color: var(--dsw-alias-label-primary);

        cursor: pointer;

      }

      .dsh-goal-foot {

        border-top: 1px solid var(--dsw-alias-border-l2);

        display: flex;

        justify-content: flex-end;

        align-items: center;

        gap: 10px;

        padding: 14px 0 4px;

      }

      .dsh-goal-foot-note {

        color: var(--dsw-alias-state-error-primary);

        font-size: 12px;

        margin-right: auto;

      }

      .dsh-goal-btn-inline-reset {

        background: transparent;

        border: 0;

        cursor: pointer;

        padding: 2px 6px;

        display: flex;

        align-items: center;

        gap: 4px;

        border-radius: 4px;

        color: var(--dsw-alias-label-tertiary);

        font-size: 11px;

      }

      .dsh-goal-btn-inline-reset:hover {

        color: var(--dsw-alias-label-primary);

        background: var(--dsw-alias-bg-layer-2);

      }

      .dsh-goal-discard {

        appearance: none;

        font: inherit;

        cursor: pointer;

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 8px;

        padding: 6px 14px;

        font-size: 13px;

        background: var(--dsw-alias-bg-layer-2);

        color: var(--dsw-alias-label-primary);

        transition: all 0.15s ease;

      }

      .dsh-goal-discard:hover:not(:disabled) {

        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));

        border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2));

      }

      .dsh-goal-discard:disabled {

        opacity: 0.4;

        cursor: not-allowed;

      }

      .dsh-goal-save {

        appearance: none;

        font: inherit;

        cursor: pointer;

        border: 1px solid transparent;

        border-radius: 8px;

        padding: 6px 16px;

        font-size: 13px;

        background: var(--dsw-alias-label-primary);

        color: var(--dsw-alias-bg-layer-3);

        font-weight: 500;

        transition: opacity 0.15s ease;

      }

      .dsh-goal-save:hover:not(:disabled) {

        opacity: 0.88;

      }

      .dsh-goal-save:disabled {

        opacity: 0.4;

        cursor: not-allowed;

      }

    
      .dsh-goal-intervene-card {
        padding: 12px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-state-warning-primary);
        margin-bottom: 12px;
      }

      .dsh-goal-preplan-card {
        padding: 12px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-state-info-primary, var(--dsw-alias-border-l2));
        margin-bottom: 12px;
      }

      .dsh-goal-activity-feed {
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        margin-top: 12px;
      }

      .dsh-goal-activity-list {
        max-height: 140px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .dsh-goal-activity-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
      }

      .dsh-goal-activity-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--dsw-alias-state-info-primary, var(--dsw-alias-primary));
        flex-shrink: 0;
      }

      .dsh-goal-activity-time {
        font-size: 10px;
        color: var(--dsw-alias-label-tertiary);
        flex-shrink: 0;
      }

      .dsh-goal-activity-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .dsh-goal-retrospective-card {
        padding: 12px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        margin-top: 12px;
      }

      .dsh-goal-chip-btn {
        padding: 3px 8px;
        border-radius: 9999px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        color: var(--dsw-alias-label-primary);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .dsh-goal-chip-btn:hover {
        background: var(--dsw-alias-bg-hover);
        border-color: var(--dsw-alias-border-l1);
      }

      .dsh-goal-lock-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-state-warning-bg, var(--dsw-alias-bg-layer-4));
        color: var(--dsw-alias-state-warning-primary);
        border: 1px solid var(--dsw-alias-state-warning-primary);
        margin-left: 6px;
      }

      .dsh-goal-gate-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-bg-layer-4);
        color: var(--dsw-alias-brand-primary);
        border: 1px solid var(--dsw-alias-brand-primary);
        margin-left: 6px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .dsh-goal-template-chip.active {
        border-color: var(--dsw-alias-brand-primary);
        font-weight: 600;
        background: var(--dsw-alias-bg-layer-3);
      }

      .dsh-goal-operator-card {
        background: var(--dsw-alias-bg-sunken);
        border: 1px solid var(--dsw-alias-state-warning-primary);
        border-radius: 6px;
        padding: 10px 12px;
        margin-top: 8px;
      }

      .dsh-goal-tpl-vars-box {
        background: var(--dsw-alias-bg-sunken);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 10px;
      }

      .dsh-goal-gate-error {
        font-size: 11px;
        color: var(--dsw-alias-state-danger-primary);
        margin-top: 3px;
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--dsw-alias-bg-layer-2);
        font-family: monospace;
      }
      .dsh-goal-tabs {
        display: flex;
        gap: 8px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        margin: 10px 0 14px 0;
        padding-bottom: 6px;
      }
      .dsh-goal-tab-btn {
        background: transparent;
        border: none;
        font-size: 13px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
        padding: 6px 12px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .dsh-goal-tab-btn:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .dsh-goal-tab-btn.active {
        color: var(--dsw-alias-brand-primary);
        background: var(--dsw-alias-bg-layer-2);
        font-weight: 600;
      }
      .dsh-goal-diff-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .dsh-goal-diff-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--dsw-alias-bg-sunken);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 12px;
      }
      .dsh-goal-diff-stat-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }
      .dsh-goal-diff-ins {
        color: var(--dsw-alias-state-success-primary);
      }
      .dsh-goal-diff-del {
        color: var(--dsw-alias-state-danger-primary);
      }
      .dsh-goal-diff-files-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        max-height: 100px;
        overflow-y: auto;
      }
      .dsh-goal-diff-file-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 11px;
        font-family: monospace;
        cursor: pointer;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-goal-diff-file-chip:hover,
      .dsh-goal-diff-file-chip.active {
        border-color: var(--dsw-alias-brand-primary);
        color: var(--dsw-alias-label-primary);
      }
      .dsh-goal-diff-viewer {
        background: var(--dsw-alias-bg-sunken);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.45;
        max-height: 380px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .dsh-goal-diff-line {
        display: block;
        padding: 1px 4px;
        border-radius: 2px;
      }
      .dsh-goal-diff-line-add {
        background: var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-hover));
        color: var(--dsw-alias-state-success-primary);
      }
      .dsh-goal-diff-line-del {
        background: var(--dsw-alias-state-error-bg, var(--dsw-alias-bg-hover));
        color: var(--dsw-alias-state-danger-primary);
      }
      .dsh-goal-diff-line-hunk {
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-state-info-primary);
      }
      .dsh-goal-diff-line-header {
        color: var(--dsw-alias-label-tertiary);
        font-weight: 600;
      }
      .dsh-goal-diff-empty {
        padding: 24px;
        text-align: center;
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
      }
      /* Sub-goals and Compaction (Issue 167 and Issue 170) */
      .dsh-goal-badge-subgoal {
        background: var(--dsw-alias-brand-bg, var(--dsw-alias-bg-hover));
        color: var(--dsw-alias-brand-primary, var(--dsw-alias-text-primary));
        border: 1px solid var(--dsw-alias-brand-border, var(--dsw-alias-border));
      }
      .dsh-goal-breadcrumbs {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-goal-breadcrumb-item {
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-goal-breadcrumb-item.active {
        color: var(--dsw-alias-text-primary);
        font-weight: 600;
      }
      .dsh-goal-crumb-sep {
        color: var(--dsw-alias-label-tertiary);
        margin: 0 2px;
      }
      .dsh-goal-subgoals-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 4px 0;
      }
      .dsh-goal-subgoals-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dsh-goal-subgoal-card {
        background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-hover));
        border: 1px solid var(--dsw-alias-border);
        border-radius: 6px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dsh-goal-subgoal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .dsh-goal-subgoal-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--dsw-alias-text-primary);
      }
      .dsh-goal-subgoal-summary {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-goal-compacted-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-hover));
        color: var(--dsw-alias-state-success-primary, var(--dsw-alias-text-secondary));
        border: 1px solid var(--dsw-alias-border);
        margin-left: 6px;
      }
    `;
