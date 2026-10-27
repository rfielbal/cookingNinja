import { CUT_SECONDS, MIX_SECONDS } from './game/engine';

export type AtelierStep = 'gesture' | 'network' | 'flight' | 'slice' | 'mix' | 'result';

export interface AtelierCodeStep {
  label: string;
  /** One-based line numbers in the slide's displayed code. */
  lines: number[];
  explanation: string;
  visual: string;
}

export interface AtelierSlide {
  id: AtelierStep;
  label: string;
  eyebrow: string;
  title: string;
  lead: string;
  takeaway: string;
  codeTitle: string;
  codeKind: 'extrait' | 'simplifié';
  language: 'typescript' | 'pseudo';
  sourceLabel?: string;
  sourceFile: string;
  code: string;
  codeSteps: readonly AtelierCodeStep[];
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
    codeTitle: 'Des angles au viseur',
    codeKind: 'extrait',
    language: 'typescript',
    sourceFile: 'src/motion.ts',
    sourceLabel: 'MotionTracker.orientation() · lignes sélectionnées',
    code: `const horizontal = neutral(angleDelta(gamma, this.anchor.gamma));
const vertical = neutral(angleDelta(beta, this.anchor.beta));

this.pointer.x += (target.x - this.pointer.x) * blend;
this.pointer.y += (target.y - this.pointer.y) * blend;`,
    codeSteps: [
      {
        label: 'Mesurer de gauche à droite',
        lines: [1],
        explanation:
          'gamma est l’inclinaison latérale. anchor garde la pose du recentrage ; angleDelta mesure l’écart et neutral ignore les petits tremblements.',
        visual: 'Le téléphone penche sur le côté : la cible se décale.',
      },
      {
        label: 'Mesurer de haut en bas',
        lines: [2],
        explanation:
          'beta mesure l’inclinaison avant-arrière. Le même calcul fournit la seconde direction de visée.',
        visual: 'Le téléphone bascule : la cible monte ou descend.',
      },
      {
        label: 'Déplacer sans à-coups',
        lines: [4, 5],
        explanation:
          'target est la position visée à l’écran. pointer s’en rapproche progressivement ; blend règle la part du déplacement appliquée à cette image.',
        visual: 'Le viseur rejoint doucement la cible.',
      },
    ],
    files: ['src/motion.ts', 'src/Controller.tsx'],
    explanation:
      'Ces lignes sont sélectionnées dans la même méthode. La conversion des angles en target et le calcul de blend ne sont pas affichés. La détection du geste de coupe se fait ensuite.',
  },
  {
    id: 'network',
    label: 'La connexion',
    eyebrow: '02 · LE LIEN AVEC LE PC',
    title: 'Un QR code relie les deux écrans',
    lead: 'Scannez le QR code : votre téléphone rejoint la bonne partie. Il transmet ensuite vos gestes au PC pendant que la connexion reste ouverte.',
    takeaway: 'Le QR choisit la partie, la connexion transporte les gestes.',
    codeTitle: 'Un geste devient un message',
    codeKind: 'simplifié',
    language: 'typescript',
    sourceFile: 'src/Controller.tsx',
    sourceLabel: 'Adaptation de l’envoi dans src/Controller.tsx',
    code: `const geste = { type: 'input', x, y, slash };
const message = JSON.stringify(geste);
connexion.send(message);`,
    codeSteps: [
      {
        label: 'Préparer le geste',
        lines: [1],
        explanation:
          'x et y placent le viseur entre 0 et 1. slash vaut vrai pendant une coupe. Ces valeurs sont réunies dans un petit objet.',
        visual: 'Le téléphone prépare la position et l’état de la lame.',
      },
      {
        label: 'Le transformer en texte',
        lines: [2],
        explanation:
          'JSON.stringify transforme l’objet en texte JSON. Ce format permet au téléphone et au serveur de lire les mêmes données.',
        visual: 'Le geste prend la forme d’un message JSON.',
      },
      {
        label: 'Le transmettre au PC',
        lines: [3],
        explanation:
          'send envoie le texte sur la connexion WebSocket déjà ouverte. Le serveur vérifie le message puis le relaie au PC de cette partie.',
        visual: 'Le message traverse téléphone → serveur → PC.',
      },
    ],
    files: ['src/Controller.tsx', 'server/relay.ts'],
    explanation:
      'Version simplifiée : les vérifications de connexion et les autres champs sont omis. Le vrai message contient aussi la source, un numéro de séquence et la force du mélange.',
  },
  {
    id: 'flight',
    label: 'Les aliments',
    eyebrow: '03 · À L’ÉCRAN',
    title: 'Les ingrédients prennent leur envol',
    lead: `Pendant les ${CUT_SECONDS} secondes du chrono de découpe, les ingrédients montent, tournent puis retombent. Leurs modèles 3D donnent du volume aux aliments et aux pièges.`,
    takeaway: 'Des volumes, une vitesse et la gravité créent le mouvement.',
    codeTitle: 'Animer un aliment, image après image',
    codeKind: 'extrait',
    language: 'typescript',
    sourceFile: 'src/game/Scene.ts',
    sourceLabel: 'KitchenScene · boucle d’animation · lignes sélectionnées',
    code: `food.velocity.y -= 4.9 * flightDt;
food.object.position.addScaledVector(food.velocity, flightDt);
food.object.rotation.y += food.spin.y * flightDt;`,
    codeSteps: [
      {
        label: 'Appliquer la gravité',
        lines: [1],
        explanation:
          'velocity.y est la vitesse verticale. La gravité la diminue : la montée ralentit, puis la chute commence.',
        visual: 'L’aliment atteint le haut de sa trajectoire.',
      },
      {
        label: 'Avancer sur la trajectoire',
        lines: [2],
        explanation:
          'position est l’emplacement du modèle. addScaledVector ajoute le déplacement : vitesse multipliée par flightDt, le temps de vol écoulé depuis l’image précédente.',
        visual: 'L’aliment descend vers le bas de l’écran.',
      },
      {
        label: 'Faire tourner le modèle',
        lines: [3],
        explanation:
          'spin.y est la vitesse de rotation. La dernière ligne fait pivoter le même modèle 3D pendant son vol.',
        visual: 'On découvre les différentes faces de l’aliment.',
      },
    ],
    files: ['src/game/food.ts', 'src/game/Scene.ts'],
    explanation:
      'Extrait de la boucle du jeu ; les rotations sur les deux autres axes sont omises. flightDt tient compte des effets de vitesse et vaut zéro pendant un défi rare.',
  },
  {
    id: 'slice',
    label: 'La découpe',
    eyebrow: '04 · LE JEU DÉCIDE',
    title: 'Votre lame traverse : le jeu vérifie',
    lead: 'La lame doit croiser un aliment. Bon ingrédient : la recette avance. Mauvais aliment : un cœur perdu, sauf si le bouclier vous protège.',
    takeaway: 'Trois cœurs à préserver, les bons ingrédients à viser.',
    codeTitle: 'Un contact, puis une décision',
    codeKind: 'simplifié',
    language: 'pseudo',
    sourceFile: 'src/game/engine.ts',
    sourceLabel: 'Résumé des règles des aliments ordinaires',
    code: `si la lame traverse l’aliment :
  si l’aliment est dans la recette :
    ajouter l’ingrédient et les points
  sinon si le bouclier est actif :
    conserver les cœurs
  sinon : retirer un cœur`,
    codeSteps: [
      {
        label: 'Vérifier le contact',
        lines: [1],
        explanation:
          'Le jeu compare le trajet entre deux positions de la lame à l’aliment. Un passage à côté ne déclenche rien.',
        visual: 'Le trait de coupe traverse le modèle 3D.',
      },
      {
        label: 'Reconnaître le bon ingrédient',
        lines: [2, 3],
        explanation:
          'Le moteur cherche l’aliment dans la recette choisie. S’il est attendu, il augmente le compteur de cet ingrédient et le score.',
        visual: 'La tomate est coupée ; la recette et les points avancent.',
      },
      {
        label: 'Traiter un piège',
        lines: [4, 5, 6],
        explanation:
          'Un aliment hors recette coûte un cœur. Si le bouclier est actif, il bloque cette perte.',
        visual: 'Le piège fait perdre un cœur, sauf sous le bouclier.',
      },
    ],
    files: ['src/game/Scene.ts', 'src/game/engine.ts'],
    explanation:
      'Ce pseudo-code résume les aliments ordinaires. Les bombes, cœurs à récupérer et défis rares suivent leurs propres règles dans le moteur.',
  },
  {
    id: 'mix',
    label: 'Le mélange',
    eyebrow: '05 · LA TOUCHE FINALE',
    title: `${MIX_SECONDS} secondes pour finir la recette`,
    lead: `Les ingrédients sont réunis : faites de petits cercles pendant ${MIX_SECONDS} secondes. Vos mouvements remplissent la jauge ; un mélange suffisant permet de réussir le plat.`,
    takeaway: 'Des gestes réguliers remplissent la jauge.',
    codeTitle: 'Valider le mélange et son bonus',
    codeKind: 'extrait',
    language: 'typescript',
    sourceFile: 'src/game/engine.ts',
    sourceLabel: 'GameEngine.tick() · à la fin du mélange',
    code: `if (s.mix >= 0.35) {
  s.score += Math.round(s.mix * 500);
  this.finish('won');
} else this.finish('mix');`,
    codeSteps: [
      {
        label: 'Lire la jauge',
        lines: [1],
        explanation:
          's.mix représente la jauge entre 0 et 1. Au terme du chrono, 0.35 signifie au moins 35 % de mélange.',
        visual: 'La jauge franchit le seuil de 35 %.',
      },
      {
        label: 'Calculer le bonus',
        lines: [2],
        explanation:
          'La jauge est multipliée par 500, puis arrondie. À 60 %, le bonus vaut 300 points ; à 100 %, il vaut 500 points.',
        visual: 'Le bonus de mélange s’ajoute au score.',
      },
      {
        label: 'Afficher le résultat',
        lines: [3, 4],
        explanation:
          'won marque une recette réussie. Sinon, mix indique un mélange insuffisant : la partie se termine sans victoire.',
        visual: 'Le plat est prêt si la jauge est suffisante.',
      },
    ],
    files: ['src/game/engine.ts', 'src/motion.ts'],
    explanation: `Ces lignes sont exécutées à la fin des ${MIX_SECONDS} secondes. Le remplissage progressif de la jauge est calculé juste avant, à partir des mouvements reçus.`,
  },
  {
    id: 'result',
    label: 'Le résultat',
    eyebrow: '06 · LE DÉFI DU STAND',
    title: 'Votre recette laisse une trace',
    lead: 'Le résultat affiche votre score. Les recettes réussies et enregistrées rejoignent le classement général et celui de la recette, pour comparer les essais du stand.',
    takeaway: 'Un pseudo, un score, un nouveau défi à relever.',
    codeTitle: 'Demander le bon classement',
    codeKind: 'extrait',
    language: 'typescript',
    sourceFile: 'src/stand.ts',
    sourceLabel: 'getLeaderboard() · lecture du classement',
    code: `const query = new URLSearchParams({ scope: 'all-time' });
if (recipeId !== 'all') query.set('recipeId', recipeId);
if (highlightEntryId) query.set('highlightEntryId', highlightEntryId);
return request<Scoreboard>(\`/api/leaderboard?\${query}\`);`,
    codeSteps: [
      {
        label: 'Choisir les records du stand',
        lines: [1],
        explanation:
          'query prépare les paramètres de la demande. all-time sélectionne les recettes réussies conservées depuis l’ouverture du stand.',
        visual: 'Le classement général réunit les recettes réussies.',
      },
      {
        label: 'Choisir une recette',
        lines: [2],
        explanation:
          'recipeId désigne burger, tacos ou cake. Avec all, aucun filtre de recette n’est ajouté.',
        visual: 'Le classement peut se limiter au burger, aux tacos ou au gâteau.',
      },
      {
        label: 'Retrouver sa partie',
        lines: [3, 4],
        explanation:
          'highlightEntryId désigne la partie à mettre en avant. request interroge le serveur ; sa réponse fournit les scores et le rang de cette partie.',
        visual: 'La ligne de votre partie et votre place sont mises en évidence.',
      },
    ],
    files: ['src/stand.ts', 'server/stand-store.ts'],
    explanation:
      'Cet extrait lit les résultats déjà enregistrés ; il ne les sauvegarde pas. Seules les recettes réussies et acceptées sont classées. Une partie libre reste hors classement.',
  },
];
