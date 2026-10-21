# Historique des changements

Les étapes antérieures à la publication sont reconstituées à partir de la documentation et des validations du projet. Elles décrivent son évolution fonctionnelle ; elles ne correspondent pas à des commits, des tags ou des instantanés Git conservés.

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
