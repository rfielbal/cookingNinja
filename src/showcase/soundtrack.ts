import { FILM_SECONDS } from './timeline';

/** Original score and kitchen Foley, synthesized locally without recorded samples. */
export async function createSoundtrack(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, sampleRate * FILM_SECONDS, sampleRate);
  const music = ctx.createGain();
  const effects = ctx.createGain();
  const mix = ctx.createGain();
  music.gain.value = 0.72;
  effects.gain.value = 0.82;
  music.connect(mix);
  effects.connect(mix);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 5;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  const output = ctx.createGain();
  mix.connect(limiter).connect(output).connect(ctx.destination);
  // Fade after the effects and limiter too: neither reverb nor delay crosses the seam.
  output.gain.setValueAtTime(0, 0);
  output.gain.linearRampToValueAtTime(1.5, 0.035);
  output.gain.setValueAtTime(1.5, FILM_SECONDS - 0.22);
  output.gain.linearRampToValueAtTime(0, FILM_SECONDS);

  let seed = 7183;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 0x100000000;
  };
  const noise = ctx.createBuffer(1, sampleRate * 2, sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;

  // A small, high-passed room gives depth without muddying the kick or bass.
  const room = ctx.createConvolver();
  const impulse = ctx.createBuffer(2, Math.ceil(sampleRate * 0.58), sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = (random() * 2 - 1) * Math.exp(-t * 12) * Math.min(1, t / 0.008);
    }
  }
  room.buffer = impulse;
  const roomHighpass = ctx.createBiquadFilter();
  roomHighpass.type = 'highpass';
  roomHighpass.frequency.value = 380;
  const roomLowpass = ctx.createBiquadFilter();
  roomLowpass.type = 'lowpass';
  roomLowpass.frequency.value = 4200;
  const roomReturn = ctx.createGain();
  roomReturn.gain.value = 0.16;
  music.connect(roomHighpass);
  effects.connect(roomHighpass);
  roomHighpass.connect(room).connect(roomLowpass).connect(roomReturn).connect(mix);

  const echoSend = ctx.createGain();
  echoSend.gain.value = 0.16;
  const echo = ctx.createDelay(0.5);
  echo.delayTime.value = 0.1875;
  const echoFilter = ctx.createBiquadFilter();
  echoFilter.type = 'lowpass';
  echoFilter.frequency.value = 2600;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;
  const echoPan = ctx.createStereoPanner();
  echoPan.pan.value = 0.38;
  echoSend.connect(echo).connect(echoFilter);
  echoFilter.connect(feedback).connect(echo);
  echoFilter.connect(echoPan).connect(mix);

  const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  const tone = (
    at: number,
    midi: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    pan = 0,
    bus: AudioNode = music,
    echoing = false,
    bend = 0,
  ) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const stereo = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(hz(midi + bend), at);
    if (bend) osc.frequency.exponentialRampToValueAtTime(hz(midi), at + duration * 0.65);
    filter.type = 'lowpass';
    filter.frequency.value = midi < 48 ? 650 : 4300;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.008, duration * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.9);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(filter).connect(gain).connect(stereo).connect(bus);
    if (echoing) stereo.connect(echoSend);
    osc.start(at);
    osc.stop(at + duration + 0.01);
  };
  const wash = (
    at: number,
    duration: number,
    volume: number,
    from: number,
    to: number,
    pan = 0,
    sweep = pan,
    attack = 0.1,
    bus: AudioNode = effects,
  ) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    const gain = ctx.createGain();
    const stereo = ctx.createStereoPanner();
    stereo.pan.setValueAtTime(pan, at);
    stereo.pan.linearRampToValueAtTime(sweep, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + duration * attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.96);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    source.connect(filter).connect(gain).connect(stereo).connect(bus);
    source.start(at, (at * 0.731) % 1.5);
    source.stop(at + duration);
  };
  const kick = (at: number, volume = 0.38) =>
    tone(at, 29, 0.25, volume, 'sine', 0, music, false, 22);
  const rim = (at: number, volume = 0.12) => {
    tone(at, 79, 0.045, volume, 'triangle', -0.13);
    tone(at + 0.003, 91, 0.027, volume * 0.3, 'sine', 0.13);
    wash(at, 0.075, volume * 0.75, 2200, 1300, 0, 0, 0.05, music);
  };
  const hat = (at: number, volume: number, pan: number) =>
    wash(at, 0.047, volume, 6800, 4200, pan, pan, 0.06, music);
  const bass = (at: number, midi: number, volume = 0.2, length = 0.23) => {
    tone(at, midi, length, volume, 'triangle');
    tone(at, midi - 12, length * 0.8, volume * 0.25);
  };
  const pluck = (at: number, midi: number, volume = 0.1, pan = 0) => {
    tone(at, midi, 0.38, volume, 'sine', pan, music, true);
    tone(at, midi + 12, 0.075, volume * 0.22, 'triangle', pan);
  };
  const chord = (at: number, notes: readonly number[], duration: number, volume: number) => {
    notes.forEach((midi, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.type = 'sine';
      osc.frequency.value = hz(midi);
      pan.pan.value = (i / Math.max(1, notes.length - 1) - 0.5) * 0.8;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.07);
      gain.gain.linearRampToValueAtTime(volume * 0.55, at + duration * 0.42);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      osc.connect(gain).connect(pan).connect(music);
      osc.start(at);
      osc.stop(at + duration + 0.01);
    });
  };
  const harmony = (at: number) => {
    if (at < 7) return { root: 38, notes: [62, 65, 69, 76] };
    if (at < 9) return { root: 34, notes: [62, 65, 69, 70] };
    if (at < 11) return { root: 36, notes: [60, 64, 67, 74] };
    if (at < 13) return { root: 33, notes: [61, 64, 67, 71] };
    if (at < 15) return { root: 38, notes: [62, 65, 69, 76] };
    if (at < 17) return { root: 41, notes: [60, 65, 69, 76] };
    if (at < 19) return { root: 43, notes: [62, 67, 71, 76] };
    if (at < 22) return { root: 33, notes: [61, 64, 67, 76] };
    if (at < 23.3) return { root: 38, notes: [62, 65, 69, 76] };
    if (at < 24.6) return { root: 34, notes: [62, 65, 69, 70] };
    if (at < 26) return { root: 36, notes: [60, 64, 67, 74] };
    return { root: 38, notes: [62, 65, 69, 74] };
  };

  // 120 BPM, syncopated bass and swung kitchen ticks; each scene changes the density.
  const groove = (start: number, end: number, energy: number, busy = false) => {
    for (let bar = start; bar < end; bar += 2) {
      const roots = harmony(bar);
      for (const offset of busy ? [0, 0.5, 0.875, 1.25, 1.75] : [0, 0.75, 1.25]) {
        if (bar + offset < end) kick(bar + offset, 0.31 * energy);
      }
      for (const offset of [0.5, 1.5]) {
        if (bar + offset < end) rim(bar + offset, 0.12 * energy);
      }
      [0, 0.375, 0.875, 1.25, 1.75].forEach((offset, i) => {
        if (bar + offset < end)
          bass(bar + offset, roots.root + (i === 2 ? 7 : i === 4 ? 12 : 0), 0.19 * energy);
      });
      for (let i = 0; i < (busy ? 16 : 8); i++) {
        const at = bar + i * (busy ? 0.125 : 0.25) + (i % 2 ? 0.018 : 0);
        if (at < end) hat(at, (i % 2 ? 0.038 : 0.024) * energy, i % 2 ? 0.35 : -0.35);
      }
      const melody = busy ? [0, 2, 1, 3, 2, 3] : [0, 2, 1];
      melody.forEach((degree, i) => {
        const at = bar + (busy ? 0.125 + i * 0.3 : 0.25 + i * 0.625);
        if (at < end) pluck(at, roots.notes[degree], 0.095 * energy, i % 2 ? 0.3 : -0.3);
      });
    }
  };

  // Macro tomato: space for the first gesture, then the brand lands with a short motif.
  chord(0, [50, 57, 64], 1.15, 0.04);
  wash(0.1, 0.9, 0.055, 400, 1600, -0.4, 0.4, 0.65);
  bass(0.05, 38, 0.1, 0.6);
  groove(2, 7, 0.8);
  groove(7, 11, 0.94);
  chord(2, harmony(2).notes, 1.35, 0.045);
  [62, 69, 76, 74].forEach((midi, i) => pluck(2 + i * 0.18, midi, 0.12, (i - 1.5) * 0.2));

  // The danger shot pulls the groove apart, then decelerates before the frenzy release.
  bass(11, 33, 0.17, 0.45);
  rim(11.05, 0.08);
  tone(11.5, 57, 0.3, 0.055, 'triangle', 0, music, true, -1);
  wash(11.9, 0.38, 0.25, 1100, 180, -0.15, 0.1, 0.03);
  tone(11.9, 26, 0.65, 0.32, 'sine', 0, effects, false, 19);
  [12.05, 12.23, 12.51].forEach((at, i) => {
    tone(at, 67 - i * 5, 0.12 + i * 0.04, 0.065, 'triangle', (i - 1) * 0.25);
  });
  wash(12.45, 0.55, 0.19, 380, 4200, -0.6, 0.6, 0.85);
  music.gain.setValueAtTime(0.72, 11.7);
  music.gain.linearRampToValueAtTime(0.38, 12.15);
  music.gain.setValueAtTime(0.38, 12.85);
  music.gain.linearRampToValueAtTime(0.76, 13);

  groove(13, 17, 1.08, true);
  chord(13, harmony(13).notes, 1.2, 0.07);
  wash(13, 0.42, 0.22, 5000, 500, 0.5, -0.5, 0.035);
  [74, 77, 81, 84].forEach((midi, i) => pluck(13 + i * 0.07, midi, 0.08, (i - 1.5) * 0.25));

  // Shield: the drums breathe and a rounded, ringing chord opens the space.
  bass(17, 43, 0.15, 0.65);
  kick(17, 0.2);
  chord(17.1, harmony(17).notes, 1.8, 0.045);
  [74, 79, 83, 86].forEach((midi, i) =>
    tone(18 + i * 0.045, midi, 0.95, 0.075, 'sine', (i - 1.5) * 0.24, effects, true),
  );
  wash(18, 0.7, 0.1, 1000, 3300, -0.6, 0.6, 0.06);

  // Stirring tightens the pulse and circles through the stereo field.
  groove(19, 22, 0.84);
  for (let at = 19, i = 0; at < 21.95; i++) {
    const progress = (at - 19) / 3;
    const pan = Math.sin(i * 1.2) * 0.65;
    wash(at, 0.12, 0.065 + progress * 0.025, 800 + progress * 900, 3200, pan, -pan, 0.22);
    if (i % 3 === 0) tone(at, 69 + (i % 5), 0.075, 0.045, 'sine', pan);
    at += 0.3 - progress * 0.19;
  }
  wash(21.45, 0.55, 0.15, 600, 3800, -0.45, 0.45, 0.8);

  // Three dishes, three distinct tonal landings, then a fuller version of the brand motif.
  [22, 23.3, 24.6].forEach((at, index) => {
    const notes = harmony(at).notes;
    kick(at, 0.24);
    bass(at, harmony(at).root, 0.17, 0.48);
    chord(at, notes, 1.15, 0.055);
    notes.slice(0, 3).forEach((midi, i) => pluck(at + i * 0.1, midi + 12, 0.07, (i - 1) * 0.35));
    tone(at, 87 + index * 2, 0.11, 0.07, 'sine', (index - 1) * 0.25, effects);
    wash(at, 0.1, 0.1, 2400, 900, 0, 0, 0.04);
    rim(at + 0.65, 0.07);
  });
  groove(26, 29.5, 0.9);
  chord(26, [50, 62, 65, 69, 74], 1.65, 0.055);
  [62, 69, 76, 74, 69, 74].forEach((midi, i) =>
    pluck(26 + i * 0.22, midi, 0.12, ((i % 3) - 1) * 0.25),
  );
  chord(28.5, [50, 57, 62, 65, 74], 1.3, 0.045);

  // The visible blade makes contact exactly at these editorial beats.
  const cuts = [1.2, 5.5, 7.5, 8.5, 9.5, 10.25, 13.5, 14, 14.5, 15, 15.5, 16, 16.5];
  cuts.forEach((at, i) => {
    const pan = i % 2 ? 0.48 : -0.48;
    wash(at - 0.065, 0.14, 0.22, 650, 4800, pan, -pan, 0.45);
    wash(at, 0.13, 0.19, 1700, 430, -pan * 0.5, 0, 0.03);
    tone(at, 51 + (i % 3) * 2, 0.09, 0.13, 'triangle', -pan * 0.3, effects, false, 7);
    if (at >= 13.5) tone(at + 0.02, 86 + (i % 4) * 2, 0.3, 0.045, 'sine', pan, effects, true);
  });

  // The final spiral carries the last chord into a light inhale for the opening macro.
  for (let i = 0; i < 9; i++) {
    const at = 29.5 + i * 0.22;
    const pan = Math.sin(i * 1.4) * 0.7;
    tone(
      at,
      [86, 81, 77, 74, 69, 65, 62, 57, 50][i],
      0.38,
      0.065 - i * 0.004,
      'sine',
      pan,
      music,
      true,
    );
    wash(at, 0.21, 0.045, 2800 - i * 180, 800, pan, -pan, 0.3);
  }
  bass(29.5, 38, 0.14, 0.7);
  wash(31.2, 0.72, 0.065, 350, 1700, -0.35, 0.35, 0.72);

  const rendered = await ctx.startRendering();
  // Preserve dynamics while leaving encoding headroom if a browser's compressor differs.
  let peak = 0;
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    const data = rendered.getChannelData(channel);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0.9) {
    const scale = 0.9 / peak;
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      const data = rendered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
  return rendered;
}
