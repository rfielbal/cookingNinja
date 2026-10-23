# CookingNinja

Un jeu de cuisine en 3D dans le navigateur : le téléphone devient une manette gyroscopique. Cette version salon représente le **Lycée Guy Mollet, Arras — BTS SIO** : trois recettes, menu de jeu, pseudo, classement du stand et connexion PC–téléphone par WebSocket. Aucun compte, formulaire de contact ou email n’est demandé.

## Version salon

- Accueil interactif et sélection de recette avec aperçu 3D.
- Calibration guidée, viseur visible et essai facultatif avant le chronomètre : couper deux ingrédients de la recette, puis laisser passer un piège.
- Après le choix de la recette et du pseudo sur le PC, lancement, pause et reprise depuis le téléphone.
- Diagnostic compact de connexion : relais, téléphone associé et commandes récentes côté PC ; contexte sécurisé, capteurs et centrage vérifiés sur le téléphone. Les détails restent repliables.
- Sélecteur **Gyroscope / Tactile** toujours accessible une fois connecté. Changer de commande pendant une partie la met en pause et la fait passer en partie libre, hors classement.
- Trois lames cosmétiques **Zeste, Menthe et Prune**, sélectionnables sur PC ou téléphone, avec choix mémorisé dans le navigateur du PC.
- Menu et partie dans une ambiance vert foncé : halos, motifs culinaires, animations d’entrée et célébration de victoire, avec mouvement réduit et qualité allégée.
- Ingrédients et objets spéciaux reconnaissables par leurs modèles 3D ; étoile bouclier, cœur de soin, sablier, bombe, frénésies et défis de découpe rythment la partie.
- Pseudo public de 2 à 20 caractères et scores persistants sur le PC. Quatre tableaux « all time » au menu : général, burger, tacos et gâteau, toutes commandes réunies. Seules les recettes réussies sont classées.
- Bouton **Joueur suivant** : nouveau pseudo et nouveau salon, ancien téléphone détaché.
- Invitation facultative après la partie : **Entrez dans les coulisses du jeu** ouvre **[/atelier#atelier-decouverte](http://localhost:5173/atelier#atelier-decouverte)** dans un nouvel onglet, en conservant le résultat. Six étapes animées expliquent le geste, le relais/QR, les aliments 3D, la coupe et les règles, le mélange, puis le résultat et le classement. Navigation précédent/suivant et clavier, explications courtes et volet de code facultatif ; les démonstrations sont illustratives, sans mesures du joueur.

Lire [le guide du salon et les choix réseau](docs/salon.md) et [la carte du code](docs/architecture.md).

## Historique du projet

Le code est suivi dans [le dépôt GitHub CookingNinja](https://github.com/rfielbal/cookingNinja). Les ajouts et correctifs sont résumés dans [CHANGELOG.md](CHANGELOG.md). Le premier commit conserve l’état du jeu au 21 octobre 2026 ; les étapes antérieures sont documentées dans ce journal.

Chaque modification significative donne ensuite lieu à un commit et un push, avec un message en français qui décrit clairement le changement. Les conventions et vérifications sont précisées dans [AGENTS.md](AGENTS.md).

## Lancer le jeu

Node.js **22.12 ou plus récent** est requis. Depuis ce dossier :

```sh
npm install
npm run dev
```

Ouvrir **http://localhost:5173** sur le PC. Sélectionner une recette, choisir **Souris**, puis **C’est parti, chef !**. Maintenir le clic et glisser pour couper. Pour mélanger, maintenir le clic et faire des cercles.

Le serveur écoute aussi sur le réseau local pour permettre l’appairage. Les adresses disponibles sont imprimées dans le terminal. `HOST=127.0.0.1 npm run dev` limite l’accès au PC uniquement.

## Jouer au gyroscope

**Une adresse HTTP sur le Wi-Fi ne suffit pas pour les capteurs. Le téléphone doit ouvrir une adresse HTTPS dont le certificat est approuvé.** Le QR code réalise l’appairage ; il ne contourne pas cette restriction du navigateur.

### Option simple pour les essais : un tunnel HTTPS

Sur ce Mac, installer une fois le connecteur Cloudflare :

```sh
brew install cloudflared
```

Puis, dans le projet :

```sh
npm run phone
```

Cette commande construit le jeu, crée un lien HTTPS temporaire et lance une instance locale sur **http://localhost:5174**. Ouvrir cette adresse sur le PC : son QR code utilise directement HTTPS pour le téléphone. Le serveur reste sur le PC ; le lien public transite par Cloudflare et nécessite Internet. `Ctrl+C` ferme le serveur et son tunnel. Arrêter le serveur habituel avant ce lancement : les deux instances ne doivent pas écrire dans le même classement. Le verrou du fichier refuse une seconde instance utilisant le même dossier de données. `PHONE_PORT=5180 npm run phone` change le port de cette instance si nécessaire.

Sur les autres systèmes, installer le connecteur selon la documentation officielle ci-dessous. Le script ne télécharge ni n’installe rien silencieusement.

#### Configuration manuelle possible

Installer `cloudflared` selon sa [documentation officielle](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), puis :

1. Construire le jeu avec `npm run build`.
2. Dans un terminal séparé, lancer :

   ```sh
   cloudflared tunnel --url http://localhost:5173
   ```

3. Copier l’adresse HTTPS temporaire affichée. Arrêter le serveur de développement avec `Ctrl+C`, puis démarrer le serveur de production avec cette adresse. **Remplacer le domaine d’exemple** :

   ```sh
   PUBLIC_ORIGIN=https://votre-adresse.trycloudflare.com npm start
   ```

4. Sur le PC, ouvrir http://localhost:5173, puis **Connecter mon téléphone**. Le QR code utilise automatiquement l’adresse HTTPS configurée.
5. Scanner avec le téléphone, puis toucher **Entrer en cuisine**. Toucher le bouton d’activation des capteurs et autoriser l’accès. Une fois l’orientation reçue, calibrer en tenant le téléphone confortablement devant soi.
6. Sur le PC, choisir une recette et un pseudo puis sélectionner **Téléphone** dans la préparation. **Tester mes gestes** propose deux ingrédients de cette recette à couper, puis un piège à laisser passer. Si le piège est coupé, seul son passage recommence ; aucun score ni cœur de partie n’est affecté. Cet essai peut être passé. Une fois la commande prête, le bouton **Lancer la partie** du téléphone démarre le décompte ; il devient ensuite **Mettre en pause**, puis **Reprendre la partie**. Le PC doit rester visible et sans fenêtre de dialogue ouverte.
7. Incliner lentement pour viser ; effectuer une courte rotation rapide pour couper. **Recentrer** replace la lame au milieu. Pendant le mélange, faire de petits cercles réguliers. Le sélecteur **Gyroscope / Tactile** reste disponible en bas du téléphone : un changement pendant la partie suspend le jeu, demande de préparer la nouvelle commande, puis permet de reprendre en partie libre.

Le tunnel rend cette instance accessible via Internet et relaie le trafic par Cloudflare. Il est temporaire, à utiliser pour les essais. Fermer le processus `cloudflared` termine cette exposition. Le lancement normal (`npm run dev` ou `npm start`) ne crée pas de tunnel ; `npm run phone` le crée explicitement. Le mode production évite de partager le serveur de développement Vite. Un hébergement Node HTTPS permanent, avec prise en charge des WebSockets, rendra ce parcours plus simple pour les joueurs finaux.

### Option locale : HTTPS sur le Wi-Fi

Cette option est réservée à un **téléphone de test maîtrisé**, préparé avant le salon ; ne pas demander cette installation aux visiteurs. Le serveur accepte directement un certificat et sa clé. Générer un certificat contenant l’adresse IP LAN avec [mkcert](https://github.com/FiloSottile/mkcert), puis approuver son autorité sur le PC **et sur ce téléphone de test** selon sa documentation. Ne jamais partager la clé privée de l’autorité. Pour les téléphones des visiteurs, suivre les scénarios HTTPS du [guide salon](docs/salon.md#trois-scénarios-de-connexion).

```sh
HTTPS_KEY_FILE=.certs/local-key.pem HTTPS_CERT_FILE=.certs/local-cert.pem npm run dev
```

Les deux fichiers doivent exister ; leurs noms ci-dessus sont des exemples. Ouvrir l’adresse HTTPS du serveur, utiliser le même Wi-Fi et laisser le port configuré accessible. Ignorer une alerte de certificat n’est pas une méthode fiable pour activer les capteurs.

### Si le téléphone ne répond pas

- Lire d’abord le diagnostic dans **Connecter mon téléphone** et sur le contrôleur. **Actualiser le lien** relit l’adresse et recrée le QR ; aucun QR localhost ou de salon hors ligne n’est proposé. Une commande récemment reçue sur le PC ne prouve pas à elle seule l’état des permissions du téléphone.
- Vérifier l’autorisation de mouvement et les lignes **Adresse, Capteurs et Centrage** du diagnostic sur le téléphone.
- Recentrer après avoir changé de position. Régler la sensibilité si nécessaire.
- Garder l’onglet du téléphone visible. Un retour au premier plan recale la référence.
- En cas de déconnexion, la partie se met en pause. Le téléphone peut rejoindre à nouveau le salon tant que le PC reste connecté.
- Après reconnexion et recentrage, reprendre explicitement depuis le téléphone ou le PC lorsque la commande est prête.
- Après un rechargement du PC ou redémarrage serveur, scanner le nouveau code.
- Si le gyroscope n’est pas disponible, choisir **Tactile** dans le sélecteur permanent du contrôleur. Le contrôle par la souris reste également disponible côté PC. Pour obtenir un score classé avec ce nouveau mode, le choisir avant de lancer une nouvelle partie.

Ce diagnostic décrit les états observés dans chaque navigateur. Il ne mesure ni la connexion Internet du lieu ni la latence, et ne garantit pas qu’une adresse HTTPS proposée sera accessible depuis un autre appareil.

### Choisir sa lame et les effets

**Zeste** (orange), **Menthe** (vert clair) et **Prune** (violet) partagent la même portée et les mêmes règles. Le choix colore le pointeur, la traînée, le halo et les étincelles ; il n’améliore pas le score. Il se règle dans les interfaces PC et téléphone, est synchronisé entre les deux, et se conserve dans le `localStorage` du navigateur PC si ce stockage est disponible. Aucun compte n’est nécessaire.

Le fond vert foncé prolonge l’ambiance du menu avec des halos et des décors par recette : grill et étincelles chaudes pour le burger, soleil et confettis pour les tacos, chocolat et étoiles de sucre pour le gâteau. Les aliments et objets spéciaux apparaissent sous leur forme 3D naturelle pendant le vol. La liste de recette, la légende, les annonces d’événement et les avertissements restent dans l’interface générale. Une coupe produit des particules et de brefs anneaux ; une erreur déclenche aussi un retour visuel sur le cadre de jeu. Des flèches circulaires autour du bol indiquent le geste de mélange.

Les transitions et la victoire ajoutent des effets décoratifs. La préférence système **Réduire les animations** limite ces mouvements ; le mode de qualité allégée réduit ombres, densité de pixels et nombre de particules. Les aliments restent animés pour jouer. Les performances sur le matériel du stand restent à mesurer.

### Le mode tactile

Glisser dans le pavé pour couper, puis faire des cercles pour mélanger. `TouchTracker`, dans `src/touch.ts`, conserve les segments de geste entre deux envois, y compris la fin d’un glissement bref. Chaque segment transmis possède son propre début (`fromX`, `fromY`) afin de ne pas relier deux gestes séparés par une coupe invisible.

L’envoi réseau est programmé toutes les **34 ms**, soit environ **29 Hz**, lorsque la connexion peut envoyer. Le viseur local du téléphone suit une boucle `requestAnimationFrame` qui met à jour sa transformation directement, sans provoquer un rendu React à chaque déplacement. Cette séparation réduit le travail d’interface ; elle ne garantit pas une latence donnée sur tous les téléphones et réseaux.

Le pavé conserve le doigt actif lorsqu’il change de dimensions ou lors du passage du décompte à la découpe. Il recalcule la position et vide les anciens segments pour éviter une coupe artificielle. Le défaut de blocage au redimensionnement a été reproduit avant correction puis vérifié après correction dans Chromium ; les mesures et limites figurent dans [la validation](docs/validation.md).

## Boucle de jeu

| Recette         | Bons ingrédients                         | Quantité par ingrédient | Pièges                    |
| --------------- | ---------------------------------------- | ----------------------- | ------------------------- |
| Le Ninja Burger | Pain, steak, fromage, salade, tomate     | 5                       | Poisson, piment, fraise   |
| Tacos Loco      | Tortilla, poulet, avocat, tomate, oignon | 6                       | Chocolat, poisson, fraise |
| Choco Sensei    | Farine, œuf, chocolat, fraise            | 8                       | Piment, brocoli, poisson  |

Chaque partie commence avec trois vies et comporte 3 secondes de décompte, **80 secondes de découpe**, puis **8 secondes de mélange** si la liste est complète. La phase de découpe se poursuit jusqu’au bout même si la liste est déjà complète : les coupes supplémentaires rapportent des points. Sans bouclier, un mauvais aliment coûte un cœur et une bombe jusqu’à deux ; atteindre zéro vie termine la partie. Les soins peuvent rendre des vies en cours de jeu, toujours dans la limite de trois. Rater un ingrédient ne retire pas de cœur, mais la liste doit être remplie avant la fin. Atteindre au moins **35 %** de la jauge de mélange permet de servir le plat.

| Événement ou objet                                  | Effet                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Frénésie de 20 à 30 s, puis de 50 à 60 s de découpe | Vols ×1,65 et cadence d’apparition ×1,5 ; points habituels                 |
| Étoile bouclier                                     | Protection contre les pièges et bombes pendant 10 s ; aucun point immédiat |
| Cœur bonbon                                         | +1 vie si une vie manque ; plafond de 3 vies                               |
| Ingrédient brillant à 12 et 42 s                    | Zoom et défi de 3 s : +50 points par coupe acceptée                        |
| Sablier cyan                                        | +100 points ; vols et cadence des ingrédients à 55 % pendant 5 s de jeu    |
| Bombe rouge et noire                                | −2 cœurs et combo interrompu                                               |

Un objet spécial s’ajoute toutes les 8 secondes, dans le cycle étoile → bombe → sablier, jusqu’à neuf objets sur une découpe complète. Ces objets ne remplissent pas la liste de recette. Le bouclier préserve les cœurs et le combo, y compris contre une bombe. Le ralenti prend la priorité sur la vitesse de frénésie sans prolonger le chronomètre.

Trois occasions de récupérer une vie sont prévues à **18, 40 et 62 secondes** de découpe. Un cœur bonbon supplémentaire apparaît seulement si une vie manque à cet instant. Il se récupère en le coupant, sans points ni changement de combo, avec un maximum de trois vies simultanées. Une occasion passée à vie pleine est consommée ; il n’y a jamais plus de trois cœurs à collecter par partie.

Un ingrédient brillant supplémentaire privilégie les ingrédients manquants. Une grande aura dorée, des rayons et des étincelles signalent sa rareté sans masquer l’aliment. Sa première coupe remplit la recette normalement, puis le jeu le rapproche pendant **3 secondes** : chaque nouvelle coupe acceptée rapporte **50 points**, versés à la fin du défi. Un délai minimal de 110 ms sépare deux coupes et le bonus est plafonné à 1 500 points par défi. Pendant ce temps, les autres aliments, le chronomètre de recette et les pouvoirs sont figés ; les deux défis peuvent donc ajouter jusqu’à 6 secondes à la partie. Une pause fige aussi le défi. Aucun contour rigide ni texte n’est attaché aux aliments.

Le son suit les actions : souffle de lame, textures de coupe selon l’aliment, impact des pièges, explosion, bouclier, soin et accords des événements. Une ambiance de cuisine discrète accompagne la découpe ; le bruit du fouet suit l’intensité du mélange. Les sons sont générés localement, sans téléchargement, et s’arrêtent en pause, en sourdine ou lorsque l’onglet est masqué. Le bouton haut-parleur coupe toute l’ambiance et les bruitages.

Les sons sortent du **PC**. En cas de silence, ouvrir **Réglages → Tester le son sur le PC** : le test active le contexte et joue deux notes. L’interface affiche l’état d’activation du navigateur. Si les notes sont envoyées mais restent inaudibles, vérifier le volume, la sortie audio et la sourdine de l’onglet ou du navigateur intégré. Le lancement depuis le téléphone ne remplace pas l’autorisation audio sur le PC.

Les résultats éligibles sont enregistrés dans `data/stand.json` sur le PC. Les classements réunissent les victoires au gyroscope, au pavé tactile et à la souris. Chaque ligne représente une partie : les scores ne sont pas additionnés et les pseudos identiques ne sont pas fusionnés. Après une partie, deux tableaux montrent le général et la recette jouée ; une victoire enregistrée y indique son rang, même hors du top affiché.

Une partie qui change de commande reste jouable mais ne participe pas au classement, même si l’on revient ensuite au mode initial ; son résultat n’est pas finalisé par le PC. Changer seulement de lame conserve l’éligibilité. Un échec d’enregistrement est affiché et peut être retenté sans créer de doublon.

## Architecture et commandes

```text
src/App.tsx             Accueil, recettes, orchestration de partie
src/Controller.tsx      Interface téléphone, permissions et connexion
src/motion.ts           Calibration, filtrage, gestes gyroscopiques
src/touch.ts            Segments tactiles et énergie de mélange
src/game/engine.ts      Règles indépendantes du rendu et du réseau
src/game/events.ts      Frénésie, bouclier, défi de découpe et constantes partagées
src/game/recipes.ts     Recettes et ingrédients
src/game/Scene.ts       Rendu 3D, trajectoires, collisions et particules
src/game/SceneOverlay.ts  Anneaux de coupe et flèches de mélange
src/game/food.ts        Modèles 3D procéduraux mutualisés
src/game/audio.ts       Bruitages et ambiance Web Audio synchronisés
src/components/        Composants d’interface
src/net.ts              Client WebSocket PC
shared/protocol.ts      Types et validation des messages
shared/blades.ts        Trois lames, couleurs et validation partagées
server/relay.ts         Salons et relais PC–téléphone
server/index.ts         HTTP(S), Vite et service de production
server/stand-*.ts       Validation, persistance et API du classement
src/Atelier.tsx         Diaporama pédagogique en six étapes animées
src/atelierSlides.ts    Explications, exemples et références du diaporama
src/components/AtelierStage.tsx  Cycle de vie de la démonstration 3D de l’atelier
src/game/AtelierScene.ts  Illustrations 3D isolées avec les modèles du jeu
src/components/ArcadeMenu.tsx  Menu de jeu et sélection
src/components/PracticeRange.tsx  Essai des gestes
src/components/ResultDiscovery.tsx  Invitation facultative vers l’atelier après la partie
src/components/BladePicker.tsx  Sélecteur de lame côté PC
src/dojo.css            Palette commune et animations des écrans PC
tests/                  Règles, gyroscope, classement et réseau
```

```sh
npm run typecheck       # TypeScript strict
npm test               # Tests de logique et vrais clients WebSocket locaux
npm run build          # Vérification des types et compilation optimisée
npm start              # Sert dist + relais WebSocket, après build
npm run format         # Formatage du code
npm run format:check   # Vérification du formatage
```

Les variables disponibles sont décrites dans `.env.example`. Elles doivent être exportées dans le shell ; aucun fichier `.env` n’est chargé implicitement. Le port par défaut est `5173`.

## Portée de la version actuelle

La version actuelle comprend trois recettes, modèles 3D procéduraux, collisions, éclats et traînées, sons désactivables, score/combos, pause, résultats, QR code, salons, validation réseau, capteurs, recentrage et contrôles de secours. Le parcours salon comprend les commandes de partie depuis le téléphone, le changement explicite de mode, les trois lames, l’essai guidé et la découverte pédagogique après la partie. Les règles `stand-v0.5-hearts` réunissent les frénésies, boucliers, ralentis, bombes, défis de découpe et cœurs de soin. Le contrôleur mobile ne charge pas le moteur Three.js. Les polices sont locales, sans CDN.

Le gyroscope pilote une **visée relative**, pas une position physique 3D. Les aliments éclatent en particules ; il n’y a pas encore de découpe exacte du maillage en deux. Les ingrédients sont reconnaissables mais stylisés. Le mélange est une jauge de mouvement, sans simulation de pâte.

Le protocole est testé avec de vrais clients WebSocket locaux. Un tunnel Cloudflare HTTPS a également été vérifié dans le navigateur, avec appairage réel entre le contrôleur HTTPS et le PC local. La calibration a été testée avec des événements synthétiques. Les essais matériels iPhone/Android, le confort des gestes, la latence et les mesures de performances sur plusieurs GPU restent à réaliser. Voir [le détail des validations](docs/validation.md).

Les salons sont en mémoire sur un seul processus. Les codes sont aléatoires, les rôles contrôlés, les messages bornés et les fréquences limitées. Il n’y a pas de compte. Le classement est public en lecture, mais ses écritures sont réservées au PC via localhost, avec vérification de la connexion, du Host et de l’Origin. Le score reste calculé sur ce PC : ce dispositif est conçu pour un stand surveillé et ne constitue pas un système antitriche. Pour une diffusion publique, prévoir contrôle d’abus au proxy, métriques, stratégie multi-instance, et moteur faisant autorité côté serveur si une compétition publique est ajoutée.

Voir [la recherche technique et la suite proposée](docs/recherche-technique.md).

## Classement et données du stand

Ouvrir le jeu sur **localhost** côté PC, même quand le téléphone utilise le domaine HTTPS. L’adresse publique du tunnel et l’IP LAN ne permettent pas d’enregistrer un résultat : le jeu le signale et reste jouable en partie libre. Les pseudonymes sont affichés comme texte, jamais comme HTML. Aucun email n’est stocké.

Les nouvelles parties utilisent les règles **`stand-v0.5-hearts`**. Les tableaux « all time » incluent aussi les victoires **`stand-v0.2`**, **`stand-v0.3-events`** et **`stand-v0.4-frenzy`**, sans effacement ni recalcul. Chaque partie conserve sa version et sa validation historique. Les règles de points et de survie ayant évolué, ces scores ne sont pas strictement comparables.

L’interface lit `GET /api/leaderboard?scope=all-time`, avec `recipeId` pour une recette et `highlightEntryId` pour retrouver le rang exact d’une partie. Sans `scope`, l’API conserve son filtre historique `current-rules` ; le filtre facultatif `mode` reste disponible aux anciens clients. Le contrat détaillé figure dans [l’architecture](docs/architecture.md#classement-du-stand).

Un seul processus peut posséder le fichier de classement. `STAND_DATA_DIR=/chemin/du/dossier` change son emplacement ; utiliser un dossier temporaire distinct pour les essais. Les écritures sont sérialisées et passent par un remplacement atomique, avec un verrou de processus. La capacité est limitée à 10 000 parties. Pour sauvegarder ou archiver une édition du salon, arrêter le serveur et copier le dossier de données ; ne pas modifier le fichier pendant une partie.

Pour un stand sans Internet, construire le projet avant l’événement (`npm run build`), puis servir les ressources locales avec `npm start`. La souris et le pavé tactile LAN HTTP fonctionnent sans service externe. **Le gyroscope des téléphones des visiteurs demande une préparation HTTPS/DNS distincte**, décrite dans le guide salon ; aucune bascule magique d’un tunnel HTTPS vers une IP HTTP ne peut conserver l’accès aux capteurs.
