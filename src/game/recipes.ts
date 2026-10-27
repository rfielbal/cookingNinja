export const FOODS = {
  bread: { name: 'Pain', emoji: '🍞' },
  patty: { name: 'Steak', emoji: '🥩' },
  cheese: { name: 'Fromage', emoji: '🧀' },
  lettuce: { name: 'Salade', emoji: '🥬' },
  tomato: { name: 'Tomate', emoji: '🍅' },
  onion: { name: 'Oignon', emoji: '🧅' },
  tortilla: { name: 'Tortilla', emoji: '🫓' },
  chicken: { name: 'Poulet', emoji: '🍗' },
  avocado: { name: 'Avocat', emoji: '🥑' },
  flour: { name: 'Farine', emoji: '🌾' },
  egg: { name: 'Œuf', emoji: '🥚' },
  strawberry: { name: 'Fraise', emoji: '🍓' },
  chocolate: { name: 'Chocolat', emoji: '🍫' },
  fish: { name: 'Poisson', emoji: '🐟' },
  chili: { name: 'Piment', emoji: '🌶️' },
  broccoli: { name: 'Brocoli', emoji: '🥦' },
} as const;
export type FoodKind = keyof typeof FOODS;
export type RecipeId = 'burger' | 'tacos' | 'cake';
export interface Recipe {
  id: RecipeId;
  name: string;
  subtitle: string;
  category: string;
  difficulty: string;
  color: string;
  ingredients: FoodKind[];
  traps: FoodKind[];
  goal: number;
  spawnInterval: number;
  description: string;
}
export const RECIPES: Recipe[] = [
  {
    id: 'burger',
    name: 'Le Ninja Burger',
    subtitle: 'Un classique. Des gestes de maître.',
    category: 'STREET FOOD',
    difficulty: 'Facile',
    color: '#eee3c8',
    ingredients: ['bread', 'patty', 'cheese', 'lettuce', 'tomato'],
    traps: ['fish', 'chili', 'strawberry'],
    goal: 3,
    spawnInterval: 1.1,
    description: 'Pain moelleux, steak grillé, fromage fondant… Le premier pas vers la légende.',
  },
  {
    id: 'tacos',
    name: 'Tacos Loco',
    subtitle: 'Un aller simple pour le Mexique.',
    category: 'ESCALE ÉPICÉE',
    difficulty: 'Intermédiaire',
    color: '#dfe7cf',
    ingredients: ['tortilla', 'chicken', 'avocado', 'tomato', 'onion'],
    traps: ['chocolate', 'fish', 'strawberry'],
    goal: 4,
    spawnInterval: 0.95,
    description: 'Une tortilla, du poulet, de l’avocat et des légumes. Gardez le rythme !',
  },
  {
    id: 'cake',
    name: 'Choco Sensei',
    subtitle: 'La douceur demande de la précision.',
    category: 'DOUCE VICTOIRE',
    difficulty: 'Difficile',
    color: '#efdbd4',
    ingredients: ['flour', 'egg', 'chocolate', 'strawberry'],
    traps: ['chili', 'broccoli', 'fish'],
    goal: 5,
    spawnInterval: 0.82,
    description: 'Un gâteau au chocolat et aux fraises. Les piments ne sont pas invités.',
  },
];
