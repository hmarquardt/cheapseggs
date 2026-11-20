/**
 * Optional casino sound, synthesised locally: no audio files, no network requests.
 * Off by default; an AudioContext is only created after an explicit user gesture.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function blip(
  frequency: number,
  start: number,
  length: number,
  type: OscillatorType,
  volume: number,
): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
    gain.gain.setValueAtTime(0, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime + start);
    oscillator.stop(ctx.currentTime + start + length + 0.02);
  } catch {
    // Audio is decorative: any failure is silent, never fatal.
  }
}

/** Decreasing tick rate as the wheel slows. */
export function playTick(progress: number, enabled: boolean): void {
  if (!enabled) return;
  blip(760 + progress * 220, 0, 0.035, "square", 0.035);
}

let tickTimer: number | null = null;

export function stopSpinTicks(): void {
  if (tickTimer === null || typeof window === "undefined") return;
  window.clearTimeout(tickTimer);
  tickTimer = null;
}

/**
 * Decelerating ticks for the length of the animation. Decorative and silent unless the
 * visitor turned sound on; a new spin or the end of a spin cancels the pending timer.
 */
export function startSpinTicks(durationMs: number, enabled: boolean): void {
  stopSpinTicks();
  if (!enabled || durationMs <= 0 || typeof window === "undefined") return;
  const started = window.performance.now();
  const schedule = (): void => {
    const progress = Math.min((window.performance.now() - started) / durationMs, 1);
    playTick(progress, true);
    if (progress >= 1) return;
    // ~60ms per tick at speed, stretching to ~320ms as the wheel settles.
    tickTimer = window.setTimeout(schedule, 60 + progress * progress * 260);
  };
  schedule();
}

export function playLanding(enabled: boolean): void {
  if (!enabled) return;
  blip(523.25, 0, 0.16, "triangle", 0.06);
  blip(783.99, 0.09, 0.22, "triangle", 0.05);
}

export function closeAudio(): void {
  const current = context;
  context = null;
  void current?.close().catch(() => undefined);
}
