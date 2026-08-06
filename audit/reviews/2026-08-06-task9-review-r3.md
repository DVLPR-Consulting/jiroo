# Task 9 — registre de revue round 3/5

Date : 6 août 2026. Branche : `feat/jira-permission-schemes`.
Runtime de preuve : Node 24.13.0, pnpm 10.19.0.

## Findings bloquants

| Finding | Statut | Correction et preuve |
|---|---|---|
| Le nom `jiroo`/`jiroo_test` ne distinguait pas une instance locale de production | Corrigé | Seul `jiroo_e2e` passe la garde URL. Sur le même `PoolClient` que le `TRUNCATE`, `current_database()` et `pg_control_system().system_identifier` sont comparés au nom fixe et à `JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER` fourni explicitement. L’identifiant brut ne quitte pas la garde ; seul son SHA-256 est rendu. Tests unitaires absence/nom/divergence/correspondance, puis diagnostic réel 1/1 sur la base locale. |
| Un token d’environnement partageable autorisait la réentrance du lock | Corrigé | Toute notion de propriétaire/token a été supprimée. `globalSetup` réserve le run ID comme première opération, une seule fois, avec `open(..., 'wx', 0600)`. Le chargement de configuration ne réserve plus rien. Deux processus avec le même run ID et le même token hérité produisent exactement un succès et un refus ; le fichier `0600` ne contient pas le token. |
| Les anciens scénarios réécrivaient les preuves stables du 5 août | Corrigé | Les quatre specs passent par un helper commun. Journaux : création `wx` `0600`. Captures : écriture dans un temporaire conservant `.png`, puis publication par hard-link atomique exclusif. Chaque destination persistante est `audit/<type>/<run-id>-<ancien-basename>`. Les 187 fichiers d’audit déjà suivis ont des listes SHA-256 avant/après identiques, sans restauration. |
| La provenance du run n’était pas brute et vérifiable | Corrigé | Chaque `globalSetup` écrit avant reset un manifeste JSON exclusif `0600` avec Node/pnpm, SHA Git, `jiroo_e2e`, empreinte d’instance uniquement, `:3100`, run ID, horodatages, commande/scénarios et lien JUnit. Les deux runs probants pointent vers `1dbd74a0304badf9219b83f0df9ff7d11bf9a062`. |

## Cycle TDD et contrôle de sûreté

- garde de nom : deux cas RED (`jiroo`, `jiroo_test`), puis 25/25 GREEN après
  la garde d’identité ; requête effective couverte ensuite, 26/26 GREEN ;
- lock : ancien comportement RED avec deux processus acceptés, puis exactement
  un gagnant et un `EEXIST` ;
- artefacts : module absent RED, puis 3/3 GREEN sur chemin run-scoped, collision
  texte et collision capture ;
- manifeste : module absent RED, puis 2/2 GREEN sur contenu non secret et
  écriture exclusive ;
- le premier navigateur a exposé un temporaire sans extension : test RED sur
  le suffixe `.png`, correction GREEN, typecheck et lint avant nouveau commit.

Le run `20260806-review-r3-permissions-01` est volontairement conservé mais
n’est **pas** une preuve d’acceptation. L’argument `--` a sélectionné 24 tests et
12 captures ont échoué avec `unsupported mime type null`. Il référence le SHA
pré-correction `9938df3f897bca1f7341923335ecd00d66c67861` et son JUnit expose
24 tests, 12 erreurs. Son run ID n’a jamais été réutilisé.

## Runs immuables probants

- [Matrice permissions — 10/10, 25,4 s](../runs/20260806-review-r3-permissions-02-junit.xml)
  et son [manifeste](../runs/20260806-review-r3-permissions-02-manifest.json) ;
- [Régression Chromium — 24/24, 59,8 s](../runs/20260806-review-r3-chromium-01-junit.xml)
  et son [manifeste](../runs/20260806-review-r3-chromium-01-manifest.json) ;
- [preuve d’intégrité historique](../runs/20260806-review-r3-chromium-01-history-integrity.json) :
  187 fichiers, listes avant/après de même SHA-256, `identical: true`,
  `restorationPerformed: false` ;
- [capture BUG-JIR-024](../screenshots/20260806-review-r3-permissions-02-FIXED-BUG-JIR-024-protected-admin-group-membership-controls.png)
  et [capture BUG-JIR-025](../screenshots/20260806-review-r3-permissions-02-FIXED-BUG-JIR-025-project-role-blockers-clean-console.png).

La régression complète produit 60 fichiers run-scoped : 40 journaux, 18
captures, un manifeste et un JUnit. La matrice dédiée en produit 24 : 20
journaux, 2 captures, un manifeste et un JUnit. L’inspection visuelle de la
planche des 20 captures probantes ne révèle ni écran vide, ni erreur, ni
capture tronquée.

Les journaux probants ne contiennent aucune réponse HTTP 4xx/5xx inattendue.
Six `net::ERR_FAILED` sont exclusivement les POST interrompus volontairement
par les trois scénarios de rollback ; leurs journaux portent les marqueurs
`[expected]` et les invariants restaurés. Un scan des 88 fichiers texte round 3
ne trouve ni identifiant PostgreSQL brut, ni valeur locale de mot de passe,
secret, token ou `DATABASE_URL`.

## Vérifications Node 24

- tests ciblés sécurité : 32/32 ;
- diagnostic PostgreSQL local : 1/1 ;
- Vitest complet : 123 fichiers passés, 16 ignorés ; 1 023 tests passés,
  120 ignorés ;
- `pnpm typecheck`, `pnpm lint`, `pnpm build` : succès ;
- Chromium : 10/10 puis 24/24 ;
- `git diff --check` : succès.

Toutes les commandes de vérification utilisent explicitement
`PATH=/Users/nkrmr/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin`.
La commande opérateur qui capture l’identité sans l’afficher et sans inscrire
de secret dans l’historique est documentée dans [l’index d’audit](../README.md).
