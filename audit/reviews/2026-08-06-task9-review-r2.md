# Task 9 — registre de revue round 2/5

Date : 6 août 2026. Branche : `feat/jira-permission-schemes`.
Runtime de preuve : Node 24.13.0, pnpm 10.19.0.

## Findings bloquants

| Finding | Statut | Correction et preuve |
|---|---|---|
| Query overrides PostgreSQL après validation de `URL.hostname` | Corrigé | L’inspection du vrai `pg.Client` prouve que `?host=db.example.com`, `?host=%2Fvar%2Frun%2Fpostgresql` et `?port=6543` remplacent l’autorité. La garde refuse les clés de destination (`host`, `hostaddr`, `port`, `database`/`dbname`, `service`, servicefile, socket et équivalents), refuse les inconnues par défaut et conserve seulement une liste TLS/app-name sans effet sur la destination. TDD : 11 cas RED, puis 19/19 GREEN. |
| `test:e2e` injectait son propre consentement destructif | Corrigé | `package.json` ne définit plus `JIROO_ALLOW_E2E_RESET`. Une exécution sans variable échoue dans `globalSetup` avant le reset. Les preuves certifiées fournissent explicitement `JIROO_ALLOW_E2E_RESET=1` et ciblent la base locale dédiée `jiroo_e2e`, migrée avec 26 tables. |
| TOCTOU entre `existsSync` et les écritures de preuve | Corrigé | Chaque run-id acquiert un lock `wx` `0600` avant le reporter. Un test lance deux processus Playwright concurrents : exactement un gagne. Un token propriétaire autorise les relectures de config par les workers du seul gagnant ; le test de réentrance a été observé RED puis GREEN. JUnit, journaux et captures gardent leurs protections non-écrasables. |

Le premier essai `20260806-review-r2-permissions-01` a révélé la relecture de la
configuration dans le worker et reste réservé ; son identifiant n’a pas été
réutilisé. Le run probant emploie le nouvel identifiant `-02`.

## Invocation opérateur

La commande ordinaire ne consent à aucun reset. Une base dédiée déjà migrée est
requise pour la preuve destructive :

```sh
JIROO_ALLOW_E2E_RESET=1 \
DATABASE_URL='postgres://<identifiants-locaux>@localhost:5433/jiroo_e2e' \
pnpm --ignore-workspace test:e2e
```

Le contrôle de garde reste triple : consentement exact `1`, hôte local strict,
nom de base allowlisté. La validation des paramètres de connexion ajoute une
quatrième barrière deny-by-default.

## Runs immuables

- [Matrice dédiée — 10/10, 26,4 s](../runs/20260806-review-r2-permissions-02-junit.xml)
- [Régression Chromium — 24/24, 62,0 s](../runs/20260806-review-r2-chromium-01-junit.xml)
- [BUG-JIR-024 — contrôles protégés absents](../screenshots/20260806-review-r2-permissions-02-FIXED-BUG-JIR-024-protected-admin-group-membership-controls.png)
- [BUG-JIR-025 — blockers de rôle sans erreur console](../screenshots/20260806-review-r2-permissions-02-FIXED-BUG-JIR-025-project-role-blockers-clean-console.png)

Les dix paires de journaux portent le préfixe
`20260806-review-r2-permissions-02`. Les anciens runs et les preuves stables
2026-08-05/round 1 ont été restaurés à leur contenu historique après la
régression complète.
