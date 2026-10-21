export type BladeId = 'citrus' | 'mint' | 'berry';

export interface Blade {
  id: BladeId;
  name: string;
  description: string;
  color: string;
  glow: string;
}

export const BLADES: readonly Blade[] = [
  {
    id: 'citrus',
    name: 'Zeste',
    description: 'Une lame solaire aux reflets d’agrumes.',
    color: '#ffb45f',
    glow: '#ffe0ad',
  },
  {
    id: 'mint',
    name: 'Menthe',
    description: 'Une traînée fraîche et lumineuse.',
    color: '#80f5c1',
    glow: '#c0ffe4',
  },
  {
    id: 'berry',
    name: 'Prune',
    description: 'Une touche violette pour chaque découpe.',
    color: '#d7a2ff',
    glow: '#efdbff',
  },
];

export const DEFAULT_BLADE: BladeId = 'citrus';

export function isBladeId(value: unknown): value is BladeId {
  return value === 'citrus' || value === 'mint' || value === 'berry';
}
