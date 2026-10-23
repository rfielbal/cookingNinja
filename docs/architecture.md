# Architecture de CookingNinja

Description du projet pour la démonstration BTS SIO du Lycée Guy Mollet, à Arras. Le jeu et la page pédagogique `/atelier` restent distincts. Les chemins ci-dessous sont relatifs à la racine du dépôt.

## Répartition des responsabilités

| Fichier                                   | Responsabilité                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/main.tsx`                            | Charge l’écran correspondant à l’URL                                                   |
| `src/App.tsx`                             | Interface PC, orchestration du moteur, de la scène et du réseau                        |
| `src/Controller.tsx`                      | Manette mobile : connexion, calibration, choix de commande/lame et commandes de partie |
| `src/motion.ts`                           | Transformation des mesures en visée relative, coupe et énergie de mélange              |
| `src/touch.ts`                            | Segments tactiles, gestes brefs, début explicite de coupe et énergie de mélange        |
| `src/net.ts`                              | Connexion WebSocket du PC et suivi du téléphone associé                                |
| `src/connectionDiagnostic.ts`             | Rapports de connexion issus des états observés et choix d’adresse du contrôleur        |
| `src/components/ConnectionDiagnostic.tsx` | Affichage compact du diagnostic et détails repliables                                  |
| `shared/protocol.ts`                      | Types du protocole et validation des messages à l’exécution                            |
| `shared/blades.ts`                        | Identifiants, noms, couleurs et halos des trois lames ; validation partagée            |
| `src/components/BladePicker.tsx`          | Sélection de lame dans l’interface PC                                                  |
| `src/components/PracticeRange.tsx`        | Essai facultatif de deux ingrédients et d’un piège de la recette choisie               |
| `src/components/ResultDiscovery.tsx`      | Lien facultatif du résultat vers la découverte pédagogique dans un nouvel onglet       |
| `server/relay.ts`                         | Salons, rôles et transmission WebSocket                                                |
| `src/game/engine.ts`                      | Règles, temps, score, cœurs, phases et ingrédients actifs                              |
| `src/game/events.ts`                      | Types et constantes des objets spéciaux, rushs et ralentissement                       |
| `src/game/recipes.ts`                     | Recettes, objectifs et ingrédients pièges                                              |
| `src/game/Scene.ts`                       | WebGL, trajectoires, collision lame/aliment et effets                                  |
| `src/game/SceneOverlay.ts`                | Anneaux transitoires de coupe et flèches autour du bol                                 |
| `src/game/food.ts`                        | Géométries et matériaux procéduraux mutualisés                                         |
| `src/game/audio.ts`                       | Bruitages de cuisine, événements et ambiance Web Audio côté PC                         |
| `src/dojo.css`                            | Palette vert foncé et animations communes aux écrans PC                                |
| `server/index.ts`                         | Serveur HTTP(S), configuration, Vite ou fichiers de production                         |
| `server/stand-api.ts`                     | API des parties et du classement du stand                                              |
| `server/stand-domain.ts`                  | Validation du pseudonyme, du résultat et de sa plausibilité                            |
| `server/stand-store.ts`                   | Persistance JSON locale des résultats                                                  |
| `src/Atelier.tsx`, `src/atelier.css`      | Parcours pédagogique indépendant du jeu                                                |

## Le trajet réel d’une coupe

```text
Téléphone
  Controller.tsx → MotionTracker ou TouchTracker
                → { x, y, slash, stir, seq, source, fromX?, fromY? }
        │
        ▼ WebSocket /relay
  validation du protocole → rôle/salon/séquence → relais vers le PC
        │
        ▼
  useHost (net.ts) → App.tsx → KitchenScene.slash(début, fin)
                                  │
                                  └─ collision projetée → onHit(id, kind)
                                                            │
                                                            ▼
                                                      GameEngine.hit(id)
                                                            │
                                              état / score / cœurs / résultat
                                                            │
                                                            ▼
                                                       Interface React
```

Le trajet inverse existe aussi : `GameEngine` demande l’apparition d’un aliment à la scène et `App.tsx` relaie l’état de partie vers le téléphone. Le serveur WebSocket ne calcule ni trajectoire ni collision ni score. La 3D identifie un objet traversé ; le moteur accepte ou refuse le coup selon l’état, la recette et les pouvoirs. Cette séparation permet de tester les règles sans navigateur ou carte graphique.

Les coordonnées `x` et `y` sont normalisées entre 0 et 1 dans la zone de jeu. La scène transforme le segment en pixels pour tester la distance au centre projeté de chaque aliment, puis demande confirmation par `onHit(id, kind)`. Le moteur consomme normalement l’identifiant accepté ; l’ingrédient brillant est l’exception, conservée pendant le défi `focus` puis retirée à sa fin. La scène ne produit les éclats qu’après confirmation et conserve elle aussi le brillant pour `focus-start` et `focus-cut`. Elle revérifie que la partie continue : un autre objet traversé après une bombe fatale ne doit pas afficher un bonus refusé par le moteur. Une coupe normale ne doit pas attribuer deux fois les points du même objet ; les répétitions du défi suivent leurs propres limites.

Pour le tactile, `fromX` et `fromY` indiquent le début du segment réellement capturé. `App.tsx` et `PracticeRange.tsx` utilisent ce début au lieu de joindre le dernier point reçu à un nouveau geste. Le protocole n’accepte cette paire optionnelle que pour `source: 'touch'`, avec deux coordonnées comprises entre 0 et 1. Le gyroscope conserve le segment entre ses échantillons récents.

## Suivi tactile et cadence d’affichage

`TouchTracker` sépare la collecte des `PointerEvent` de l’envoi WebSocket. Il suit un seul pointeur, accumule la distance parcourue, conserve jusqu’à quatre segments et écarte les segments âgés de plus de 150 ms. Un appui immobile ne produit pas de coupe ; un glissement bref terminé entre deux envois peut encore transmettre son dernier segment. Une annulation ou un changement de phase/commande vide les gestes en attente.

`rebase()` efface les segments et l’énergie sans abandonner le pointeur actif. Lorsqu’un redimensionnement ou un déplacement du pavé est observé, `Controller.tsx` recalcule la position normalisée depuis la dernière coordonnée client et le nouveau rectangle. Cela évite à la fois le blocage jusqu’au prochain appui et une coupe causée par la mise en page. Les transitions continues décompte → découpe et découpe → mélange utilisent aussi ce recalage ; pause, résultat, rotation, perte de visibilité et changement de commande annulent encore le geste.

`Controller.tsx` traite aussi les événements regroupés par le navigateur lorsqu’ils sont disponibles. Les dimensions du pavé sont mémorisées au début du geste et actualisées lors des changements de disposition, plutôt que mesurées à chaque déplacement. L’envoi est programmé toutes les 34 ms, soit environ 29 Hz, et un segment n’est consommé que lorsque la connexion WebSocket est ouverte et sa file d’envoi vide.

Le viseur local et la jauge de mouvement du contrôleur utilisent une boucle `requestAnimationFrame` distincte. Elle modifie les transformations CSS via des références DOM et évite une mise à jour React pour chaque échantillon. Cette cadence d’affichage locale n’augmente pas la fréquence réseau. Ce découplage limite les travaux inutiles ; le délai observé sur un téléphone et un Wi-Fi réels reste à mesurer.

## Mesure et calibration

`deviceorientation` fournit des angles ; `devicemotion.rotationRate` fournit des vitesses angulaires. `MotionTracker` construit une référence de visée à partir de la pose du téléphone. L’inclinaison relative déplace le pointeur ; une rotation suffisamment rapide déclenche une courte fenêtre de coupe. L’énergie de mélange est une jauge de mouvement. [MDN : événements d’orientation et de mouvement](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Detecting_device_orientation).

Le projet ne mesure pas la position absolue du téléphone dans l’espace. Il ne connaît ni ses coordonnées dans la pièce ni une trajectoire de lame physique en centimètres. La calibration, le filtrage et la sensibilité servent à rendre la **commande relative** utilisable. Les seuils doivent être confrontés à de vrais appareils ; des événements synthétiques ne prouvent ni confort ni latence matérielle.

La calibration exige une pose stable sur au moins 360 ms et cinq mesures, avec des données fraîches de moins de 1,2 seconde. Une zone neutre de 0,4° et un lissage temporel de 32 ms limitent les tremblements. L’activation de la coupe combine déplacement du pointeur et vitesse sur les axes utilisés pour viser ; une rotation sur un axe sans déplacement utile ne suffit pas. Les seuils d’entrée/sortie de 85°/s et 40°/s évitent un simple basculement unique autour d’un seul seuil.

Le contrôleur cesse d’envoyer des commandes de mouvement si les mesures sont périmées et revient au centrage après interruption ou rotation d’écran. Il demande un Screen Wake Lock lorsque l’API est disponible ; un refus ou une libération reste possible. Le champ `source` distingue capteurs (`motion`) et pavé tactile (`touch`). Une fois la commande de nouveau prête, la reprise doit être demandée explicitement depuis le téléphone ou le PC.

L’activation des capteurs part d’un geste utilisateur et nécessite un contexte sécurisé. Une page sur une IP privée en HTTP n’est pas une solution gyroscopique pour les visiteurs ; HTTPS et le certificat approuvé restent nécessaires. Le pavé tactile et la souris constituent les modes de secours. [MDN : permission d’orientation](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), [contextes sécurisés](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Commandes du téléphone et lames

La recette et le pseudonyme se choisissent sur le PC. Le téléphone connecté conserve un sélecteur **Gyroscope / Tactile** et un bouton de partie qui propose **Lancer la partie**, **Mettre en pause** ou **Reprendre la partie**, selon l’état reçu. Le démarrage et la reprise exigent une commande prête ; le PC vérifie aussi sa visibilité, l’absence de dialogue et l’état de la partie. Le téléphone attend la confirmation du PC au lieu de modifier lui-même le moteur.

```text
Téléphone → controller:action { action: start | pause | resume }
          → relais → App.tsx → GameEngine → game:state → téléphone

Téléphone → controller:settings { mode: motion | touch, blade }
          → relais → App.tsx → commande active / KitchenScene.setBlade()
```

`game:state` contient notamment `canStart`, `canResume`, `starting`, `controlMode`, `blade` et un message `notice`. Le relais valide ces messages, réserve les actions et réglages au contrôleur associé et applique une limite de commandes distincte de celle des mouvements. Seul le PC publie l’état de jeu.

Changer entre gyroscope et tactile annule le geste précédent, efface la position et l’énergie de référence côté PC puis met une partie active en pause. Le joueur prépare la nouvelle commande avant de reprendre. `App.tsx` retire alors l’éligibilité au classement si le mode diffère de celui du départ ; revenir au mode initial ne la rétablit pas. Les tableaux réunissent les commandes, mais chaque partie classée conserve une commande identifiée et stable du début à la fin. Un changement de lame seul ne met pas en pause et ne modifie pas cette éligibilité.

`shared/blades.ts` définit **Zeste** (`citrus`), **Menthe** (`mint`) et **Prune** (`berry`), ainsi que leurs couleurs et halos. Les interfaces PC et téléphone consomment la même liste ; les identifiants reçus sont validés par le protocole. `App.tsx` conserve le choix dans `localStorage` sous la clé `cookingninja-blade`, si le stockage est disponible, et le transmet au téléphone avec l’état. Un choix fait sur le téléphone revient au PC par `controller:settings`. Les lames sont cosmétiques : portée et calcul du score restent identiques.

## Boucle de jeu et affichage

Les phases sont `ready`, `countdown`, `playing`, `paused`, `mixing` et `result`. Les durées du moteur sont 3 secondes de décompte, 80 secondes de découpe et 8 secondes de mélange, hors pauses et défis de découpe. Chaque recette exige plusieurs exemplaires de chaque ingrédient. Le joueur commence avec trois vies : sans bouclier, un aliment piège retire un cœur et une bombe jusqu’à deux ; atteindre zéro termine la partie. Les soins ne permettent jamais de dépasser trois vies simultanées. Manquer un aliment ne retire pas de cœur. À la fin du temps, il faut la liste complète puis au moins 35 % de mélange pour gagner.

`events.ts` définit `ArenaKind` (ingrédient, `shield`, `slow`, `danger` ou `heart`), `ArenaEvent` (`normal`, `rush`, `slow`, `focus`) et les constantes partagées par le moteur et le classement. Deux frénésies (`rush`) couvrent les intervalles 20–30 et 50–60 secondes de découpe : cadence des ingrédients ×1,5 et vitesse de vol ×1,65. Elles ne multiplient pas les points dans les règles actuelles.

Toutes les 8 secondes, un objet spécial supplémentaire suit le cycle étoile → bombe → sablier. L’étoile active `shieldRemaining: 10` sans points, hits ni progression de recette. Tant que le bouclier est actif, pièges et bombes retournent `blocked` : l’objet est consommé sans perte de cœur, de combo ni erreur comptée. Le sablier rapporte 100 points et 5 secondes de ralenti ; la bombe non protégée retire deux cœurs et interrompt le combo.

Le type spécial `heart` possède trois occasions distinctes d’apparition, à 18/40/62 secondes de recette. L’occasion est consommée même si le joueur a trois vies ; sinon un cœur supplémentaire apparaît. `heal` ajoute une vie (plafond 3), sans changer points, combo, hits, erreurs ni progression. Le compteur moteur `livesRecovered` facilite les vérifications mais n’ajoute pas de champ réseau. Un cœur coupé à vie pleine retourne `full-health`, sans gain. Pause et focus figent ces occasions comme le chronomètre de recette.

Le moteur conserve un temps de recette et un temps de déplacement distincts. Le ralenti réduit les vols et l’âge des objets actifs à 55 %, et multiplie la cadence courante par 0,55, sans prolonger les 80 secondes de découpe ni déplacer les fenêtres de frénésie. Pendant un cumul, le ralenti prend la priorité sur la vitesse de vol. `worldSpeed` transmet ce facteur à `KitchenScene.setEvent()` ; les traînées, l’interface et le mélange conservent leur rythme. Une pause fige les horloges et les effets ; l’entrée en mélange ou en résultat les remet à zéro.

À 12 et 42 secondes, `spawn(..., shiny: true)` ajoute un ingrédient de recette, en privilégiant ceux qui manquent. La première coupe retourne `focus-start`, compte l’ingrédient une seule fois et conserve son identifiant. `focus` porte son identifiant, son type, les secondes restantes, les coupes et les points en attente. Pendant 3 secondes, la phase reste `playing`, `event` vaut `focus` et `worldSpeed` vaut zéro : chronomètre, pouvoirs, apparitions et autres aliments sont figés. Seul l’ingrédient ciblé accepte `focus-cut`, avec un délai de 110 ms entre deux coups et 50 points par coup. Le bonus est versé à la fin, puis l’identifiant est retiré. `setFocus()` rapproche et agrandit le modèle devant un voile 3D ; les matériaux émissifs du brillant sont clonés pour ne pas éclairer les autres exemplaires du même aliment. La pause conserve le défi.

La scène Three.js possède sa propre boucle `requestAnimationFrame`. `App.tsx` avance les règles et synchronise l’état React sans reconstruire les menus à chaque image. La pause arrête le moteur et la physique. Les ressources sont plafonnées et mutualisées ; `dispose()` arrête l’animation, libère les ressources GPU et retire les canvas. La préférence de mouvement réduit concerne les animations décoratives ; une partie reste animée.

`src/dojo.css` donne au menu et à l’arène la même palette vert foncé avec des halos chauds. Le canvas transparent de `KitchenScene` ajoute des décors aux bords : grill et étincelles pour le burger, soleil et confettis pour les tacos, chocolat et étoiles de sucre pour le gâteau. Le rush prend une teinte dorée et le ralenti une teinte cyan. Ces décors ne participent pas aux collisions. Les groupes du bol et du plat ont une animation d’entrée ; `setOutcome(true)` avant `setMode('result')` déclenche les confettis de victoire. `setBlade()` applique la couleur sélectionnée au pointeur, à la traînée et aux étincelles.

Les ingrédients restent sans contour rigide, badge ni texte attaché. Les rares portent une aura dorée additive, des rayons doux, un éclat d’apparition et une traînée d’étincelles ; leur couleur d’origine reste visible. Les textures et matériaux sont mutualisés, avec au plus 30 particules rares (14 en qualité allégée). Le cœur est un bonbon rose en volume ; sa collecte produit des petits cœurs ascendants et un retour « +1 » dans l’interface. La liste de recette, la légende et le cadre d’erreur restent dans l’interface générale. `SceneOverlay` dessine les anneaux transitoires après une coupe et les flèches circulaires autour du bol pendant le mélange. Pendant les vols, la passe d’ombres est désactivée puisqu’il n’y a pas de sol qui les reçoit ; la traînée utilise des traits superposés sans flou recalculé sur chaque segment.

La qualité allégée réduit la densité de pixels, les ombres et le nombre de particules ; certains mouvements CSS sont également arrêtés. `prefers-reduced-motion` désactive les animations CSS et les mouvements décoratifs de la scène, limite les éclats et supprime les confettis et étincelles supplémentaires. La physique des aliments et le retour visuel utile à la coupe restent actifs. Ces choix bornent le coût des effets sans constituer une mesure de performances sur tous les GPU.

Les aliments sont fabriqués avec des géométries du projet, pas téléchargés depuis une bibliothèque distante. La coupe donne des éclats et une traînée ; il n’y a pas de découpe exacte du maillage. Le contrôleur et l’atelier peuvent être chargés sans charger la scène 3D.

## Son synchronisé avec la partie

`KitchenAudio` produit les bruitages avec Web Audio, sans fichiers distants : bruit filtré pour les matières, oscillateurs pour les impacts et accords pour les événements. La coupe dépend de l’aliment (croquant, humide, sec, tendre, cassant ou poudreux). Les pièges, bombes, boucliers, soins, rares et fins de partie ont des signatures distinctes. `onSlash(strength)` ajoute le souffle de la lame selon sa vitesse, limité à un déclenchement toutes les 65 ms.

`App.tsx` transmet la phase réelle, l’événement, la recette et l’énergie du mélange. Le compte à rebours sonore suit les changements de chiffre du moteur. L’ambiance de cuisson reste discrète pendant la découpe, varie avec la recette et s’atténue pendant le défi rare. Le bruit du fouet suit le mouvement ; son gain retombe vers zéro après 150 ms sans mise à jour, même si JavaScript se bloque.

Le son est produit sur le **PC**, pas sur la manette. Le clic, le relâchement tactile et le clavier déverrouillent le contexte audio ; les raccourcis clavier qui ciblent le document sont également pris en compte. Un message WebSocket ne donne pas cette autorisation. Les commandes audio explicites sont exclues de l’activation globale pour éviter qu’un appui change le bouton « activer » en « couper » avant son clic. Voir les [événements d’activation utilisateur](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation).

`getStatus()` et `subscribe()` exposent l’état réel à React via `useSyncExternalStore`. `unlock()` attend la reprise effective, avec une attente bornée à 1,2 seconde ; un nouveau geste peut réparer un contexte fermé ou resté bloqué. Les réglages proposent un test de deux notes, y compris lorsque la partie est en pause. Son retour confirme uniquement que les notes ont été programmées dans un contexte actif, pas qu’un haut-parleur les a rendues audibles.

Les sons reçus avant autorisation, en pause, en mode muet ou onglet masqué sont abandonnés. Ces états arrêtent aussi les sources déjà programmées : aucun stock de sons n’est rejoué à la reprise. Un tampon de bruit de quatre secondes est réutilisé, les sources actives sont plafonnées à 24 et déconnectées à leur fin. Le démontage arrête les sources ; un remplacement du module en développement ferme aussi l’ancien contexte.

## Réseau et protections réellement présentes

Le QR contient l’adresse de la manette et le code de salon. Les salons sont en mémoire dans un seul processus Node. Le relais distingue hôte PC et contrôleur, associe les pairs, borne la taille et la fréquence des messages, limite les files d’envoi, vérifie les origines autorisées et ignore les séquences anciennes. Le heartbeat et le nettoyage des connexions évitent de conserver indéfiniment des pairs disparus.

Le protocole valide les types et les bornes à l’exécution puis copie les champs attendus. TypeScript ne remplace pas cette validation de données externes. Le code de salon et ces contrôles ne sont pas une authentification forte de personnes. Ils ne constituent pas non plus une protection complète contre les abus d’un service Internet public.

Un jeton de reprise aléatoire permet au même onglet mobile de retrouver sa place ; il est conservé dans `sessionStorage`. Après déconnexion, la place est réservée temporairement pendant 30 secondes. Le message `controller:leave` la libère volontairement pour le prochain visiteur. Cette reprise suppose que le salon existe encore : elle ne survit pas à un redémarrage du processus ou à la disparition du PC hôte.

`connectionDiagnostic.ts` sépare les preuves disponibles sur chaque écran. Le PC observe sa connexion au relais, l’association confirmée et l’arrivée récente de commandes ; il ne déduit pas les permissions ou la calibration du téléphone. Le contrôleur vérifie sa propre connexion, son contexte sécurisé, les mesures fraîches et le centrage, ou la disponibilité locale du tactile. `ConnectionDiagnostic` présente un résumé et des détails repliables. `PairDialog` relit `/api/config` lorsque le code ou la connexion changent et sur actualisation manuelle, traite les erreurs HTTP/QR et masque les adresses de boucle locale ainsi que les QR de salons hors ligne. Aucun de ces contrôles ne mesure la latence, ne teste Internet ou ne certifie l’accessibilité distante de l’adresse proposée.

Le serveur peut servir directement HTTPS avec `HTTPS_KEY_FILE` et `HTTPS_CERT_FILE`, ou fonctionner derrière un reverse proxy/tunnel. `PUBLIC_ORIGIN` annonce l’origine externe et autorise cette origine pour les WebSockets. `npm run phone` prépare un lien HTTPS temporaire et une instance de production. Un redémarrage du tunnel demande de rescanner le QR actif. Voir `docs/salon.md` pour les choix Internet, LAN HTTPS et secours tactile.

## Classement du stand

La persistance se trouve dans `server/stand-store.ts`, dans un document JSON local versionné. Le chemin par défaut est `data/stand.json` ; `STAND_DATA_DIR` change son dossier. L’API est dans `server/stand-api.ts` et sa validation métier dans `server/stand-domain.ts`. Il n’y a pas de base SQLite dans cette version.

`Leaderboard.tsx` affiche quatre tableaux au menu : général, burger, tacos et gâteau. L’écran de résultat en montre deux, général et recette jouée, avec la position de la partie après confirmation de son enregistrement. Tous réunissent `motion`, `touch` et `mouse`, sans addition de scores ni regroupement par pseudo : un pseudo n’identifie pas une personne.

| Requête                                               | Usage                                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| `GET /api/stand/config`                               | Version de règles du stand                         |
| `POST /api/runs`                                      | Créer une partie avec pseudonyme, recette et mode  |
| `POST /api/runs/:id/finish`                           | Finaliser une partie connue                        |
| `PATCH /api/runs/:id/finish`                          | Même finalisation pour les clients utilisant PATCH |
| `GET /api/leaderboard?scope=all-time`                 | Général, toutes victoires et commandes             |
| `GET /api/leaderboard?scope=all-time&recipeId=burger` | Même historique, limité à une recette              |

`src/stand.ts` expose `getLeaderboard(recipeId = 'all', highlightEntryId?)` et demande explicitement `scope=all-time`. Le paramètre facultatif `highlightEntryId` est l’identifiant de la partie enregistrée, jamais le pseudo. La réponse contient `entries`, `total`, `highlight`, `scope` et `rulesVersion`. Chaque entrée porte son `rank` ; `highlight` vaut `{ entry, rank }` même hors du top renvoyé, ou `null` si cette partie n’appartient pas au classement demandé. `total` compte toutes les victoires du filtre.

Pour compatibilité, l’absence de `scope` conserve `current-rules`, limité aux règles courantes ; `mode` reste un filtre facultatif de l’API. L’interface actuelle n’envoie pas ce filtre. `rulesVersion` indique la version courante du serveur, tandis que chaque entrée conserve sa propre version.

Une finalisation identique peut être envoyée de nouveau sans créer de score supplémentaire : elle est idempotente. Une finalisation différente pour un identifiant déjà terminé est refusée. Les champs sont validés et des bornes de cohérence réduisent les résultats manifestement invalides. Le PC demeure l’autorité de calcul de la partie ; ces vérifications ne rejouent pas les mouvements pour prouver le score.

Les nouvelles parties utilisent **`stand-v0.5-hearts`**. La lecture `all-time` inclut aussi les victoires **`stand-v0.2`**, **`stand-v0.3-events`** et **`stand-v0.4-frenzy`**, sans modifier ni recalculer les fichiers historiques. Les règles de points et de survie ont changé : ces records conservés ne sont pas strictement comparables.

La validation reste attachée à la version de chaque partie. Le score courant est borné par les points de combo habituels, jusqu’à deux défis de 1 500 points et le mélange. Les cœurs n’augmentent pas la borne de hits ni de points. Avec les trois soins, la version actuelle permet jusqu’à six erreurs au total si la dernière épuise les vies, ou cinq si le joueur survit ; une bombe coûte jusqu’à deux vies mais compte pour une seule erreur. Les versions précédentes gardent leurs anciennes limites. Le validateur contrôle aussi le temps minimal nécessaire pour obtenir les soins indispensables au nombre d’erreurs déclaré. Ces contrôles restent des bornes de plausibilité, sans rejeu des mouvements.

Une partie qui change de commande, ou dont la source n’est pas identifiée, passe en partie libre : `App.tsx` n’envoie pas sa finalisation, et son enregistrement de départ peut rester sans résultat. Cette éligibilité est gérée par le PC, pas déduite des mouvements par le serveur. Les entrées classées sont triées par score décroissant, meilleur combo décroissant, date de fin croissante puis identifiant. La limite API par défaut est 20, configurable entre 1 et 100 ; elle ne tronque pas le calcul du rang de la partie recherchée. Le pseudonyme normalisé est limité à 2–20 caractères autorisés. Les résultats vérifient notamment les bornes de score, le nombre de coupes, la cohérence des cœurs et une durée plausible depuis la création de la partie.

Les écritures exigent une connexion de boucle locale, un en-tête `Host` local et une origine correspondant à cette adresse. Le PC du stand doit donc utiliser l’URL **localhost**. L’accès via l’IP LAN ou le domaine du tunnel n’autorise pas la création/finalisation, même si le proxy se connecte lui-même depuis la boucle locale. Le classement peut être lu séparément. Ce modèle sert un poste supervisé ; il ne remplace pas une authentification et un moteur serveur pour un tournoi public.

Les mutations sont séquencées dans le processus. Le fichier est écrit temporairement, synchronisé puis renommé pour remplacer le document, avec des permissions de fichier `0600`. Le stockage refuse de dépasser 10 000 parties. Un fichier de données illisible est conservé et bloque le démarrage au lieu d’être silencieusement remplacé. Ce stockage attend un seul processus par fichier et ne fournit pas une coordination multi-instance. Garder des sauvegardes distinctes ; le remplacement atomique n’est pas un historique de restauration.

Aucun compte, contact ou formulaire email n’est prévu. Chaque résultat conserve son pseudonyme, sa recette, sa commande et sa version de règles, même lorsque les tableaux réunissent ces catégories. Les mesures brutes de capteurs ne sont pas enregistrées comme historique du joueur.

## Découverte après la partie et essai guidé

`ResultDiscovery` est un lien facultatif sans état de jeu : il ouvre `/atelier#atelier-decouverte` dans un nouvel onglet, sans remplacer l’écran du résultat. Le début de l’atelier propose un parcours d’environ trente secondes : geste et capteurs → message validé par le relais → collision de la scène confirmée par le moteur. Les liens pointent vers les fichiers du [dépôt réel](https://github.com/rfielbal/cookingNinja). Les nombres d’exemple sont explicitement synthétiques, pas une capture des gestes du visiteur. La suite conserve les cinq responsabilités détaillées, les extraits de code et la simulation de calibration utilisant le vrai `MotionTracker` avec des angles fabriqués.

Avant la partie, `PracticeRange` propose un essai facultatif avec deux ingrédients de la recette à couper, puis un piège à laisser traverser l’écran. Couper ce piège recommence seulement son passage après un retour explicatif. L’exercice n’ajoute aucun point et ne retire aucune vie à la partie ; il peut être passé. Cette découverte des règles complète la calibration, elle ne la remplace pas.

## Vérifier sans confondre les preuves

```sh
npm run typecheck
npm test
npm run build
npm run format:check
```

Les tests de moteur prouvent les transitions et règles couvertes. Les tests WebSocket vérifient de vrais échanges locaux, mais ne mesurent pas le Wi-Fi d’un salon. Les tests synthétiques de capteurs vérifient des transformations et garde-fous, pas les capteurs physiques. Le rendu, le confort des gestes et le parcours d’un visiteur doivent aussi être contrôlés dans le navigateur et sur les appareils présentés. Le compte rendu des vérifications exécutées appartient à `docs/validation.md`, pas à une liste de promesses.

## Verrou du classement

Le fichier `stand.lock` refuse une seconde instance dans le même dossier de données. Un arrêt normal avec Ctrl+C le libère. Après un arrêt brutal ou une coupure de courant, il est conservé par prudence : arrêter toutes les instances, vérifier le PID indiqué dans ce fichier, sauvegarder `stand.json`, puis retirer uniquement `stand.lock` avant de relancer. Ne jamais retirer ce verrou pendant qu’un serveur utilise le dossier. Cette vérification manuelle évite une récupération automatique qui pourrait permettre deux écritures concurrentes.
