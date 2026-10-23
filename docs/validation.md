# Atelier en diaporama animé — 23 octobre 2026

Le serveur d’essai utilise `/tmp/cookingninja-slideshow-oct23-qa`. Cette refonte porte sur l’atelier et son invitation après partie ; le contrôleur, le tutoriel de jeu et les règles de score restent inchangés.

- **136 tests réussis** ; TypeScript, build de production et vérification Prettier réussis. Les quatre extraits de code du guide ont été retrouvés dans leurs fichiers sources ; les deux autres exemples sont explicitement simplifiés.
- Six étapes parcourues dans Chromium : geste, connexion, vol des ingrédients, coupe, mélange et résultat. Un seul canvas présent ; aucun `pageerror` observé sur ce parcours. Modèles issus de `FoodFactory`, couleurs, lisibilité et volet de code inspectés dans les captures `output/playwright/deck-*.png`, exclues du dépôt.
- Rendu PC en **1440 × 960** et **1280 × 720** : document de même taille que le viewport, sans défilement requis. Les six étapes ont aussi été contrôlées en **390 × 844**, sans débordement horizontal. Sur ce format, précédent/suivant restent fixés en bas ; changer d’étape revient au début de l’explication.
- L’inclinaison illustrée du téléphone change avec l’animation et se fige en pause. Les flèches du clavier et la touche Fin changent l’étape ; ouvrir le code suspend cette navigation et Échap ferme le volet. Le mouvement réduit garde la démonstration au repos.
- Interactions de découpe contrôlées : tomate **+100 points**, poisson **−1 cœur**, poisson avec bouclier **aucun cœur perdu**. Ces nombres illustrent une seule coupe ; ils ne sont ni un score de partie ni un résultat enregistré. Le retour reste lisible après l’animation, jusqu’à la prochaine action ou sélection.
- La jauge de mélange a été séparée de la rotation du fouet pour représenter une progression cumulée. Sur un chargement neuf du build de production, elle reste à **0** sans action, atteint environ **0,319** après une action puis conserve cette valeur au repos ; une seconde action l’amène vers **0,638**. Ces valeurs contrôlent l’illustration, pas le traitement d’un capteur réel.
- WebGL désactivé artificiellement dans un contexte neuf : message de repli visible, navigation vers l’étape suivante possible, aucun `pageerror`. Ce test simule une indisponibilité graphique.
- Le build de production sur **5174** a été ouvert dans le navigateur et le volet de code contrôlé. Aucun serveur de jeu ni tunnel n’a été redémarré pour cette évolution ; aucune partie classée n’a été jouée.

Les gestes, messages réseau et classements de ce diaporama sont des illustrations autonomes. Ces essais ne mesurent ni performances GPU, ni capteurs, ni latence sur un téléphone physique. L’atelier n’ouvre pas de connexion de manette et ne collecte aucune donnée de visiteur.

---

# Tutoriel, diagnostic et découverte du projet — 23 octobre 2026

Les essais utilisent `/tmp/cookingninja-tutorial-oct23-qa`, séparé des données du stand. Les règles de score, le suivi tactile et le traitement des gestes gyroscopiques ne changent pas.

## Vérifications automatisées

- **136 tests réussis**, `npm run typecheck`, `npm run build` et `npm run format:check` réussis.
- Dix nouveaux tests du tutoriel : ingrédients propres à chaque recette, deux coupes puis évitement, erreur et nouvel essai du piège, suspension, absence de pont entre deux touchers, gestes stationnaires, mesures périmées, changement de commande, redimensionnement et taille de collision.
- Huit nouveaux tests du diagnostic : sélection de l’adresse courante, refus de localhost et des variantes loopback, configuration invalide, distinction entre association et commandes reçues, perte de connexion, capteurs périmés, centrage et repli tactile en HTTP.

## Parcours navigateur

- Deux contextes Chromium reliés par de vrais WebSockets, avec une manette en 390 × 844 : appairage, choix du tactile et entraînement sur le burger. Les déplacements du pointeur passent par les gestionnaires du pavé, le suivi tactile et le relais. Pain et tomate coupés, poisson coupé volontairement puis laissé passer au nouvel essai ; les trois vies et le score nul restent inchangés.
- Pendant le passage du piège, ouverture du diagnostic PC : la progression reste à `0,09805882352941858` pendant 3,8 secondes. Fermeture du dialogue, reprise du passage et réussite du tutoriel. Le lancement depuis la manette démarre ensuite le compte à rebours et retire le tutoriel.
- Ingrédient initial adapté aux trois recettes contrôlé : pain, tortilla et farine. Rendu inspecté sur PC à 1440 × 1000 et en 390 × 844 ; aucun débordement horizontal constaté sur le tutoriel ou la manette dans ces formats.
- Sur la manette, diagnostic tactile prêt et distinction entre le contexte sécurisé de localhost et une vraie adresse HTTPS vérifiés. Avec des événements `DeviceOrientationEvent` **synthétiques**, la calibration passe à « Gyroscope prêt », puis l’arrêt des événements fait disparaître cet état ; l’action de réactivation apparaît et le retour au tactile reste possible. Ce contrôle ne sollicite aucun capteur physique.
- Dans un composant d’appairage isolé, avec configuration HTTP **simulée** : QR, lien et code masqués lorsque le serveur est hors ligne, adresse manuelle abandonnée lors d’une nouvelle salle, adresse localhost refusée et réponse HTTP 503 expliquée sans QR.
- L’écran de défaite a été obtenu en forçant des dégâts dans le moteur du navigateur pour vérifier le lien de découverte. Cet état artificiel est incohérent avec les statistiques d’une partie réelle : le serveur refuse son enregistrement en HTTP 400, comme attendu. Le lien ouvre `/atelier#atelier-decouverte` dans un nouvel onglet et conserve le texte du résultat d’origine. Cet essai ne valide ni une victoire complète ni l’enregistrement d’un score réel.
- Atelier inspecté sur écran large et en 390 × 844 : trois étapes lisibles, liens vers les vrais fichiers et exemple de message clairement synthétique. Les cartes de découverte passent sur une colonne sur petit écran.
- Le build de production déjà servi sur **5174** répond en HTTP 200 ; QR, diagnostic et trois cartes de découverte chargés dans un contexte neuf, sans `pageerror` observé. Aucun redémarrage ni lancement de partie classée effectué pour ce contrôle.

## Portée

Les captures restent dans `output/playwright/`, hors du dépôt. Ces vérifications couvrent le code et Chromium sur ce Mac, avec des interactions et des échanges réseau locaux. Elles ne mesurent pas la latence, les capteurs, Safari ou le confort d’un téléphone physique. L’accessibilité du tunnel depuis le réseau d’un visiteur n’a pas été revalidée pendant cette évolution.

---

# Activation audio et quatre classements — 20 octobre 2026

Les tests utilisent `/tmp/cookingninja-audio-boards-qa`. Aucun score de démonstration n’a été ajouté aux données du stand.

## Audio : défaut reproduit et portée de la correction

- Sur l’ancienne version de production, un contexte Chromium neuf navigue avec **Entrée**, puis **Entrée** jusqu’à la préparation, sans clic : **zéro `AudioContext` créé**. Le même parcours sur la nouvelle version crée **un contexte `running`**. L’ancien écouteur clavier placé sur le conteneur React ne recevait pas ces raccourcis ciblant le document.
- L’activation couvre maintenant clic, relâchement tactile et clavier. Le défaut tactile est établi par le code et les règles d’activation du navigateur ; aucun appareil Safari physique n’a été instrumenté.
- Dans Chromium, contexte réellement suspendu puis appui maintenu sur « Tester le son sur le PC » : l’état reste suspendu jusqu’au clic, puis passe à `running`, sans activer la sourdine. Un analyseur après compression mesure un pic non nul de 0,037. La sourdine donne ensuite zéro source.
- Les réglages distinguent l’activation du navigateur et la sourdine. Le test joue deux notes et confirme leur programmation, pas leur audibilité sur l’appareil de l’utilisateur. Un contexte refusé, fermé, interrompu ou dont la reprise reste en attente a une voie de récupération au prochain geste. Les tests annulés ne réapparaissent pas après un changement d’état.
- **14 tests audio** couvrent reprise, expiration, interruptions simulées, statuts, annulations et nettoyage. Ces doublures ne prouvent pas le comportement d’un haut-parleur, d’un téléphone ou d’une version de Safari réelle.

## Classements et interface

- **118 tests réussis**, TypeScript strict, format et build de production réussis.
- Tests API et stockage : général toutes recettes, trois recettes, commandes et versions historiques réunies ; tri score/combo/date/identifiant ; rang hors du top ; pseudos homonymes non fusionnés ; lecture sans modification de l’historique. L’ancien périmètre `current-rules` reste le défaut de l’API, l’interface demande explicitement `all-time`.
- Accueil et fenêtre classement : quatre tableaux visibles. Résultat : général et recette jouée. Les réponses observées n’ont aucun filtre `mode`.
- Les captures `output/playwright/boards-*-fixture.png` utilisent **30 scores fictifs injectés uniquement comme réponses HTTP dans le navigateur**. La victoire et sa réponse d’enregistrement sont également simulées pour vérifier les deux tableaux de résultat et le rafraîchissement. Elles ne sont pas des résultats réels ni des données livrées.
- La fixture affiche correctement les rangs **28 au général et 10 sur la recette**, hors des lignes visibles. L’identification se fait par l’identifiant de partie, jamais par le pseudo.
- Rendu inspecté à 1440 × 1000 et à 390 × 844. Largeur du document mobile égale à 390 px, cartes de 356 px, sans débordement horizontal. La couronne a `animation-name: none` avec mouvement réduit. États vides, podiums, pseudonymes longs et test sonore inspectés.
- Production relancée sur **5174** : quatre tableaux chargés sans état d’erreur et API `scope=all-time` en HTTP 200, avec les quatre victoires historiques alors présentes. Nouveau contrôleur public en HTTPS, contexte sécurisé, appairage WebSocket et lancement disponible vérifiés, sans démarrer de partie classée. Test sonore explicite également exécuté dans le build de production. Les simulations HTTP ont été retirées avant ces contrôles ; le fichier du stand conserve son SHA-256 d’avant redémarrage.

---

# Rares lumineux, cœurs et bruitages — 20 octobre 2026

Les essais utilisent `/tmp/cookingninja-hearts-audio-qa`, séparé des données du stand. Les règles passent à `stand-v0.5-hearts`. Le joueur a confirmé la résolution du problème tactile avant cette demande ; le suivi tactile n’a pas été modifié dans cette évolution.

## Vérifications exécutées

- **107 tests réussis**, TypeScript strict, format Prettier et build de production réussis.
- Moteur : trois occasions de soin au maximum, absence à vie pleine, récupération plafonnée à trois vies, aucun point/hit/combo ajouté, comportement en pause et focus, occasions non différées. Validation des erreurs supplémentaires après soin et conservation des règles historiques du classement.
- Audio : sept tests avec doublures contrôlent le déverrouillage, les permissions asynchrones, les états muet/pause/arrière-plan, les notes futures annulées, le tampon partagé, le plafond de 24 sources, le mélange périmé et le nettoyage. Ils ne remplacent pas une écoute.
- Dans une fixture Chromium, comparaison d’une tomate ordinaire, d’une tomate rare et du cœur bonbon : aura, rayons et étincelles visibles, aliment reconnaissable, sans badge ni texte attaché. Capture `output/playwright/hearts-rare-comparison.png`.
- Première coupe du rare via la collision de la scène : entrée en défi, conservation de l’objet et zoom lumineux contrôlés dans `hearts-rare-focus.png`. Le chronomètre est figé par la fixture pour examiner le rendu ; les règles temporelles restent couvertes par les tests moteur.
- Coupe du cœur par la collision réelle de la scène : **2 → 3 vies**, `livesRecovered=1`, score conservé à 400, combo conservé à 4, zéro hit et zéro erreur ajoutés. Retour rose « +1 cœur » et cœurs du HUD inspectés dans `hearts-collect.png`. La position et l’état initial sont préparés dans le navigateur.
- Le véritable contexte Web Audio de Chromium est passé à `running` après les clics de préparation. Un analyseur branché après la compression a mesuré un signal non nul pendant le soin, puis un signal nul et **zéro source** après activation de la sourdine. La pause conserve également zéro source.
- Mélange dans une fixture : énergie à 1 puis arrêt volontaire des mises à jour. Le signal mesuré était non nul après 60 ms, puis nul après 460 ms. Le fondu est programmé à partir de 150 ms sur l’horloge audio ; ce test ne mesure pas un geste physique.
- Production relancée sur **5174**, API confirmant `stand-v0.5-hearts`. Contrôleur HTTPS en HTTP 200, contexte sécurisé, appairage WebSocket et bouton « Lancer la partie » actif vérifiés dans un second contexte Chromium mobile, sans lancer de partie classée. Aucun `pageerror` pendant ce parcours. Le SHA-256 de `data/stand.json` est resté identique entre l’arrêt et cette vérification.

## Portée

Le rendu et le graphe audio sont contrôlés dans Chromium sur ce Mac. L’équilibrage, le volume perçu, le confort au casque/haut-parleurs et les performances des téléphones du salon restent à apprécier en situation. Aucun gain de FPS ou mesure de capteurs physiques n’est déduit de ces essais.

---

# Frénésie, bouclier et défi de découpe — 20 octobre 2026

Les essais utilisent `/tmp/cookingninja-events4-qa`, séparé des données du stand. Les règles passent à `stand-v0.4-frenzy`.

## Vérifications exécutées

- **91 tests réussis**, TypeScript strict, Prettier et build de production réussis.
- Tests du moteur : frénésie avec vitesse ×1,65 et cadence ×1,5 sans points doublés ; bouclier de 10 secondes sans gain immédiat ; pièges et bombes bloqués ; expiration ; défi de 3 secondes, points versés à la fin, première coupe comptée une seule fois, pause et priorité aux ingrédients manquants.
- Validation des scores calculés par les trois recettes et conservation des anciens classements dans leurs versions historiques.
- Dans une fixture Chromium, une étoile a donné 10 secondes de protection, zéro point et zéro hit. Le piège suivant a conservé les trois cœurs et zéro erreur. Les deux coupes passent par la collision de la scène et le callback du moteur.
- Dans une fixture Chromium, le fruit brillant reste dans la scène après sa première coupe. Le défi a accepté 23 coupes sur trois secondes réelles : 1 150 points de bonus, 100 points pour l’ingrédient, un seul hit et une seule tomate dans la recette. Le temps de recette et les 7 secondes de bouclier sont restés inchangés. Le fruit est retiré après le versement.
- Rendu du zoom, du compteur de coupes, du bouclier et de la frénésie inspecté dans `output/playwright/events4-*.png`. Les positions initiales et l’entrée dans les événements sont préparées dans le navigateur : ce sont des contrôles de transitions et de rendu, pas une mesure d’équilibrage.
- Défi depuis un second contexte mobile Chromium, avec vrais messages WebSocket : 17 coupes acceptées, 850 points de bonus et un seul ingrédient compté. Le téléphone reste dans son viewport 390 × 844 sans défilement nécessaire.
- Pause du défi : les 3 secondes restent figées ; reprise puis disparition du voile. Mouvement réduit : l’annonce animée de frénésie est cachée, le défi se termine normalement. Reprise d’un compte à rebours avec 1 ms restante : le moteur **et** la scène entrent dans `playing`.
- Vérification numérique de la scène : 12 balayages donnent 12 coups à 30, 120 et 240 événements/s ; 500 appels immobiles ne produisent aucun point. La distance est cumulée uniquement à l’intérieur du fruit, puis remise à zéro à la sortie ou en pause.
- Serveur de production relancé sur 5174 avec les règles `stand-v0.4-frenzy`. Le nouveau contrôleur HTTPS répond en HTTP 200 ; contexte sécurisé, appairage WebSocket et lancement disponible vérifiés dans le navigateur, sans lancer de partie classée. Le fichier `data/stand.json` conserve le même SHA-256 avant/après. Le serveur de test sur 5173 a été arrêté.

## Diagnostic tactile : défaut reproduit et correction ciblée

**Avant correction**, avec le pointeur maintenu : déplacement à `x=0,40`, viewport mobile passant de 390 × 844 à 390 × 760, puis déplacement à `x=0,70`. `ResizeObserver` appelait `cancel()` : `pointerId` passait de `1` à `null`, et la position restait bloquée à `0,40` malgré le mouvement. Ce scénario reproduit un blocage réel dans Chromium ; le déclenchement par la barre Safari d’un appareil physique n’a pas été observé.

**Après correction**, le même scénario conserve `pointerId=1` et atteint `x=0,70` sans relever le doigt. Le recalage seul donne `slash=false`, `stir=0` ; il ne coupe donc pas à cause d’un changement de mise en page. Les nouvelles coordonnées sont calculées depuis le dernier point client, y compris quand le pavé change de position. Le passage `countdown → playing` conserve aussi le doigt, vide les anciens segments et accepte le mouvement suivant. Les annulations réelles, pauses, changements de mode et pertes de visibilité conservent leur neutralisation.

Deux contextes Chromium, dont un viewport mobile, ont utilisé le relais de production local. Sur le relevé stable : envois espacés de 33,83 ms en moyenne (maximum 36 ms), réceptions PC de 34,00 ms en moyenne (95e centile 35,1 ms, maximum 36,6 ms). Aucun blocage n’a été reproduit dans ces conditions. Les 545 rappels `requestAnimationFrame` observés sur le PC sont un indicateur d’ordonnancement, pas une mesure du débit GPU ni des FPS d’un téléphone.

Un écho supplémentaire de 60 messages via deux WebSockets locaux a donné une médiane de 0,6 ms et un 95e centile de 1,1 ms aller-retour. Il mesure la boucle locale seule. Après redémarrage et résolution du nouveau domaine HTTPS, 60 échos passant par le tunnel ont donné **43,8 ms de médiane, 149,3 ms au 95e centile et 168 ms au maximum**. Les deux extrémités sont ici sur ce Mac ; ce n’est pas une mesure de téléphone sur 5G. Cette variabilité confirme qu’il faut distinguer la neutralisation fautive du toucher et le délai de transport. La première tentative de connexion au nouveau domaine avait échoué en DNS ; DNS puis HTTP puis WebSocket ont ensuite été vérifiés.

Ces résultats ne couvrent pas Safari physique, les capteurs réels ou la liaison 5G d’un visiteur. Ils servent à distinguer le suivi du geste, le transport et le rendu. La validation précédente ci-dessous ne prouvait pas la disparition du problème tactile signalé par l’utilisateur, et le correctif actuel n’est pas une garantie contre toute latence réseau.

---

# Améliorations du 20 octobre 2026 — tactile, effets et événements

Les essais utilisent `/tmp/cookingninja-arcade-qa`, séparé du classement du stand.

## Vérifications exécutées

- **84 tests réussis** : règles de jeu et événements, capteurs, gestes tactiles, protocole, relais WebSocket, lancement HTTPS et classement. Les nouveaux cas couvrent les flicks entre deux envois, l’absence de pont entre deux touchers, les annulations, l’expiration des gestes après 150 ms, les rushs, les bonus, les bombes, le ralenti et la séparation des anciens records.
- TypeScript strict, build de production et vérification Prettier réussis.
- Deux contextes Chromium reliés par WebSocket : lancement depuis le téléphone, compte à rebours réel, pause et reprise. Passage gyro sans données capteur : pause et reprise bloquée ; retour au tactile : reprise possible.
- Coupe depuis le pavé sur un ingrédient placé au centre dans une **fixture navigateur** : un paquet `slash` avec `fromX/fromY`, un seul aliment compté, +100 points. Le geste traverse le relais et la collision réelle ; la trajectoire de cet aliment est figée pour rendre le test déterministe.
- Gestes circulaires sur le pavé pendant le mélange : la jauge du PC progresse, puis pause depuis le téléphone. Ce contrôle utilise une transition au mélange préparée dans le navigateur, sans prétendre avoir joué une recette complète.
- Rendu inspecté à 1440 × 1000 et manette à 390 × 844, 320 × 640 et 844 × 390. Pas de débordement horizontal ni de défilement vertical nécessaire sur les trois formats actifs testés ; pavé et commandes restent dans le viewport.
- Modèles 3D seuls en vol, sans contours, badges ni textes attachés aux objets. Orientation du poisson et des ingrédients fins ajustée pour rester identifiable.
- Cadre rouge, perte de cœur, étoiles, sablier, palette ralenti, bannière rush et flèches autour du bol inspectés avec des états préparés dans le navigateur. Le cadre d’erreur disparaît aussi avec le mouvement réduit ; son tremblement et son animation CSS sont alors désactivés.
- Relecture croisée : la scène utilise le même plafond de temps par image que le moteur ; les effets d’une coupe sont produits seulement après acceptation du hit par le moteur.
- Serveur de production relancé sur **5174** : API locale et contrôleur HTTPS public en HTTP 200 ; contexte sécurisé, appairage WebSocket réel et bouton de lancement disponible sur la manette publique. Aucune partie lancée dans le classement réel pour ce contrôle. L’ancien processus étant arrêté, son verrou résiduel a été archivé avant relance ; les résultats du stand sont conservés.
- Captures dans `output/playwright/arcade-*.png`. Les fichiers `arcade-natural-final.png`, `arcade-mixing-final.png` et `arcade-phone-final.png` montrent le rendu final sans annotations sur les objets.

## Portée et limites

Les gestes et les capteurs physiques d’un iPhone/Android n’ont pas été mesurés. La correction supprime les rendus React à chaque échantillon, conserve les flicks courts, borne les envois et évite de rejouer une file de gestes anciens ; elle ne constitue pas une mesure de latence sur Wi-Fi ou 5G. Le rendu de la scène évite une passe d’ombres inutile pendant le vol et les flous répétés sur les segments, mais aucun nombre de FPS matériel n’est promis.

Les événements et les limites de score sont validés par les tests. Les scènes forcées et horloges avancées servent à contrôler les visuels et les transitions, pas à prouver l’équilibrage avec des visiteurs. L’ancienne validation complète de victoire ci-dessous concerne les règles précédentes. La nouvelle version `stand-v0.3-events` garde les anciennes parties en stockage et les exclut de ses classements.

---

# Correctifs du 20 octobre 2026 — commandes téléphone et ambiance arcade

Les essais locaux utilisent `/tmp/cookingninja-oct20-qa`, séparé du classement du stand.

## Vérifications exécutées

- **64 tests réussis** : règles, calculs de mouvements, lancement HTTPS, validation du protocole, relais WebSocket et classement. Les nouveaux cas couvrent les actions/réglages du téléphone, l’usurpation des rôles, les messages invalides, la limitation de fréquence distincte des mouvements et la reprise du compte à rebours.
- TypeScript strict, build de production et `npm run format:check` réussis.
- Deux contextes Chromium reliés par WebSocket : lancement de la partie depuis le téléphone, compte à rebours réel, pause et reprise à distance.
- Passage tactile → gyroscope pendant la partie : pause sur le PC et reprise bloquée tant que les capteurs ne sont pas prêts. Retour tactile → reprise ; indication « Partie libre » après changement de commande.
- Lame Menthe sélectionnée sur le PC conservée après connexion du téléphone ; sélection Prune sur le téléphone répercutée sur le PC.
- Réponse de démarrage volontairement retardée dans le navigateur de test : ouvrir les réglages pendant cette attente empêche le compte à rebours de démarrer derrière la fenêtre.
- Rendu inspecté à 1440 × 1000, 390 × 844 et téléphone 320 × 640. Menu, préparation, aliments sur fond sombre, contrôleur et résultat lisibles ; absence de débordement horizontal vérifiée sur menu, résultat et petit contrôleur. Le dock reste dans le viewport 320 × 640.
- Préférence de mouvement réduit vérifiée : animation CSS du résultat désactivée.
- Production sur 5174 et nouveau tunnel HTTPS : API publique en HTTP 200, contexte sécurisé, appairage WebSocket réel et bouton de lancement disponible après activation du tactile. Aucune partie de test créée dans le classement réel pour cette vérification.
- Captures dans `output/playwright/dojo-*.png`.

## Simulation visuelle distincte

L’écran de victoire a été contrôlé avec un résultat injecté **uniquement dans le navigateur de test** (5 420 points, 32 coupes, combo ×8), et une réponse d’enregistrement simulée. Cela vérifie le compteur, les confettis, la disposition et les actions du résultat ; ce n’est ni une partie complète jouée, ni un score réellement enregistré. Le code source et les règles du jeu n’ont pas été modifiés pour cette fixture.

## Limites

Le changement de mode et les commandes ont été vérifiés dans Chromium, pas avec les capteurs d’un téléphone physique. Le confort de visée, les permissions Safari/Android et les performances matérielles restent à essayer sur les appareils du salon. Les règles de partie et le classement ne changent pas.

---

# Validation de la V0.2 — salon

Vérifications effectuées le 12 octobre 2026 sur ce Mac. Les scores de test utilisent `/tmp/cookingninja-salon-qa`, séparé du dossier `data/` du stand.

## Automatisation

- TypeScript strict et compilation de production : réussis.
- Prettier : conforme sur tous les chemins du script `format:check`.
- **52 tests réussis** : 6 règles, 18 mouvements, 14 relais WebSocket, 5 utilitaires de lancement et 9 cas de classement/persistance.
- Le classement est testé avec une horloge injectée : durée plausible, score borné, victoire/échec, tri par mode, idempotence, redémarrage, écritures concurrentes, refus Host/Origin public derrière loopback, pseudo invalide et fichier corrompu.
- Le verrou interdit un second propriétaire du fichier et se libère à la fermeture. Un verrou laissé après incident exige une vérification manuelle : pas de récupération concurrente automatique.

## Chromium : parcours exécutés

- Nouveau menu, recette suivante/précédente, saisie du pseudo et préparation. Identité Lycée Guy Mollet, Arras visible.
- Une partie complète sur le chronomètre réel : tirage rendu déterministe dans le seul navigateur de test, coupes par événements de pointeur, 8 secondes de mélange, victoire à **14 350 points / 72 coupes**, puis persistance et présence dans le classement Burger/Souris. Cela valide le parcours, pas l’équilibrage ni un niveau de joueur.
- Deux contextes de navigateur : appairage réel par WebSocket ; permissions détectées ; événements d’orientation/mouvement synthétiques stables ; calibration ; **3 cibles sur 3** réussies via ces événements ; début de partie ; arrêt des événements ; retour en calibration côté contrôleur et pause côté PC.
- Mode tactile : consigne adaptée, connexion effective et passage à la souris vérifiés. Le bouton de changement de joueur en pause renouvelle le code ; l’ancien téléphone reçoit la fermeture de sa cuisine.
- Production sur 5174 : route contrôleur HTTPS publique en HTTP 200, contexte sécurisé et appairage WebSocket avec le PC localhost vérifiés via le nouveau tunnel. Le lien est temporaire et ne constitue pas une configuration du salon.
- Affichage desktop 1440 × 900 et mobile 390 × 844 : accueil, classement, contrôleur et atelier inspectés. Absence de débordement horizontal vérifiée pour accueil et atelier.
- Captures dans `output/playwright/salon-*.png`, ignorées par Git.

## Limites

Les événements synthétiques ne prouvent pas le confort sur un iPhone/Android réel. Le maintien d’écran a été demandé dans Chromium ; sa résistance au verrouillage et à la batterie faible reste à tester matériellement. Ni débit de visiteurs, ni latence Wi-Fi, ni FPS matériel ne sont présentés comme mesurés. Le LAN HTTPS sans Internet n’est pas installé : domaine/certificat/DNS et répétition WAN coupé restent à préparer. Le classement fait confiance au PC supervisé ; ses bornes ne remplacent pas un moteur serveur faisant autorité.

---

# Validation de la V0.1

Vérifications effectuées le 5 octobre 2026 sur ce Mac.

## Vérifications automatiques

- TypeScript strict : réussi.
- Build de production Vite : réussi.
- Formatage Prettier : conforme.
- **34 tests réussis** : 6 règles de jeu, 12 calculs de mouvements, 11 échanges réseau, 5 utilitaires du lancement HTTPS.
- Audit npm sans vulnérabilité signalée lors de l’installation. Cela ne remplace pas un audit applicatif.

## Parcours dans Chromium

- Accueil, trois cartes recettes, préparation, lancement à la souris, HUD et aliments 3D.
- Coupes réellement effectuées par mouvements de souris : score et combo augmentent ; trois pièges mènent au résultat de défaite.
- Partie complète de victoire : tirages rendus déterministes **uniquement dans le navigateur de test**, collisions et chronomètres réels, phase de mélange de huit secondes puis résultat gagné. Cette fixture vérifie l’enchaînement ; elle ne prouve pas l’équilibrage en partie aléatoire.
- Deux contextes de navigateur : appairage, démarrage bloqué avant contrôleur actif, démarrage après activation et pause après déconnexion.
- Rendu vérifié à 1440 × 1080 et à 390 × 844. Débordement décoratif de l’accueil mobile corrigé ; largeur finale contrôlée sans défilement horizontal.
- Captures locales dans `output/playwright/` (ignorées par Git).

## HTTPS réellement essayé

`cloudflared` a été installé et `npm run phone` a lancé le serveur de production sur le port 5174 avec un tunnel temporaire. Le test a ouvert la page contrôleur par l’URL HTTPS publique, vérifié `isSecureContext === true`, puis effectué l’appairage WebSocket avec le PC local. La route `/controller` a aussi répondu 200 à une requête GET externe.

La calibration a été exercée avec des événements `DeviceOrientationEvent` / `DeviceMotionEvent` **synthétiques**, après attente de l’installation des écouteurs. Le contrôleur a affiché le mode mouvement calibré. Ce n’est pas une mesure des capteurs matériels.

Le lien Cloudflare et les codes de salon sont temporaires : ils ne sont pas inscrits comme configuration permanente du projet. Une nouvelle commande génère un nouveau lien et un nouveau QR code.

## Reste à valider sur appareils réels

- Autorisations, fréquence des événements et axes sur Safari iPhone et Chrome Android.
- Confort de visée, seuil de coupe, calibration et gestuelle de mélange.
- Équilibrage des trois recettes avec des joueurs et des tirages aléatoires.
- Latence Wi-Fi/Internet, interruptions prolongées, consommation batterie et mise en veille.
- Performances CPU/GPU et mémoire sur plusieurs ordinateurs. Aucune promesse de FPS mesuré n’est faite.

La découpe en V0.1 produit des éclats et des traînées ; elle ne scinde pas encore les maillages en deux morceaux exacts.
