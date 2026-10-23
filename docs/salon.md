# CookingNinja au salon — Lycée Guy Mollet, Arras

Support de préparation pour une démonstration BTS SIO. Le visiteur utilise son propre téléphone ; l’exposant garde la maîtrise du PC et du classement. Après la partie, une invitation facultative ouvre `/atelier#atelier-decouverte` dans un nouvel onglet : trente secondes pour comprendre le trajet du geste, en conservant le résultat.

## Le choix pour cette version

Conserver **TypeScript, React, Three.js et le relais Node.js/WebSocket**. Le jeu, les règles et le contrôleur existent déjà dans cette stack : le besoin du salon est de rendre ce parcours fiable et compréhensible, pas de changer de moteur.

| Élément               | Ce qu’il apporte ici                                           | Sa limite concrète                                                                                     |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| TypeScript            | Types partagés et règles testables sans rendu                  | Les types disparaissent à l’exécution : le serveur doit valider les messages reçus                     |
| React                 | Écrans PC, contrôleur et espace pédagogique dans le navigateur | Les mises à jour d’interface ne doivent pas piloter chaque image 3D                                    |
| Three.js              | Modèles procéduraux, animation et collisions projetées         | Gestion manuelle des ressources, qualité et compatibilité GPU à vérifier                               |
| Node.js + WebSocket   | Appairage et transport des mouvements sur le même serveur      | Le relais et le réseau peuvent ajouter du délai ; aucune latence matérielle universelle n’est annoncée |
| Navigateur mobile     | QR code, aucun téléchargement d’application                    | HTTPS, permission utilisateur et capteurs disponibles selon l’appareil                                 |
| Fichier JSON du stand | Persistance locale lisible, sans installer un SGBD             | Un processus par fichier ; réécriture du document et capacité bornée                                   |

Un moteur natif comme Godot ou Unity deviendrait intéressant avec un pipeline 3D plus ambitieux. Il ne supprimerait ni le problème HTTPS du contrôleur web ni les différences de téléphones. WebRTC peut aussi être étudié après mesure de la latence, mais ajouterait signalisation et gestion des connexions. Ces pistes ne sont pas des composants livrés.

SQLite reste une évolution cohérente pour des recherches, transactions et volumes plus importants sur le poste : sa documentation décrit précisément l’usage comme stockage local d’application. Il **n’est pas utilisé dans cette version**. Le JSON actuel est un choix de périmètre, pas une affirmation de supériorité sur SQLite. Une architecture distribuée nécessiterait une étude distincte. [Usages appropriés de SQLite](https://www.sqlite.org/whentouse.html).

## Trois scénarios de connexion

### 1. Avec Internet : HTTPS par tunnel

Le parcours actuellement préparé est `npm run phone` : compilation de production, serveur PC et lien HTTPS temporaire Cloudflare. Le PC ouvre **l’adresse localhost affichée**, généralement `http://localhost:5174`. Le visiteur scanne le QR HTTPS et accepte les mouvements dans son navigateur.

Avantages : pas de certificat à installer sur le téléphone, pas de domaine à acheter pour un essai, possibilité d’utiliser les données mobiles du visiteur si le Wi-Fi du salon pose problème. Contraintes : Internet sur le PC et sur le téléphone, transit par un service externe, nouvelle adresse et nouveau QR après relance. Les Quick Tunnels sont prévus pour les essais, sans garantie de disponibilité. Pour un événement annoncé à l’avance, préférer un domaine et un tunnel stables préparés en amont, tout en gardant le secours local. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Une fois démarré, vérifier `/api/config`, le QR et un appairage réel. `PUBLIC_ORIGIN` indique l’origine HTTPS au jeu ; cette variable ne crée pas de tunnel à elle seule.

En cas de blocage, lire le diagnostic de **Connecter mon téléphone** : serveur, association, puis commandes récentes. Sur le téléphone, les détails distinguent adresse sécurisée, capteurs et centrage, ou tactile prêt. Le PC ne peut pas confirmer les permissions du téléphone à sa place. **Actualiser le lien** recharge la configuration et le QR ; ces indicateurs ne constituent ni un test Internet ni une mesure de latence.

### 2. Sans Internet : LAN HTTPS avec confiance publique

**Scénario possible, non configuré automatiquement par le projet.** Il faut préparer avant le salon :

1. Un vrai nom de domaine contrôlé par l’organisateur, par exemple `jeu.votre-domaine.fr` — ce nom est un exemple à remplacer.
2. Un certificat public valide pour ce nom, obtenu avant l’événement, avec sa chaîne complète et sa clé privée conservée sur le serveur. Le défi ACME **DNS-01** permet de prouver le contrôle du domaine sans exposer le serveur web à Internet pendant l’émission. Il ne valide pas une adresse IP privée. [Let’s Encrypt : DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge).
3. Un routeur/Wi-Fi local qui résout ce nom vers l’IP privée fixe du PC et autorise les communications entre visiteurs et serveur. Le téléphone ouvre le **nom HTTPS**, pas une IP à la place du nom inscrit dans le certificat.
4. Une terminaison TLS locale, par exemple un reverse proxy sur le PC, qui sert ce certificat et transmet HTTP et WebSocket au serveur CookingNinja, en conservant les en-têtes `Host` et `Origin` des visiteurs. Le projet accepte aussi `HTTPS_KEY_FILE` et `HTTPS_CERT_FILE`, mais le proxy permet de garder l’écran opérateur sur `http://localhost:5173` pour les écritures du classement.
5. `PUBLIC_ORIGIN=https://jeu.votre-domaine.fr` côté application, afin que le QR et la liste d’origines WebSocket utilisent le même nom. Le proxy, les DNS et les certificats restent une configuration d’infrastructure à réaliser.

Les fichiers du jeu et les polices sont servis localement. Après préparation, le chemin de jeu peut donc rester sur le LAN ; l’émission et le renouvellement du certificat demandent une préparation avec accès au DNS public. Tester en coupant réellement la liaison Internet : résolution DNS, chaîne de confiance, Wi-Fi sans accès Internet, éventuel DNS privé du téléphone et reconnexion doivent être vérifiés sur les appareils cibles. Ce plan n’est pas une promesse « hors ligne garanti » avant ces essais.

Ne pas demander aux visiteurs d’installer une autorité de certification, un profil de gestion ou d’ignorer une alerte TLS. Une configuration `mkcert` peut convenir à un téléphone de test maîtrisé ; elle n’est pas le parcours BYOD du stand.

### 3. Secours : LAN HTTP + pavé tactile, ou souris

Le téléphone peut utiliser le pavé tactile sur le même réseau local en HTTP ; le PC peut toujours être joué à la souris. **Le mode capteurs ne doit pas être annoncé fonctionnel sur une simple IP LAN en HTTP.** `localhost` est une exception locale au navigateur concerné : `localhost` sur le téléphone désigne le téléphone, pas le PC. [MDN : contextes sécurisés](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

En cas d’échec des permissions ou de capteur absent, proposer ce secours rapidement avec le sélecteur **Gyroscope / Tactile**, toujours accessible sur le téléphone connecté. Choisir la commande avant le départ et la conserver pendant cette partie ; les classements réunissent toutes les commandes. Un changement en cours de jeu met la partie en pause : elle peut reprendre mais devient une partie libre, hors classement, même en revenant au mode initial. Pour un score classé en tactile, démarrer une nouvelle partie dans ce mode. Ne pas retarder toute la file pour un téléphone incompatible.

## Le passage d’un visiteur

Prévoir au départ **un créneau de 2 à 3 minutes**, incluant appairage, explication, jeu et relève. C’est une hypothèse d’organisation à mesurer, pas un débit constaté. La partie comporte 3 secondes de décompte, 80 secondes de découpe et, si les ingrédients sont prêts, 8 secondes de mélange. Les deux défis d’ingrédients brillants peuvent ajouter jusqu’à 6 secondes en figeant le chronomètre de recette. Prévoir séparément le temps de découverte pédagogique si le visiteur souhaite rester.

1. Choisir un pseudonyme de démonstration et une recette **sur le PC**, puis sélectionner **Téléphone** dans la préparation. Aucun compte ni adresse email ne sont demandés.
2. Scanner le QR, activer les capteurs par le bouton du téléphone et attendre des mesures réelles. Une permission accordée ne prouve pas que les événements arrivent. [MDN : permissions d’orientation](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static).
3. Recentrer depuis une pose confortable et proposer **Tester mes gestes** : couper deux ingrédients de la recette, puis laisser passer un piège. Si le piège est coupé, seul ce passage recommence après une courte pause ; aucun score ni cœur de partie n’est affecté. L’essai est facultatif. Adapter la sensibilité si nécessaire. Le téléphone doit rester fermement tenu ; les grands gestes ne sont pas utiles.
4. Toucher **Lancer la partie** sur le téléphone lorsque la commande est prête. Le bouton permet ensuite de mettre en pause et de reprendre. Le PC doit rester au premier plan, sans dialogue ouvert. Le joueur commence avec trois vies : sans bouclier, un piège coûte une vie et une bombe jusqu’à deux. L’étoile protège de ces dégâts pendant dix secondes de jeu actif. Jusqu’à trois cœurs peuvent apparaître si une vie manque ; les couper rend une vie, sans dépasser trois. À zéro vie, la partie se termine. Un ingrédient manqué ne retire pas de cœur. Pour gagner, remplir la recette puis atteindre au moins 35 % de la jauge de mélange.
5. Vérifier le résultat et son enregistrement avant de quitter l’écran. Le menu présente **quatre classements historiques** : général, burger, tacos et gâteau ; le résultat montre le général et la recette jouée. Ils réunissent gyroscope, tactile et souris, sans addition des scores ni regroupement par pseudo. Les versions de règles sont conservées ; leurs scores ne sont pas strictement comparables.
6. Proposer, sans l’imposer, **Comment votre geste devient une coupe ?** : le nouvel onglet présente capteurs/geste → message → coupe en trente secondes, puis les vrais fichiers du projet. Les valeurs illustratives sont synthétiques, pas une lecture du téléphone du visiteur. Pour poursuivre l’explication, demander au visiteur quelle étape il aimerait comprendre.
7. Revenir à l’onglet du résultat et choisir **Joueur suivant** : nouveau pseudo et nouveau salon, ancien téléphone détaché. Accueillir le prochain visiteur.

Le maintien d’écran éveillé est une aide, pas une garantie. Le système peut refuser ou libérer un Wake Lock, notamment lorsque l’onglet n’est plus visible ou selon l’état de batterie. Garder l’onglet de la manette au premier plan et prévoir la reprise/recalibration. [MDN : Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

Après interruption, recentrer si demandé puis reprendre explicitement depuis le téléphone ou le PC. Les boutons du téléphone transmettent une demande au PC : ils ne choisissent ni recette ni pseudo à sa place et ne contournent pas l’attente de mesures fraîches.

Le visiteur peut choisir une lame **Zeste, Menthe ou Prune** depuis le PC ou le téléphone. La couleur du pointeur et des effets change, sans modifier la portée, les points ni l’éligibilité au classement. Les définitions sont communes dans `shared/blades.ts` ; le navigateur PC mémorise le choix localement et le synchronise avec le contrôleur.

Le menu et la partie partagent une palette vert foncé avec halos chauds. Les anneaux, motifs culinaires et poussières restent derrière les aliments ; les arrivées du bol et du plat ainsi que la victoire sont animées. Pour une démonstration confortable, vérifier la préférence système de mouvement réduit et le réglage de qualité allégée sur le matériel réellement utilisé. Ils réduisent les effets décoratifs et leur coût, sans supprimer les mouvements nécessaires au jeu.

## Résultats et sécurité du stand

Les résultats éligibles sont stockés sur le PC, dans `data/stand.json` par défaut ; `STAND_DATA_DIR` permet de choisir un autre dossier. Seul le poste local, ouvert via `localhost` ou une adresse de boucle locale autorisée, peut créer et finaliser une partie. L’adresse publique du tunnel et l’adresse IP LAN ne donnent pas ce droit. Les requêtes d’écriture vérifient la connexion locale, le nom d’hôte et l’origine ; le lecteur du classement reste séparé. Seules les victoires apparaissent au classement, même si les échecs finalisés sont aussi conservés. Si la commande change ou n’est pas identifiée pendant la partie, le PC affiche **Partie libre** et ne finalise pas ce résultat pour le classement.

Cette restriction évite d’ouvrir une API de score publique aux téléphones. Elle ne transforme pas le moteur client en arbitre inviolable : une personne qui contrôle le poste peut encore fabriquer un résultat cohérent. Le classement est prévu pour une démonstration supervisée. Les pseudonymes et scores sont visibles dans le classement ; ne pas utiliser d’identité personnelle nécessairement reconnaissable.

L’écriture par remplacement atomique réduit le risque de document partiellement écrit ; elle ne remplace pas une sauvegarde. Avant le salon, après une répétition réussie, puis à la clôture : arrêter proprement l’instance, copier le fichier de résultats réellement utilisé vers un emplacement distinct et vérifier que la copie est lisible. Ne pas lancer deux processus écrivant dans le même fichier. Ne pas effacer le classement réel pour une démonstration de test ; utiliser un fichier de données séparé.

## Checklist de répétition

- [ ] Exécuter types, tests, build et vérification de formatage sur la version qui sera présentée.
- [ ] Depuis un résultat, ouvrir la découverte dans un nouvel onglet, retrouver le résultat intact et pouvoir montrer les fichiers correspondants.
- [ ] Essayer au moins un iPhone et un Android disponibles, noter modèle, navigateur et résultat réellement observé.
- [ ] Lire le diagnostic sur chaque écran, actualiser le lien et vérifier qu’un QR périmé ou localhost n’est pas proposé pendant une coupure.
- [ ] Recentrer puis essayer les deux bons ingrédients et le piège ; vérifier que couper le piège fait recommencer ce passage sans perte de vie ni de score.
- [ ] Effectuer une partie complète pour chaque commande présentée, ainsi qu’un passage qui ignore volontairement l’essai facultatif.
- [ ] Choisir recette et pseudo sur le PC, puis lancer, mettre en pause et reprendre depuis le téléphone.
- [ ] Basculer entre Gyroscope et Tactile : vérifier la pause, la préparation de la nouvelle commande et le statut hors classement de cette partie.
- [ ] Choisir chaque lame sur les deux écrans, vérifier la synchronisation et la mémorisation du choix côté PC.
- [ ] Contrôler la lisibilité des aliments sur le fond vert, le mouvement réduit et le mode de qualité allégée.
- [ ] Vérifier retour d’arrière-plan, verrouillage écran, rotation, déconnexion et arrivée d’un nouveau téléphone.
- [ ] Vérifier que le nouveau visiteur ne reprend pas les mouvements ou la partie du précédent.
- [ ] Vérifier piège, bombe, bouclier et soin : jamais plus de trois vies, un ingrédient manqué sans dégât.
- [ ] Vérifier une victoire, un échec, un doublon d’envoi du même résultat, les quatre tableaux au menu et les deux tableaux du résultat, toutes commandes réunies.
- [ ] Préparer l’adresse locale du PC, le nouveau QR, la souris, les alimentations et le scénario de secours réseau.
- [ ] Sauvegarder les résultats et vérifier le chemin effectif du fichier, surtout si plusieurs ports ou instances ont été utilisés.
- [ ] Chronométrer plusieurs passages réels et adapter le créneau proposé.

Les cases sont une préparation à faire, pas un compte rendu de tests déjà réalisés. Les validations exécutées doivent être consignées séparément, avec leurs limites, dans `docs/validation.md`.

## Verrou du classement

Le fichier `stand.lock` refuse une seconde instance dans le même dossier de données. Un arrêt normal avec Ctrl+C le libère. Après un arrêt brutal ou une coupure de courant, il est conservé par prudence : arrêter toutes les instances, vérifier le PID indiqué dans ce fichier, sauvegarder `stand.json`, puis retirer uniquement `stand.lock` avant de relancer. Ne jamais retirer ce verrou pendant qu’un serveur utilise le dossier. Cette vérification manuelle évite une récupération automatique qui pourrait permettre deux écritures concurrentes.
