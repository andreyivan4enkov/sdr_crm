type AudioCtx = AudioContext | null;

let ac: AudioCtx = null;

function ensure(): AudioContext | null {
  if (!ac) {
    try {
      ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function envGain(ctx: AudioContext, t: number, peak: number, attack: number, release: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + release);
  return g;
}

export function setSequencerSoundEnabled(on: boolean) {
  (window as unknown as { __seqSound?: boolean }).__seqSound = on;
}

function soundOn() {
  return (window as unknown as { __seqSound?: boolean }).__seqSound !== false;
}

export function tickSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = envGain(ctx, t, 0.11, 0.004, 0.07);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1600;
  f.Q.value = 2.2;
  o.type = "triangle";
  o.frequency.setValueAtTime(880, t);
  o.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.09);
}

export function bassSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = envGain(ctx, t, 0.3, 0.03, 0.45);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 0.4);
  o.type = "sine";
  o.frequency.setValueAtTime(240, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.42);
  o.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.5);
}

export function thunkSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = envGain(ctx, t, 0.26, 0.02, 0.26);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 200;
  o.type = "sine";
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  o.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.3);
}

export function sizzleSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const dur = 0.5;
  const n = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.1;
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(500, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  src.start(t);
}

export function chordSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((fr, i) => {
    const o = ctx.createOscillator();
    const s = t + i * 0.09;
    const g = envGain(ctx, s, 0.17, 0.03, 1.1);
    o.type = "sine";
    o.frequency.value = fr;
    o.connect(g);
    g.connect(ctx.destination);
    o.start(s);
    o.stop(s + 1.2);
  });
}

export function openSound() {
  if (!soundOn()) return;
  const ctx = ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = envGain(ctx, t, 0.12, 0.02, 0.2);
  o.type = "sine";
  o.frequency.setValueAtTime(300, t);
  o.frequency.exponentialRampToValueAtTime(560, t + 0.12);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.22);
}
