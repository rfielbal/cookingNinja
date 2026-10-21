# Recherche technique — CookingNinja

Recherche initiale du 5 octobre 2026. Les choix ci-dessous concernent ce prototype précis ; ils ne désignent pas un moteur universellement supérieur.

## Décision

**TypeScript + React + Three.js pour le PC ; page web légère avec DeviceOrientation/DeviceMotion pour le téléphone ; Node.js + WebSocket pour l’appairage et les gestes.** Le gyroscope est la piste retenue pour le contrôle principal. Une API HTTP fournit la configuration, un code de salon associe les deux appareils, et le QR code transporte l’URL de la manette.

| Option | Intérêt pour ce projet | Décision |
| --- | --- | --- |
| TypeScript / Three.js / React | Même langage pour UI, moteur, réseau et manette ; accès direct aux API navigateur ; modèles 3D et interface personnalisables | Retenue pour la V0.1 |
| Godot / GDScript | Éditeur de scènes, pipeline jeu et physique intégrés ; exports natifs possibles | Alternative forte si le jeu devient une application PC plus ambitieuse ; le lien téléphone demande tout de même un serveur et une page dédiée |
| Unity / C# | Outillage 3D, animation, physique et vaste pipeline de production | Utile pour une équipe/production plus grande ; plus d’outillage à gérer pour ce petit jeu web avec interface téléphone |
| Flutter / Dart | Interfaces et application mobile native possibles | Pas retenu comme moteur 3D principal de ce jeu |

Godot exporte pour le Web avec WebGL 2 et son renderer Compatibility ; les exports multithreads ajoutent des exigences d’isolation. Unity documente aussi WebGL 2/WebAssembly et les navigateurs pris en charge. Ces solutions restent possibles : le choix web natif ici est une décision de simplicité d’intégration, sans benchmark comparatif prétendu. Sources : [Godot Web](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html), [Unity Web](https://docs.unity.com/en-us/engine/6000.5/manual/platform-specific/webgl/intro/browsercompatibility).

## Gyroscope : ce qu’il apporte et ce qu’il ne fait pas

`deviceorientation` expose des angles ; `devicemotion.rotationRate` expose des vitesses angulaires en degrés/seconde. Le contrôleur mémorise une pose de référence, transforme l’écart d’orientation en coordonnées normalisées et lisse le pointeur. Une rotation rapide active brièvement la lame. Le gyroscope est prioritaire ; la variation des angles est un secours signalé lorsqu’aucune vitesse gyroscopique ne parvient au navigateur. Pour le mélange, la vitesse de rotation domine et l’accélération peut compléter l’énergie mesurée.

Les seuils initiaux sont des paramètres de prototype, à ajuster par essais sur appareils. Un bouton de recentrage et un curseur de sensibilité permettent déjà d’adapter le contrôle. On ne double-intègre pas l’accélération pour inventer une position de sabre dans l’espace : sans suivi externe, les erreurs et dérives ne permettent pas une position absolue fiable.

Les API de mouvement sont restreintes aux contextes sécurisés. Certains navigateurs exigent une permission déclenchée par une interaction utilisateur. L’interface détecte les méthodes présentes et attend des événements réels ; une permission accordée ne suffit pas à déclarer le capteur fonctionnel. Sources : [orientation et permissions](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), [DeviceMotion](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent), [détecter l’orientation](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Detecting_device_orientation), [Permissions Policy W3C](https://www.w3.org/TR/orientation-event/#permissions).

## Connexion et latence

Le flux implémenté est `téléphone → WebSocket → serveur Node → PC`. Les messages de contrôle contiennent seulement `x`, `y`, `slash`, `stir`, `seq`. Émission environ 29 Hz, numéros de séquence croissants, valeurs validées et files d’envoi bornées. Le PC anime indépendamment le rendu ; un réseau lent ne doit pas bloquer la boucle graphique. La latence réelle n’est pas encore mesurée.

WebSocket fournit une intégration simple sur le même serveur HTTPS que le jeu. L’API navigateur n’offre pas de backpressure automatique : limitation de fréquence et contrôle de la file sont donc nécessaires. [Documentation WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).

WebRTC DataChannel pourra être évalué si les mesures montrent que le relais ajoute trop de délai. Il permet un transport pair-à-pair sécurisé, mais demande signalisation, négociation et parfois relais TURN. Il n’est pas automatiquement plus rapide dans toutes les conditions. Nous évitons de l’ajouter avant une mesure. [Data channels WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).

En local, HTTP est suffisant pour tester l’appairage et le pavé tactile, pas les capteurs du téléphone. Pour ceux-ci : certificat local approuvé ou HTTPS public. Un tunnel temporaire est une option d’essai ; un hébergement permanent avec support WebSocket sera préférable pour une expérience « scanner et jouer ». [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [mkcert](https://github.com/FiloSottile/mkcert).

## Rendu et optimisation

La V0.1 utilise WebGL 2 via Three.js. Le PC charge le rendu 3D ; la page téléphone charge uniquement React, l’interface et les capteurs. Les plats et aliments sont procéduraux : aucun téléchargement de texture, de modèle ni de police distante. Géométries et matériaux sont partagés, objets et particules plafonnés, densité de pixels limitée, animations d’accueil ralenties, ressources GPU libérées à la sortie. Un réglage allégé réduit le coût du rendu. Les cartes recettes utilisent SVG pour éviter plusieurs contextes WebGL.

Ces choix réduisent les coûts connus mais ne constituent pas une mesure de FPS sur le parc visé. Three.js requiert une libération explicite des matériaux, géométries et textures. Sources : [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [libération des ressources](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).

Pour la suite : modèles Blender exportés en glTF, textures compressées, pooling des objets après profilage, budget d’appels de dessin et effets ajustables. Le découpage géométrique exact demande un traitement dédié des maillages ; il ne doit pas être confondu avec les éclats actuels.

## Séparation du code et validation

Le moteur de règles ignore React, Three.js et le réseau. La scène ignore les recettes comme règles : elle reçoit des types d’aliments et signale une collision. Le protocole partagé valide les messages à la frontière réseau. Le calcul des gestes est également isolé et testé.

Les tests couvrent les pertes de cœurs, scores, répétitions, expiration, pause, mélange, calibration et saturation des valeurs, ainsi que de vrais échanges WebSocket locaux et la coexistence avec Vite HMR. Le code est typé strictement et le build produit des chunks séparés. Vite nécessite une version récente de Node ; la base choisie est Node22.12+. [Prérequis Vite](https://vite.dev/guide/).

## Prochaines étapes prioritaires

1. Essais réels Safari iPhone et Chrome Android : permissions, latence aller-retour, visée, confort, mouvement circulaire, mise en veille et reconnexion.
2. Réglage des trajectoires, seuils et quotas à partir de vraies parties. Mesurer la réussite par recette au lieu d’inventer un équilibrage validé.
3. Amélioration des assets, moitiés d’ingrédients, animation du plat servi, retours audio/haptiques. Une vibration ne doit rester qu’un bonus si le navigateur ne la supporte pas.
4. Mesures CPU/GPU et mémoire pendant plusieurs parties sur des machines différentes ; adaptation de qualité si utile.
5. Hébergement HTTPS permanent, protection contre les abus, journalisation minimale sans données brutes des capteurs, test de charge et politique de conservation explicite si une télémétrie est ajoutée.
