    module.exports.inject = ['slots', 'locale', 'configForms'];

    module.exports.apply = function apply(ctx) {
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => {
          try {
            ctx.locale?.register?.(NS, LOCALES);
          } catch (err) { /* handled defensively */ }

          const configForms =
            ctx.configForms && typeof ctx.configForms.get === 'function'
              ? ctx.configForms.get(NS)
              : null;

          const disposers = [];
          const registerSlotSafe = (name, entry, comp) => {
            try {
              if (typeof ctx.slots?.inject === 'function') {
                const unreg = ctx.slots.inject(name, () => {
                  try {
                    return ctx.slots.register(entry, comp);
                  } catch (err) { /* handled defensively */ }
                });
                if (typeof unreg === 'function') disposers.push(unreg);
              } else if (typeof ctx.slots?.register === 'function') {
                const unreg = ctx.slots.register(entry, comp);
                if (typeof unreg === 'function') disposers.push(unreg);
              }
            } catch (err) { /* handled defensively */ }
          };

          registerSlotSafe(
            'conversation.input.dock',
            {
              name: 'conversation.input.dock',
              id: '@goodandready/dsh-goal',
              order: 10,
              locale: NS,
              inject: (slotProps) => ({ ctx, ...slotProps }),
            },
            GoalTopBanner,
          );

          registerSlotSafe(
            'plugins.item',
            {
              name: 'plugins.item',
              id: ROW_ID,
              order: 60,
              label: () => 'Goal',
              locale: NS,
              inject: () => ({ ctx, scope: configForms }),
            },
            GoalSettingsCard,
          );

          registerSlotSafe(
            'plugins.row.config',
            {
              name: 'plugins.row.config',
              key: ROW_CONFIG_KEY,
              locale: NS,
              inject: () => ({ ctx, scope: configForms }),
            },
            GoalSettingsCard,
          );

          // settings.plugin.item is gone: it was retired before DSH 0.1.7-rc.2, so
          // it only mounted GoalSettingsCard a second time on a seat that no longer
          // exists. plugins.item and plugins.row.config above cover both releases.

          return () => {
            for (const dispose of disposers) {
              try { dispose(); } catch (e) { /* handled defensively */ }
            }
          };
        }, 'dsh-goal: client slots & locale');
      } else {
        try {
          ctx.locale?.register?.(NS, LOCALES);
        } catch (err) { /* handled defensively */ }

        const configForms =
          ctx.configForms && typeof ctx.configForms.get === 'function'
            ? ctx.configForms.get(NS)
            : null;

        const registerSlotSafe = (name, entry, comp) => {
          try {
            if (typeof ctx.slots?.inject === 'function') {
              ctx.slots.inject(name, () => {
                try {
                  return ctx.slots.register(entry, comp);
                } catch (err) { /* handled defensively */ }
              });
            } else if (typeof ctx.slots?.register === 'function') {
              ctx.slots.register(entry, comp);
            }
          } catch (err) { /* handled defensively */ }
        };

        registerSlotSafe(
          'conversation.input.dock',
          {
            name: 'conversation.input.dock',
            id: '@goodandready/dsh-goal',
            order: 10,
            locale: NS,
            inject: (slotProps) => ({ ctx, ...slotProps }),
          },
          GoalTopBanner,
        );

        registerSlotSafe(
          'plugins.item',
          {
            name: 'plugins.item',
            id: ROW_ID,
            order: 60,
            label: () => 'Goal',
            locale: NS,
            inject: () => ({ ctx, scope: configForms }),
          },
          GoalSettingsCard,
        );

        registerSlotSafe(
          'plugins.row.config',
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NS,
            inject: () => ({ ctx, scope: configForms }),
          },
          GoalSettingsCard,
        );

        // settings.plugin.item is gone for the same reason: retired before DSH
        // 0.1.7-rc.2, it mounted GoalSettingsCard a second time on a dead seat.
      }
    };

    return module.exports;

  },

});

