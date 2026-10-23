export type AtelierStep = 'gesture' | 'network' | 'flight' | 'slice' | 'mix' | 'result';

export interface AtelierSlide {
  id: AtelierStep;
  label: string;
  eyebrow: string;
  title: string;
  lead: string;
  takeaway: string;
  codeTitle: string;
  codeKind: 'extrait' | 'simplifié';
  code: string;
  files: string[];
  explanation: string;
}

export const ATELIER_SLIDES: readonly AtelierSlide[] = [
  {
    id: 'gesture',
    label: 'Le geste',
    eyebrow: '01 · DANS VOTRE MAIN',
    title: 'Votre téléphone devient une lame',
    lead: 'Inclinez le téléphone pour viser. Un petit mouvement vif déclenche la coupe ; le jeu mesure des angles, sans suivre votre main dans la pièce.',
    takeaway: 'Incliner pour viser, accélérer le geste pour couper.',
    codeTitle: 'Transformer l’inclinaison',
    codeKind: 'extrait',
    code: `const horizontal = neutral(angleDelta(gamma, this.anchor.gamma));
const vertical = neutral(angleDelta(beta, this.anchor.beta));`,
    files: ['src/motion.ts', 'src/Controller.tsx'],
    explanation:
      'Après le centrage, les angles sont comparés à la position de départ. Le gyroscope aide à reconnaître une rotation rapide accompagnée d’un déplacement de la visée.',
  },
  {
    id: 'network',
    label: 'La connexion',
    eyebrow: '02 · LE LIEN AVEC LE PC',
    title: 'Un QR code relie les deux écrans',
    lead: 'Scannez le QR code : votre téléphone rejoint la bonne partie. Il transmet ensuite vos gestes au PC pendant que la connexion reste ouverte.',
    takeaway: 'Le QR choisit la partie, la connexion transporte les gestes.',
    codeTitle: 'Envoyer le geste · version simplifiée',
    codeKind: 'simplifié',
    code: `const geste = { type: 'input', x, y, slash };
if (connexion.readyState === WebSocket.OPEN) {
  connexion.send(JSON.stringify(geste));
}`,
    files: ['src/Controller.tsx', 'server/relay.ts'],
    explanation:
      'Le QR contient l’adresse et le code du salon. WebSocket garde la connexion ouverte ; le serveur vérifie les messages puis les transmet au PC associé.',
  },
  {
    id: 'flight',
    label: 'Les aliments',
    eyebrow: '03 · À L’ÉCRAN',
    title: 'Les ingrédients prennent leur envol',
    lead: 'Pain, tomates et pièges sont dessinés en volume. Ils montent, tournent puis retombent, comme des objets lancés dans une cuisine imaginaire.',
    takeaway: 'Des volumes, une vitesse et la gravité créent le mouvement.',
    codeTitle: 'Faire retomber un ingrédient',
    codeKind: 'extrait',
    code: `food.velocity.y -= 4.9 * flightDt;
food.object.position.addScaledVector(food.velocity, flightDt);`,
    files: ['src/game/food.ts', 'src/game/Scene.ts'],
    explanation:
      'Chaque aliment possède un modèle 3D, une position et une vitesse. À chaque image, le jeu applique la gravité puis déplace le modèle.',
  },
  {
    id: 'slice',
    label: 'La découpe',
    eyebrow: '04 · LE JEU DÉCIDE',
    title: 'Votre lame traverse : le jeu vérifie',
    lead: 'La lame doit croiser un aliment. Bon ingrédient : la recette avance. Mauvais aliment : un cœur perdu, sauf si le bouclier vous protège.',
    takeaway: 'Trois cœurs à préserver, les bons ingrédients à viser.',
    codeTitle: 'Couper un aliment · logique simplifiée',
    codeKind: 'simplifié',
    code: `si la lame croise un aliment :
  si ingrédient attendu : ajouter points et ingrédient
  sinon si bouclier actif : protéger les cœurs
  sinon : retirer une vie`,
    files: ['src/game/Scene.ts', 'src/game/engine.ts'],
    explanation:
      'Cet exemple résume les aliments ordinaires. Le trajet de la lame décide du contact ; les règles vérifient ensuite la recette, les points et le bouclier.',
  },
  {
    id: 'mix',
    label: 'Le mélange',
    eyebrow: '05 · LA TOUCHE FINALE',
    title: 'Huit secondes pour finir la recette',
    lead: 'Les ingrédients sont réunis : faites de petits cercles pendant huit secondes. Vos mouvements remplissent la jauge ; un mélange suffisant permet de réussir le plat.',
    takeaway: 'Des gestes réguliers remplissent la jauge.',
    codeTitle: 'Décider du résultat du mélange',
    codeKind: 'extrait',
    code: `if (s.mix >= 0.35) {
  s.score += Math.round(s.mix * 500);
  this.finish('won');
} else this.finish('mix');`,
    files: ['src/game/engine.ts', 'src/motion.ts'],
    explanation:
      'À la fin des huit secondes, la jauge doit atteindre au moins 35 %. Plus elle est remplie, plus le bonus de score est élevé.',
  },
  {
    id: 'result',
    label: 'Le résultat',
    eyebrow: '06 · LE DÉFI DU STAND',
    title: 'Votre recette laisse une trace',
    lead: 'Le résultat affiche votre score. Les recettes réussies et enregistrées rejoignent le classement général et celui de la recette, pour comparer les essais du stand.',
    takeaway: 'Un pseudo, un score, un nouveau défi à relever.',
    codeTitle: 'Retrouver le classement',
    codeKind: 'extrait',
    code: `const query = new URLSearchParams({ scope: 'all-time' });
if (recipeId !== 'all') query.set('recipeId', recipeId);
if (highlightEntryId) query.set('highlightEntryId', highlightEntryId);
return request<Scoreboard>(\`/api/leaderboard?\${query}\`);`,
    files: ['src/stand.ts', 'server/stand-store.ts'],
    explanation:
      'Le PC calcule le score ; le serveur conserve les résultats acceptés. Seules les recettes réussies sont classées. Une partie libre reste hors classement.',
  },
];
