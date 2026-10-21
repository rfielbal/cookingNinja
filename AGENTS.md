# Travail sur CookingNinja

## Commits et publication

Après chaque modification significative du projet, vérifier le résultat, créer un commit et le pousser vers `origin/main`. Cette publication est demandée par le propriétaire du projet ; il n’est pas nécessaire de redemander son accord à chaque fois. Un simple redémarrage du serveur ne justifie pas de commit.

- Regrouper les changements qui répondent au même besoin. Ne pas mélanger des travaux sans rapport.
- Écrire les messages de commit en français naturel, avec les accents et une ponctuation claire. Décrire le changement concret, sans formule promotionnelle ni préfixe systématique en anglais.
- Exemples : « Corrige le suivi du doigt après un redimensionnement. » ou « Réunit les scores dans quatre classements. »
- Mettre à jour `CHANGELOG.md` pour les ajouts, corrections et changements visibles. Utiliser la date réelle ; ne pas inventer de commits ou de versions passés.
- Avant le commit, relire les fichiers ajoutés et `git diff --cached --check`. Inclure uniquement le travail concerné.
- Après le push, vérifier que `main` et `origin/main` désignent le même commit, puis annoncer brièvement ce qui a été publié.
- Ne jamais forcer un push ni réécrire l’historique distant sans demande explicite. Si le distant a avancé, examiner les différences et préserver le travail de chacun.
- Si la connexion ou l’authentification empêche le push, conserver le commit local et expliquer le blocage. Ne pas annoncer une publication non vérifiée.

## Vérifications

Pour une modification du code : `npm run typecheck`, les tests concernés, `npm run build` et `npm run format:check`. Exécuter `npm test` avant une publication qui touche plusieurs parties du jeu. Une modification de documentation seule demande une relecture et une vérification du diff, pas une nouvelle partie complète.

Contrôler le rendu dans le navigateur quand l’interface change. Distinguer les tests automatisés, les simulations navigateur et les essais physiques sur téléphone. Documenter les vérifications utiles dans `docs/validation.md`, sans promettre de performances non mesurées.

## Données et périmètre

- Ne jamais publier `data/`, les scores du stand, les certificats, les clés, les variables privées, les journaux ou les captures de test. Garder `.env.example` sans valeur confidentielle.
- Ne pas écraser les modifications locales existantes. Préserver le contrôleur tactile et les gestes gyroscopiques lors d’un changement visuel.
- Le jeu représente le Lycée Guy Mollet à Arras. Aucun formulaire de contact ni collecte d’email n’est prévu.
- Les essais serveur utilisent un `STAND_DATA_DIR` temporaire distinct du classement réel.
- Après un redémarrage avec `npm run phone`, vérifier l’accès local et la nouvelle adresse HTTPS. Le téléphone doit rescanner le QR actualisé.
