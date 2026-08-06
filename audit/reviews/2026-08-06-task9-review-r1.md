# Task 9 — registre de revue round 1/5

Date : 6 août 2026. Branche : `feat/jira-permission-schemes`.

## Findings Critical et Important

| Finding | Statut | Correction et preuve |
|---|---|---|
| Reset E2E destructif sans garde | Corrigé | `JIROO_ALLOW_E2E_RESET=1` obligatoire, protocole PostgreSQL, host `localhost`/`127.0.0.1`/`::1` et base `jiroo`/`jiroo_e2e`/`jiroo_test`. TDD : 7 cas RED puis GREEN. |
| Scénario 2 non causal | Corrigé | Le membre n’occupe aucun rôle direct ou protégé ; la base prouve uniquement `Équipe delivery → Spécialiste delivery` en CASS et aucune occupation LABS, puis Chromium prouve accès/refus. |
| Scénario 7 muté par service | Corrigé | Ajout et retrait de `browse_backlog` dans la matrice UI, via contexte admin séparé. Le second utilisateur vérifie navigation, recherche, récents, panneau notifications ouvert et URL directe. |
| Scénario 4 sans invariant de données | Corrigé | Le payload capturé est reciblé vers un nom neuf. Groupes, cible et historique sont capturés avant/après et restent strictement identiques. |
| Scénario 9 historique trop permissif | Corrigé | Baseline exacte `group_created`, événements A/B retrouvés par cible, valeur et corrélation, exactement `+2`, A inchangé byte-for-byte après B. |
| Fixture CASS non déterministe | Corrigé | `fixtureIds` joint explicitement `backlogs.key = CASS`. |
| Serveur existant réutilisable | Corrigé | Playwright lance le worktree sur `http://localhost:3100`, `reuseExistingServer: false`, avec `.next-e2e`; le serveur parent `:3000` n’est ni utilisé ni arrêté. |
| Preuves écrasables | Corrigé | Run-id unique, écriture des journaux en mode exclusif, reporter JUnit et captures persistantes refusant un fichier existant. |
| Captures BUG-JIR-024/025 ambiguës | Corrigé | BUG-JIR-024 qualifie explicitement AVANT/APRÈS sous gestionnaire limité. BUG-JIR-025 possède une capture ciblée de l’écran Rôles et une console propre. |
| Score insuffisamment causal | Corrigé | 82/100, Permissions 98 et Fiabilité 92 conservés seulement après les nouvelles assertions causales documentées dans `audit/README.md`. |

## Minor

- helper `expectedHttp` supprimé ; tout HTTP `4xx/5xx` est inattendu dans ces
  scénarios ;
- ancien répertoire `.playwright/.auth` supprimé avant chaque setup ;
- cinq storage states recréés avec permissions fichier `0600` ;
- storage states, traces, vidéos, rapports temporaires et `.next-e2e` restent
  exclus de Git.

## Runs immuables

- [Matrice dédiée — 10/10, 27,1 s](../runs/20260806-review-r1-permissions-01-junit.xml)
- [Régression Chromium — 24/24, 58,6 s](../runs/20260806-review-r1-chromium-01-junit.xml)

Les journaux dédiés portent tous le préfixe
`20260806-review-r1-permissions-01`. Les recherches de secrets TOTP, mot de
passe, cookies et recovery codes dans les artefacts versionnés ne retournent
aucun résultat.
