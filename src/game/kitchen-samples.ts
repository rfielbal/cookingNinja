/** Local Kenney CC0 foley; provenance and original licences live beside the WAVs. */
export const KITCHEN_SAMPLES = [
  'chop',
  'slice-a',
  'slice-b',
  'rustle',
  'wood-a',
  'wood-b',
  'thud',
  'plate',
  'glass',
  'pot',
] as const;
export type KitchenSample = (typeof KITCHEN_SAMPLES)[number];
export type KitchenSampleBank = Partial<Record<KitchenSample, AudioBuffer>>;
export type KitchenSampleLoader = (
  context: AudioContext,
  signal: AbortSignal,
) => Promise<KitchenSampleBank>;

/** Missing/undecodable files degrade independently; loading never emits or queues a cue. */
export const loadKitchenSamples: KitchenSampleLoader = async (context, signal) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 5000);
  const bank: KitchenSampleBank = {};
  try {
    await Promise.allSettled(
      KITCHEN_SAMPLES.map(async (id) => {
        const response = await fetch(`/audio/kitchen/${id}.wav`, { signal: controller.signal });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        const buffer = await context.decodeAudioData(bytes);
        if (!controller.signal.aborted && buffer.duration > 0 && buffer.duration <= 1)
          bank[id] = buffer;
      }),
    );
    return bank;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};

/** Short percussive fallback, used only before/without local samples. Never a noise loop. */
export function makeKitchenFallback(context: AudioContext, id: KitchenSample): AudioBuffer {
  const index = KITCHEN_SAMPLES.indexOf(id);
  const metallic = id === 'plate' || id === 'glass' || id === 'pot';
  const soft = id === 'thud' || id === 'rustle';
  const length = metallic ? 0.28 : id.startsWith('slice') ? 0.09 : 0.13;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * length),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  let seed = 9137 + index * 419,
    low = 0;
  const frequency = metallic ? 680 + index * 63 : soft ? 115 : 230;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const white = (seed >>> 0) / 0x80000000 - 1;
    low = low * 0.68 + white * 0.32;
    const t = i / context.sampleRate;
    const envelope = Math.min(1, t / 0.002) * Math.exp(-t * (metallic ? 16 : 38));
    const grain = soft ? low : white * 0.6 + low * 0.4;
    const body = Math.sin(t * frequency * Math.PI * 2) * Math.exp(-t * 40);
    const ring = metallic ? Math.sin(t * frequency * 2.73 * Math.PI * 2) * 0.16 : 0;
    data[i] =
      (grain * (metallic ? 0.12 : 0.5) + body * 0.22 + ring) *
      envelope *
      Math.min(1, (data.length - 1 - i) / (context.sampleRate * 0.012));
  }
  return buffer;
}
