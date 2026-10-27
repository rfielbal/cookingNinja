import assert from 'node:assert/strict';
import test from 'node:test';
import { KitchenAudio, type AudioKind } from '../src/game/audio';
import {
  KITCHEN_SAMPLES,
  loadKitchenSamples,
  type KitchenSampleBank,
  type KitchenSampleLoader,
} from '../src/game/kitchen-samples';
import { readFileSync } from 'node:fs';

const noSamples: KitchenSampleLoader = async () => ({});

class Param {
  value = 0;
  calls: { method: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: 'exponential', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.calls.push({ method: 'target', value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.calls.push({ method: 'cancel', value: 0, time });
    return this;
  }
}
class Node {
  links: Node[] = [];
  disconnected = false;
  connect(node: Node) {
    this.links.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Gain extends Node {
  gain = new Param();
}
class Source extends Node {
  frequency = new Param();
  playbackRate = new Param();
  buffer?: { duration: number };
  loop = false;
  type = 'sine';
  kind: 'buffer' | 'oscillator' = 'buffer';
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  constructor(private clock: FakeContext) {
    super();
  }
  start(time = 0) {
    this.starts.push(time);
  }
  stop(time = this.clock.currentTime) {
    this.stops.push(time);
  }
}
class FakeContext {
  currentTime = 0;
  sampleRate = 1000;
  state = 'running';
  destination = new Node();
  onstatechange: (() => void) | null = null;
  sources: Source[] = [];
  gains: Gain[] = [];
  buffers = 0;
  resumes = 0;
  closes = 0;
  deferResume = false;
  rejectResume = false;
  finishResume: (() => void) | undefined;
  createGain() {
    const node = new Gain();
    this.gains.push(node);
    return node;
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(), {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    });
  }
  createStereoPanner() {
    return Object.assign(new Node(), { pan: new Param() });
  }
  createBiquadFilter() {
    return Object.assign(new Node(), { type: 'lowpass', Q: new Param(), frequency: new Param() });
  }
  createBufferSource() {
    const node = new Source(this);
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    const source = this.createBufferSource();
    source.kind = 'oscillator';
    return source;
  }
  createBuffer(_channels: number, frames: number, rate: number) {
    this.buffers++;
    const data = new Float32Array(frames);
    return { duration: frames / rate, getChannelData: () => data };
  }
  resume() {
    this.resumes++;
    if (this.rejectResume) return Promise.reject(new Error('Activation required'));
    if (this.deferResume)
      return new Promise<void>((resolve) => {
        this.finishResume = () => {
          this.state = 'running';
          resolve();
        };
      });
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closes++;
    this.state = 'closed';
    return Promise.resolve();
  }
  get live() {
    return this.sources.filter((source) => !source.disconnected);
  }
}
class Page extends EventTarget {
  hidden = false;
  visibility(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
function rig(loader: KitchenSampleLoader = noSamples) {
  const context = new FakeContext(),
    page = new Page();
  let created = 0;
  const audio = new KitchenAudio(
    () => {
      created++;
      return context as unknown as AudioContext;
    },
    page as unknown as Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
    loader,
  );
  return { context, page, audio, created: () => created };
}

test('aucun contexte avant unlock, mute annule aussi les notes futures sans replay', () => {
  const { audio, context, created } = rig();
  audio.play('win');
  audio.slash();
  audio.setPhase('playing');
  assert.equal(created(), 0);
  audio.unlock();
  audio.play('win');
  assert.ok(context.sources.some((source) => source.starts[0] > context.currentTime));
  audio.muted = true;
  assert.equal(context.live.length, 0);
  assert.ok(context.sources.every((source) => source.stops.includes(context.currentTime)));
  const before = context.sources.length;
  audio.play('heal');
  audio.slash();
  assert.equal(context.sources.length, before);
  audio.muted = false;
  assert.equal(context.sources.length, before, 'aucune ambiance ni aucun ancien son au démutage');
  audio.dispose();
});

test('une permission asynchrone ne réveille pas des événements rejetés ou un son coupé', async () => {
  const { audio, context } = rig();
  context.state = 'suspended';
  context.deferResume = true;
  audio.setPhase('playing');
  audio.unlock();
  audio.play('start');
  audio.muted = true;
  context.finishResume?.();
  await Promise.resolve();
  assert.equal(context.sources.length, 0);
  audio.muted = false;
  assert.equal(context.sources.length, 0, 'le démutage reste silencieux');
  audio.dispose();
});

test('pause et arrière-plan coupent toutes les voix, aucun resume hors geste utilisateur', () => {
  const { audio, context, page } = rig();
  audio.unlock();
  audio.setPhase('playing');
  audio.play('danger');
  audio.setPhase('paused');
  assert.equal(context.live.length, 0);
  const before = context.sources.length;
  audio.play('good');
  assert.equal(context.sources.length, before);
  audio.setPhase('playing');
  page.visibility(true);
  assert.equal(context.live.length, 0);
  audio.play('shield');
  page.visibility(false);
  assert.equal(context.live.length, 0);
  assert.equal(context.resumes, 1, 'seul unlock a appelé resume');
  audio.dispose();
});

test('le mélange produit des impulsions finies et exige de nouveaux gestes après unmute', () => {
  const { audio, context } = rig();
  audio.unlock();
  audio.setPhase('mixing');
  assert.equal(context.sources.length, 0, 'entrer en mélange ne joue aucun fond');
  audio.setMix(0);
  assert.equal(context.sources.length, 0);
  audio.setMix(0.8);
  const first = context.sources.length;
  assert.ok(first > 0);
  assert.ok(context.sources.every((source) => !source.loop && source.stops[0] <= 0.14));
  context.currentTime = 0.03;
  audio.setMix(0.8);
  assert.equal(
    context.sources.length,
    first,
    'la cadence dépend du geste, pas du nombre de frames',
  );
  audio.setMix(0);
  assert.equal(context.live.length, 0, 'un geste arrêté coupe les frottements');
  audio.setMix(0.8);
  audio.muted = true;
  const before = context.sources.length;
  audio.muted = false;
  assert.equal(context.sources.length, before, 'aucune énergie antérieure rejouée');
  assert.equal(context.live.length, 0);
  audio.setMix(0.8);
  assert.ok(context.sources.length > before);
  audio.setPhase('result');
  assert.equal(context.live.length, 0, 'les contacts du bol cessent au résultat');
  audio.dispose();
});

test('rafales bornées à 24 sources, buffers réutilisés et nettoyage des voix', () => {
  const { audio, context } = rig();
  audio.unlock();
  audio.setPhase('playing');
  const kinds: AudioKind[] = [
    'win',
    'heal',
    'shield',
    'rush',
    'focus-start',
    'focus-end',
    'rare-reveal',
  ];
  for (let round = 0; round < 3; round++) {
    for (const kind of kinds) {
      context.currentTime += 0.15;
      audio.play(kind);
      assert.ok(context.live.length <= 24);
    }
  }
  assert.ok(
    context.buffers <= KITCHEN_SAMPLES.length,
    'un fallback par texture, jamais par événement',
  );
  assert.ok(context.sources.some((source) => source.disconnected));
  const ended = context.live.find((source) => !source.loop)!;
  ended.onended?.();
  assert.equal(ended.disconnected, true);
  audio.dispose();
  assert.equal(context.live.length, 0);
});

test('result laisse finir l’impact, stop et dispose empêchent toute ambiance résiduelle', async () => {
  const { audio, context, page } = rig();
  audio.unlock();
  audio.setPhase('playing');
  audio.play('danger');
  const impact = context.live.filter((source) => !source.loop);
  audio.setPhase('result');
  assert.ok(impact.every((source) => !source.disconnected));
  assert.ok(context.live.every((source) => !source.loop));
  audio.play('lose');
  audio.stop();
  assert.equal(context.live.length, 0);
  page.visibility(false);
  assert.equal(context.live.length, 0);
  audio.dispose();
  await Promise.resolve();
  audio.unlock();
  audio.play('start');
  audio.setPhase('playing');
  assert.equal(context.closes, 1);
  assert.equal(context.live.length, 0);
});

test('les coups de lame trop rapprochés ne créent pas une accumulation sonore', () => {
  const { audio, context } = rig();
  audio.unlock();
  audio.setPhase('ready');
  audio.slash(0.5);
  const first = context.sources.length;
  context.currentTime = 0.02;
  audio.slash(1);
  assert.equal(context.sources.length, first);
  context.currentTime = 0.1;
  audio.slash(1);
  assert.ok(context.sources.length > first);
  audio.dispose();
});

test('un départ distant reste locked ; un test explicite attend la vraie reprise', async () => {
  const { audio, context, created } = rig();
  context.state = 'suspended';
  context.deferResume = true;
  audio.setPhase('countdown');
  audio.play('start');
  assert.equal(created(), 0);
  assert.equal(audio.getStatus(), 'locked');

  const statuses: string[] = [];
  const unsubscribe = audio.subscribe(() => statuses.push(audio.getStatus()));
  const check = audio.test();
  assert.equal(context.resumes, 1, 'resume est appelé dans le handler, avant toute promesse');
  assert.equal(audio.getStatus(), 'suspended');
  assert.equal(context.sources.length, 0, 'aucun bip avant le déverrouillage');
  audio.play('countdown', { step: 3 });
  context.finishResume?.();
  assert.equal(await check, true);
  assert.equal(audio.getStatus(), 'running');
  assert.equal(context.sources.length, 2, 'seul le test demandé est émis, aucun ancien son');
  assert.deepEqual(statuses, ['suspended', 'running']);
  unsubscribe();
  audio.muted = true;
  assert.deepEqual(statuses, ['suspended', 'running']);
  audio.dispose();
});

test('le test sonore fonctionne en pause et un mute/stop/onglet masqué annule un test pending', async () => {
  for (const action of ['mute', 'stop', 'hidden', 'dispose'] as const) {
    const { audio, context, page } = rig();
    context.state = 'suspended';
    context.deferResume = true;
    audio.setPhase('paused');
    const check = audio.test();
    if (action === 'mute') {
      audio.muted = true;
      audio.muted = false;
    } else if (action === 'stop') audio.stop();
    else if (action === 'hidden') {
      page.visibility(true);
      page.visibility(false);
    } else audio.dispose();
    context.finishResume?.();
    assert.equal(await check, false, action);
    assert.equal(context.sources.length, 0, action);
    audio.dispose();
  }

  const { audio, context } = rig();
  audio.setPhase('paused');
  assert.equal(await audio.test(), true);
  assert.equal(context.sources.length, 2);
  audio.play('good');
  assert.equal(context.sources.length, 2, 'le test ne relance pas le gameplay en pause');
  audio.dispose();
});

test('interruption Safari observable, voix arrêtées, reprise uniquement à un nouveau geste', async () => {
  const { audio, context, page } = rig();
  await audio.unlock();
  audio.setPhase('playing');
  audio.play('win');
  context.state = 'interrupted';
  context.onstatechange?.();
  assert.equal(audio.getStatus(), 'interrupted');
  assert.equal(context.live.length, 0);
  page.visibility(false);
  assert.equal(context.resumes, 1);
  const before = context.sources.length;
  audio.play('heal');
  assert.equal(context.sources.length, before);
  assert.equal(await audio.unlock(), true);
  assert.equal(context.resumes, 2);
  assert.equal(audio.getStatus(), 'running');
  assert.equal(context.live.length, 0, 'la reprise ne relance aucun fond');
  audio.dispose();
});

test('création refusée ou contexte fermé peuvent être réparés par une nouvelle activation', async () => {
  const first = new FakeContext(),
    second = new FakeContext();
  let attempts = 0;
  const audio = new KitchenAudio(
    () => {
      if (++attempts === 1) throw new Error('Unavailable');
      return (attempts === 2 ? first : second) as unknown as AudioContext;
    },
    undefined,
    noSamples,
  );
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.getStatus(), 'unavailable');
  assert.equal(await audio.unlock(), true);
  audio.play('select');
  first.state = 'closed';
  first.onstatechange?.();
  assert.equal(audio.getStatus(), 'unavailable');
  assert.equal(first.live.length, 0);
  assert.equal(await audio.test(), true);
  assert.equal(attempts, 3);
  assert.equal(first.onstatechange, null);
  assert.equal(second.sources.length, 2);
  audio.dispose();
});

test('resume rejeté ne donne pas de faux succès ; un nouvel essai recrée le contexte', async () => {
  const denied = new FakeContext(),
    allowed = new FakeContext();
  denied.state = 'suspended';
  denied.rejectResume = true;
  let created = 0;
  const audio = new KitchenAudio(
    () => (++created === 1 ? denied : allowed) as unknown as AudioContext,
    undefined,
    noSamples,
  );
  assert.equal(await audio.test(), false);
  assert.equal(audio.getStatus(), 'suspended');
  assert.equal(denied.sources.length, 0);
  assert.equal(await audio.test(), true);
  assert.equal(denied.closes, 1);
  assert.equal(allowed.sources.length, 2);
  audio.dispose();
});

test('resume bloqué expire et ne joue jamais le test tardivement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stuck = new FakeContext(),
    fresh = new FakeContext();
  stuck.state = 'interrupted';
  stuck.deferResume = true;
  let created = 0;
  const audio = new KitchenAudio(
    () => (++created === 1 ? stuck : fresh) as unknown as AudioContext,
    undefined,
    noSamples,
  );
  const check = audio.test();
  t.mock.timers.tick(1200);
  assert.equal(await check, false);
  assert.equal(audio.getStatus(), 'interrupted');
  assert.equal(stuck.sources.length, 0);
  assert.equal(await audio.test(), true);
  assert.equal(created, 2);
  assert.equal(stuck.closes, 1);
  const before = fresh.sources.length;
  stuck.finishResume?.();
  await Promise.resolve();
  assert.equal(fresh.sources.length, before, 'le vieux resume ne déclenche rien');
  audio.dispose();
});

test('un ancien resume sans activation ne défait pas la réussite du clic suivant', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { audio, context, created } = rig();
  context.state = 'suspended';
  context.deferResume = true;
  const oldAttempt = audio.unlock();
  context.deferResume = false;
  assert.equal(await audio.unlock(), true);
  t.mock.timers.tick(1200);
  assert.equal(await oldAttempt, false);
  assert.equal(await audio.unlock(), true);
  assert.equal(created(), 1, 'pas de remplacement inutile du contexte maintenant actif');
  assert.equal(context.closes, 0);
  audio.dispose();
});

test('phases et événements restent silencieux ; les bruitages du jeu ne sont pas des oscillateurs', async () => {
  const { audio, context, page } = rig();
  await audio.unlock();
  for (const phase of ['countdown', 'playing', 'mixing', 'result'] as const) audio.setPhase(phase);
  for (const event of ['rush', 'slow', 'focus', 'normal'] as const) audio.setEvent(event);
  audio.setRecipe('cake');
  page.visibility(true);
  page.visibility(false);
  assert.equal(context.sources.length, 0);
  audio.setPhase('playing');
  for (const kind of ['good', 'danger', 'shield', 'heal', 'win', 'countdown', 'rush'] as const) {
    audio.play(kind, { food: 'tomato', step: 1 });
    assert.ok(context.live.every((source) => !source.loop && source.kind === 'buffer'));
  }
  audio.dispose();
});

test('chargement local tardif ne rejoue rien et les prochaines coupes utilisent les samples', async () => {
  let finish!: (bank: KitchenSampleBank) => void;
  const { audio, context } = rig(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await audio.unlock();
  audio.setPhase('playing');
  audio.play('good', { food: 'tomato' });
  const before = context.sources.length;
  const chop = { duration: 0.2 } as AudioBuffer;
  audio.muted = true;
  finish({ chop });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.sources.length, before);
  audio.muted = false;
  assert.equal(context.sources.length, before);
  context.currentTime = 1;
  audio.play('good', { food: 'tomato' });
  assert.ok(context.sources.slice(before).some((source) => source.buffer === chop));
  audio.dispose();
});

test('un contexte remplacé annule son chargement et ignore sa résolution tardive', async () => {
  const first = new FakeContext(),
    second = new FakeContext();
  let created = 0;
  const pending: { resolve: (bank: KitchenSampleBank) => void; signal: AbortSignal }[] = [];
  const audio = new KitchenAudio(
    () => (++created === 1 ? first : second) as unknown as AudioContext,
    undefined,
    (_ctx, signal) =>
      new Promise((resolve) => {
        pending.push({ resolve, signal });
      }),
  );
  await audio.unlock();
  first.state = 'closed';
  await audio.unlock();
  assert.equal(pending[0].signal.aborted, true);
  const old = { duration: 0.1 } as AudioBuffer,
    fresh = { duration: 0.2 } as AudioBuffer;
  pending[1].resolve({ chop: fresh });
  pending[0].resolve({ chop: old });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.sources.length, 0);
  audio.setPhase('playing');
  audio.play('good');
  assert.ok(second.sources.some((source) => source.buffer === fresh));
  assert.ok(second.sources.every((source) => source.buffer !== old));
  audio.dispose();
  assert.equal(pending[1].signal.aborted, true);
});

test('chargement refusé conserve des impacts courts sans boucle ni promesse rejetée', async () => {
  const { audio, context } = rig(async () => {
    throw new Error('Offline');
  });
  await audio.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  audio.setPhase('playing');
  audio.play('good', { food: 'lettuce' });
  assert.ok(context.sources.length > 0);
  assert.ok(context.sources.every((source) => !source.loop && source.stops[0] < 0.3));
  audio.dispose();
});

test('samples servis localement : un fichier manquant ne bloque pas les autres', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    return {
      ok: !url.endsWith('pot.wav'),
      arrayBuffer: async () => new ArrayBuffer(4),
    } as Response;
  });
  const context = { decodeAudioData: async () => ({ duration: 0.1 }) } as unknown as AudioContext;
  const samples = await loadKitchenSamples(context, new AbortController().signal);
  assert.equal(Object.keys(samples).length, KITCHEN_SAMPLES.length - 1);
  assert.equal(samples.pot, undefined);
  assert.ok(requests.every((url) => url.startsWith('/audio/kitchen/')));
});

test('WAV locaux PCM mono courts, sans saturation et avec extrémités silencieuses', () => {
  let bytes = 0;
  for (const id of KITCHEN_SAMPLES) {
    const wav = readFileSync(new URL(`../public/audio/kitchen/${id}.wav`, import.meta.url));
    bytes += wav.length;
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF', id);
    assert.equal(wav.readUInt16LE(20), 1, 'PCM');
    assert.equal(wav.readUInt16LE(22), 1, 'mono');
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readInt16LE(44), 0, id);
    assert.equal(wav.readInt16LE(wav.length - 2), 0, id);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 24000, `${id}: signal utile sans saturation`);
    assert.ok((wav.length - 44) / (44100 * 2) <= 0.5);
  }
  assert.ok(bytes < 250000, 'petite banque embarquée');
});
