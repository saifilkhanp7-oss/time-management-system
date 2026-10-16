// Default alarm tunes, synthesised with the Web Audio API (no audio files needed).
let ctx;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// notes: [frequencyHz, startSec, durationSec]
export const TUNES = {
  chime: { label: 'Soft Chime', type: 'sine', every: 1.8, notes: [[880, 0, 0.5], [1318.5, 0.22, 0.6], [1760, 0.44, 0.9]] },
  digital: { label: 'Digital Beep', type: 'square', every: 1.2, notes: [[1046.5, 0, 0.12], [1046.5, 0.2, 0.12], [1046.5, 0.4, 0.12], [1046.5, 0.6, 0.12]] },
  bell: { label: 'Temple Bell', type: 'triangle', every: 2.6, notes: [[523.25, 0, 2.2], [1046.5, 0, 1.6], [1568, 0, 1.0]] },
  marimba: { label: 'Marimba', type: 'sine', every: 1.6, notes: [[659.25, 0, 0.25], [783.99, 0.15, 0.25], [987.77, 0.3, 0.25], [1318.5, 0.45, 0.4], [987.77, 0.7, 0.3]] },
  sunrise: { label: 'Sunrise', type: 'sine', every: 2.4, notes: [[392, 0, 0.5], [493.88, 0.3, 0.5], [587.33, 0.6, 0.5], [783.99, 0.9, 1.0]] },
};

function playOnce(key) {
  const tune = TUNES[key] || TUNES.chime;
  const c = ac();
  const t0 = c.currentTime + 0.02;
  for (const [f, at, dur] of tune.notes) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = tune.type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(tune.type === 'square' ? 0.08 : 0.28, t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g).connect(c.destination);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.05);
  }
}

let loop = null;
export function startAlarm(key) {
  stopAlarm();
  try { playOnce(key); } catch { return; }
  loop = setInterval(() => playOnce(key), (TUNES[key] || TUNES.chime).every * 1000);
}
export function stopAlarm() { clearInterval(loop); loop = null; }
export function previewTune(key) { try { playOnce(key); } catch { /* audio unavailable */ } }
export function unlockAudio() { try { ac(); } catch { /* audio unavailable */ } }
