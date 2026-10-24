import { FILM_SECONDS } from './timeline';

/** Original synthesized score: no downloaded music, samples or licensed recording. */
export async function createSoundtrack(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, sampleRate * FILM_SECONDS, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.62;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 14;
  limiter.ratio.value = 5;
  master.connect(limiter).connect(ctx.destination);

  const tone = (
    at: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    pan = 0,
  ) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const stereo = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.value = frequency;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(stereo).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.01);
  };

  const noise = ctx.createBuffer(1, sampleRate, sampleRate);
  let seed = 7183;
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    samples[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  const wash = (at: number, duration: number, volume: number, from: number, to: number) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + duration * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
    source.stop(at + duration);
  };

  const roots = [146.83, 130.81, 174.61, 130.81];
  const riff = [0, 7, 12, 7, 10, 7, 3, 7];
  for (let beat = 0; beat < 64; beat++) {
    const at = beat * 0.5;
    const root = roots[Math.floor(beat / 8) % roots.length];
    const busy = at >= 14 && at < 18;
    // Soft kick, wooden ticks and a plucked melody rather than a dense game soundtrack.
    const kick = ctx.createOscillator();
    const gain = ctx.createGain();
    kick.frequency.setValueAtTime(135, at);
    kick.frequency.exponentialRampToValueAtTime(43, at + 0.15);
    gain.gain.setValueAtTime(0.32, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    kick.connect(gain).connect(master);
    kick.start(at);
    kick.stop(at + 0.26);
    tone(at, root / 2, 0.36, 0.15, 'triangle');
    tone(at + 0.25, root * 2 ** (riff[beat % 8] / 12), 0.34, 0.17, 'sine', beat % 2 ? 0.25 : -0.25);
    tone(at + 0.25, root * 2 ** (riff[beat % 8] / 12) * 2, 0.11, 0.035);
    wash(at + 0.25, 0.055, 0.045, 6000, 4000);
    if (beat % 2) {
      tone(at, 760, 0.055, 0.07, 'triangle', -0.2);
      wash(at, 0.09, 0.065, 1800, 1000);
    }
    if (busy) wash(at + 0.375, 0.06, 0.08, 5000, 2500);
  }
  // Transitions, blade swishes and the rare ingredient's short shimmer.
  for (const at of [4, 9, 14, 18, 23, 27]) wash(at, 0.38, 0.18, 3500, 300);
  for (const at of [6.2, 7.9, 10, 11.2, 12.4, 15, 15.5, 16, 16.5]) wash(at, 0.16, 0.18, 800, 5000);
  for (let i = 0; i < 7; i++)
    tone(14.2 + i * 0.12, 587.33 * 2 ** ((i % 4) / 3), 0.4, 0.07, 'sine', Math.sin(i) * 0.5);
  // Small edge fades suppress clicks when the encoded file loops.
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.62, 0.06);
  master.gain.setValueAtTime(0.62, FILM_SECONDS - 0.2);
  master.gain.linearRampToValueAtTime(0, FILM_SECONDS);
  return ctx.startRendering();
}
