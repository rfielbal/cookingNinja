# Bruitages de CookingNinja

Sélection de **Kenney**, téléchargée depuis ses pages officielles le 27 octobre 2026 :

- [RPG Audio](https://kenney.nl/assets/rpg-audio), archive `kenney_rpg-audio.zip` : coupe, lame, tissu et récipient métallique.
- [Impact Sounds](https://kenney.nl/assets/impact-sounds), archive `kenney_impact-sounds.zip` : bois, impact sourd, plat et verre.

Les deux pages et les licences incluses dans les archives indiquent **Creative Commons Zero (CC0)**. Les textes originaux (fins de ligne normalisées, espaces de fin retirés) sont conservés dans `LICENSE-Kenney-rpg.txt` et `LICENSE-Kenney-impact.txt`. Ces sons sont des bruitages fournis par Kenney ; le projet ne prétend pas avoir enregistré chaque aliment en cuisine.

Les dix extraits livrés sont convertis d’OGG en WAV PCM 16 bits mono, 44 100 Hz, pour le décodage local des navigateurs. Traitement : silence d’attaque raccourci en conservant 3 ms avant le premier échantillon dépassant 0,012 ; durée bornée à 0,12–0,48 s selon l’objet (0,16 s pour les lames), crête ajustée à 0,72 avant fondus de 3 ms et 25 ms. Les noms d’origine, durées et SHA-256 source/final sont dans `manifest.json`.

Le code joue ces sons uniquement sur action, avec de légères variations de vitesse et une spatialisation. Le mélange assemble de courts frottements et contacts de récipient quand le geste est récent ; il ne s’agit pas d’un enregistrement de liquide. Aucune boucle d’ambiance, musique de fond, voix ni requête vers Kenney n’est utilisée pendant le jeu. Si un fichier local manque ou ne se décode pas, un bref bruitage percussif synthétique le remplace ; aucun événement passé n’est rejoué à la fin du chargement.
