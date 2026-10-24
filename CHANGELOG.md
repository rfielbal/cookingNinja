# Historique des changements

Les étapes antérieures à la publication sont reconstituées à partir de la documentation et des validations du projet. Elles décrivent son évolution fonctionnelle ; elles ne correspondent pas à des commits, des tags ou des instantanés Git conservés.

## 24 octobre 2026 — Un film en boucle pour le stand

- Ajout d’un film de présentation de 32 secondes : vrais ingrédients et plats 3D, téléphone animé, découpe, frénésie, mélange et invitation à jouer. Le montage reprend les couleurs du jeu et l’identité du Lycée Guy Mollet à Arras, avec de grands titres et une bande-son originale synthétisée.
- Le bouton « Mode stand » lance le MP4 local en boucle, sans son par défaut. Lecture, son, plein écran, téléchargement et accès aux coulisses sont disponibles ; les commandes se masquent au repos. Jouer, Entrée ou Échap permettent de retrouver l’accueil.
- Le salon et la connexion du téléphone restent ouverts derrière le film. La scène de jeu est suspendue et les commandes de partie sont ignorées pendant la présentation. Le raccourci Entrée est arrêté dans le lecteur pour ne pas déclencher aussi celui du menu.
- Un studio séparé, `/film`, permet de revoir les sept plans et de régénérer la vidéo avec sa bande-son. Le lecteur du stand utilise le fichier exporté : il ne recalcule pas les animations 3D du film à chaque boucle.

## 23 octobre 2026 — L’atelier devient un diaporama visuel

- Refonte de l’atelier en six étapes : geste, relais et QR, aliments 3D, coupe et règles, mélange, puis résultat et classement. Les explications courtes accompagnent les animations ; les boutons précédent/suivant et le clavier permettent d’avancer à son rythme.
- Les démonstrations 3D réutilisent les vrais modèles procéduraux de `FoodFactory` dans une scène propre à l’atelier. Leurs mouvements, messages et scores sont illustratifs ; ils ne proviennent pas de la partie du visiteur.
- Le code et les liens vers les fichiers du projet restent accessibles dans un volet facultatif. La longue page à cartes et la simulation de calibration sont remplacées par ce parcours.
- L’invitation après partie devient « Entrez dans les coulisses du jeu » et annonce « 6 étapes animées ». Elle conserve l’ouverture dans un nouvel onglet et l’adresse `/atelier#atelier-decouverte`.

## 23 octobre 2026 — Prise en main et découverte du projet

- Le tutoriel utilise les vrais modèles de la recette : deux ingrédients à couper, puis un piège à laisser passer. Une erreur fait recommencer seulement le passage du piège, sans toucher aux vies ni au score. L’essai se suspend lorsque la commande est indisponible ou qu’un dialogue masque le jeu.
- Le diagnostic distingue la connexion au serveur, l’association du téléphone et les commandes reçues. Sur le téléphone, il précise le contexte sécurisé, la fraîcheur des capteurs et le centrage, avec une action adaptée et un accès au tactile.
- Le QR est masqué pendant une déconnexion. Les erreurs de configuration sont expliquées ; le lien est actualisable et les adresses locales inutilisables depuis un autre appareil sont refusées.
- Après la partie, un lien ouvre une découverte du trajet du geste dans un nouvel onglet, en conservant le résultat. L’atelier relie les trois étapes aux fichiers du dépôt.
- Les explications de collision, de bouclier, de soins et de classement sont remises en accord avec les règles actuelles.

## 21 octobre 2026 — État initial publié sur GitHub

- Publication du jeu dans son état actuel, avec son code, ses tests et ses guides d’installation, d’architecture et de préparation du salon.
- Ajout de cet historique pour situer les évolutions réalisées avant l’ouverture du dépôt.

## 20 octobre 2026 — Commandes, événements et ambiance arcade

- Lancement, pause et reprise depuis le téléphone après préparation sur le PC ; sélecteur gyroscope/tactile permanent. Changer de commande met la partie en pause et la poursuit hors classement.
- Suivi tactile par segments, envois espacés de 34 ms environ et curseur animé hors des rendus React. Correction du doigt perdu lors d’un redimensionnement et du passage du compte à rebours au jeu ; reprise du compte à rebours synchronisée avec la scène.
- Premiers événements, puis frénésies accélérant réellement les aliments, bouclier de dix secondes, ralenti, bombes et défis de découpe de trois secondes sur les ingrédients rares. Les coupes répétées du défi deviennent indépendantes de la fréquence des mouvements reçus, sans points à l’arrêt.
- Rares plus lumineux et reconnaissables ; cœurs bonbons permettant de récupérer une vie, avec trois occasions au maximum et sans dépasser trois cœurs.
- Ambiance vert foncé, décors propres aux recettes, flèches de mélange et lames cosmétiques Zeste, Menthe et Prune synchronisées entre PC et téléphone. Effets adaptés au mouvement réduit et à la qualité allégée ; ingrédients présentés sans badges ni textes attachés.
- Bruitages de lame, d’ingrédients et d’événements, ambiance de cuisine et mélange sonore. Correction de l’activation audio au clavier et ajout d’un test sonore explicite dans les réglages.
- Quatre classements à l’accueil : général, burger, tacos et gâteau ; deux après une partie : général et recette jouée. Podiums et place de la partie affichés, y compris hors des premières lignes, avec conservation des victoires de toutes les commandes et versions historiques.

Les identifiants `stand-v0.3-events`, `stand-v0.4-frenzy` et `stand-v0.5-hearts` suivent les changements de règles de cette journée : ce ne sont ni des versions du paquet npm ni des tags de publication. Les anciens scores sont conservés sans recalcul, malgré des règles qui ne sont pas strictement comparables.

## 12 octobre 2026 — Préparation du salon

- Identité **Lycée Guy Mollet, Arras — BTS SIO**, menu enrichi, saisie du pseudo et parcours « Joueur suivant » renouvelant l’appairage.
- Calibration guidée, trois cibles d’entraînement, recentrage et pause après perte de la commande.
- Classement persistant dans un fichier JSON : écriture atomique, enregistrement idempotent et verrou empêchant deux serveurs d’écrire simultanément.
- Création de l’espace pédagogique `/atelier` et des guides pour l’oral et le réseau du salon, sans collecte de contacts ni d’adresses email.

## 5 octobre 2026 — Premier prototype jouable

- Accueil, sélection et préparation de trois recettes : burger, tacos et gâteau.
- Aliments 3D procéduraux, coupe par gestes, ingrédients pièges, trois cœurs, score et combos ; 80 secondes de découpe suivies de huit secondes de mélange.
- Contrôleur téléphone appairé par QR code et WebSocket, calibration des mouvements, modes souris et tactile de secours.
- Lancement HTTPS temporaire par Cloudflare pour essayer les capteurs depuis le téléphone, avec tests des règles, des mouvements et du relais.

Les corrections tactiles et audio ont été reproduites puis vérifiées dans Chromium, avec tests automatisés et échanges WebSocket réels ; ces contrôles et leurs simulations documentées ne mesurent pas les capteurs, la latence ou le confort sur des téléphones physiques — voir [les preuves et limites de validation](docs/validation.md).
