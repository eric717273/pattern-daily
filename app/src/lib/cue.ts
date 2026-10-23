/** Tiny WebAudio cues (no asset files). Every call is safe when audio is unavailable. */

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call inside a tap so Safari lets later cues play. */
export function primeAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** A short two-note "ding" for a correct, in-time answer. */
export function playSuccessCue(): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const t0 = c.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // audio unavailable
  }
}
