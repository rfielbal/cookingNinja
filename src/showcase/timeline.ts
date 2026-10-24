export const FILM_WIDTH = 1920;
export const FILM_HEIGHT = 1080;
export const FILM_SECONDS = 32;
export const FILM_FPS = 30;

// These are editing cues, not gameplay states or recorded scores.
export const FILM_SHOTS = [
  { at: 0, end: 2, id: 'hook', label: 'Dans l’action' },
  { at: 2, end: 4, id: 'brand', label: 'Explosion du burger' },
  { at: 4, end: 7, id: 'gesture', label: 'Le téléphone devient lame' },
  { at: 7, end: 11, id: 'slice', label: 'Enchaînement des coupes' },
  { at: 11, end: 13, id: 'danger', label: 'Le piège' },
  { at: 13, end: 17, id: 'frenzy', label: 'Frénésie et rare' },
  { at: 17, end: 19, id: 'shield', label: 'Le bouclier' },
  { at: 19, end: 22, id: 'mix', label: 'Le tourbillon' },
  { at: 22, end: 26, id: 'dishes', label: 'Trois plats, trois plans' },
  { at: 26, end: 29.5, id: 'finale', label: 'Venez jouer' },
  { at: 29.5, end: 32, id: 'loop', label: 'Retour dans l’action' },
] as const;
export const FILM_IMPACTS = [
  1.2, 2, 5.5, 7.5, 8.5, 9.5, 10.25, 11.9, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 18, 22, 23.3,
  24.6, 26,
];

export function filmTime(time: number): number {
  return Number.isFinite(time) ? ((time % FILM_SECONDS) + FILM_SECONDS) % FILM_SECONDS : 0;
}
export function filmShot(time: number) {
  const t = filmTime(time);
  const index = FILM_SHOTS.findIndex((shot) => t >= shot.at && t < shot.end);
  return { ...FILM_SHOTS[index], index, local: t - FILM_SHOTS[index].at, time: t };
}
export const clamp = (t: number) => Math.max(0, Math.min(1, t));
export const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 4;
export const punch = (t: number) => (t < 0 ? 0 : Math.sin(t * 24) * Math.exp(-t * 9));
