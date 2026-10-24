export const FILM_WIDTH = 1920;
export const FILM_HEIGHT = 1080;
export const FILM_SECONDS = 32;
export const FILM_FPS = 30;

export const FILM_SHOTS = [
  {
    at: 0,
    end: 4,
    label: 'CookingNinja',
    lines: ['LA CUISINE', 'ENTRE EN JEU.'],
    caption: 'Un jeu à partager. Un geste à tenter.',
  },
  {
    at: 4,
    end: 9,
    label: 'Le geste',
    lines: ['VOTRE TÉLÉPHONE.', 'VOTRE LAME.'],
    caption: 'Bougez. Visez. Tranchez.',
  },
  {
    at: 9,
    end: 14,
    label: 'La découpe',
    lines: ['LES BONS', 'INGRÉDIENTS.', 'LE BON GESTE.'],
    caption: 'Trois cœurs. Gardez-les précieusement.',
  },
  {
    at: 14,
    end: 18,
    label: 'La frénésie',
    lines: ['ET SOUDAIN…', 'ÇA S’EMBALLE.'],
    caption: 'Frénésie · boucliers · défis rares',
  },
  {
    at: 18,
    end: 23,
    label: 'Le mélange',
    lines: ['TOURNEZ.', 'C’EST PRESQUE', 'PRÊT.'],
    caption: 'Un dernier tour de main.',
  },
  {
    at: 23,
    end: 27,
    label: 'Le défi',
    lines: ['3 RECETTES. UN RECORD À BATTRE.'],
    caption: 'Burger · tacos · gâteau',
  },
  {
    at: 27,
    end: 32,
    label: 'À vous de jouer',
    lines: ['À VOUS', 'DE JOUER.'],
    caption: 'Testez le jeu. Découvrez ses coulisses.',
  },
] as const;

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
