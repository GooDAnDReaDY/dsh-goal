    function injectStylesOnce() {

      if (typeof document === 'undefined') return;

      if (document.getElementById('dsh-goal-styles')) return;

      const style = document.createElement('style');

      style.id = 'dsh-goal-styles';

      style.dataset.dshPlugin = NS;

      style.textContent = CSS_STYLES;

      document.head.appendChild(style);

    }

    // Synthesize audio chimes via Web Audio API (Item 6) & soundScheme (#92)

    function playGoalChime(isSuccess = true, scheme = 'default') {
      if (typeof window === 'undefined') return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const actx = new AudioCtx();
        if (actx.state === 'suspended') {
          actx.resume().catch((err) => { console.warn('[dsh-goal] Fetch templates error:', err); });
        }
        const now = actx.currentTime;
        if (scheme === 'retro') {
          const notes = isSuccess ? [330, 440, 554, 659] : [300, 220, 160];
          notes.forEach((freq, idx) => {
            const osc = actx.createOscillator();
            const gain = actx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.08, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.1);
            osc.connect(gain);
            gain.connect(actx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.12);
          });
          return;
        }
        if (scheme === 'minimal') {
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(isSuccess ? 880 : 330, now);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
          osc.connect(gain);
          gain.connect(actx.destination);
          osc.start(now);
          osc.stop(now + 0.4);
          return;
        }

        // Pentatonic chords: success ascending C5-E5-G5-C6; failure descending G4-Eb4-C4

        const notes = isSuccess

          ? [523.25, 659.25, 783.99, 1046.50]

          : [392.00, 311.13, 261.63];

        notes.forEach((freq, idx) => {

          const osc = actx.createOscillator();

          const gain = actx.createGain();

          osc.type = 'sine';

          osc.frequency.setValueAtTime(freq, now + idx * 0.12);

          gain.gain.setValueAtTime(0.001, now + idx * 0.12);

          gain.gain.exponentialRampToValueAtTime(0.15, now + idx * 0.12 + 0.02);

          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.4);

          osc.connect(gain);

          gain.connect(actx.destination);

          osc.start(now + idx * 0.12);

          osc.stop(now + idx * 0.12 + 0.45);

        });

        setTimeout(() => {

          try { actx.close(); } catch (err) { /* ignore audio context close error */ }

        }, 2000);

      } catch (err) { /* handled defensively */ }

    }

    // Voice announcement via Web Speech API (#92)
    function speakGoalAnnouncement(text, enabled = false) {
      if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.0;
        utter.pitch = 1.0;
        window.speechSynthesis.speak(utter);
      } catch (err) { /* defensive */ }
    }

