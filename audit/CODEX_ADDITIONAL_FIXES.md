# JIR-136 — Corrections complémentaires

Base `b0b6c72`, code final `188f93c`, branche locale `audit/jir-136-codex-counter-audit`. Aucun push, PR, fusion ou déploiement effectué. Les hooks Husky sont restés actifs sur chaque commit : typecheck et lint, avec le seul avertissement préexistant de `lib/auth/client.ts:8`.

| Constat | Commit | Régression et résultat |
|---|---|---|
| CA-01 — reprise Drizzle/PostgreSQL | `f52c294` | `lib/services/with-retry.test.ts` : erreur enveloppée et erreur non rejouable ; `with-retry.integration.test.ts` : vraie violation unique, transaction annulée puis seconde tentative réussie. RED→GREEN. |
| CA-02 — chemin des descendants en corbeille | `012454a` | `items.integration.test.ts`, « restores a deleted descendant under its parent's current path » : parent, ltree, profondeur et cascade ultérieure. RED→GREEN. |
| CA-03 — rang des sprints | `511fa65` | `sprints.integration.test.ts`, « does not reuse the rank of an active sprint before the first planned sprint » : ordre planifié attendu et rangs distincts. RED→GREEN. |
| CA-04 — métadonnées privées | `220a4ae` | `authorization-disclosure.integration.test.ts` : gestionnaire sans browse, deux backlogs cachés, grants groupe/rôle, bypass global, catalogue privé/partagé et accès partiel ; `authorization.test.ts` : réponse publique limitée et invalidations conservées ; tests de pages : acteur transmis. Reproductions RED puis GREEN, parcours E2E permissions. |
| CA-05 — N+1 des accès | `95c39c3` | `authorization-admin.integration.test.ts`, « reads administrator-removal guards with a fixed query count at 1 and 100 occupants » : retrait interdit avec un seul administrateur, autorisé pour les 100, requêtes 7/403 avant puis 7/7 après. |
| CA-06 — liens concurrents | `6469d69` | `links.integration.test.ts` : quatre scénarios blocks/relates × UUID minuscules/mixtes, vraie barrière PostgreSQL et une seule création autorisée ; `lib/items/links.test.ts` : normalisation et auto-lien. RED→GREEN. |
| CA-07 — agrégat du calendrier | `6bc158f` | `presence-page.integration.test.ts` : 2 000 résultats, limite, ordre et requêtes stables, lecture répétée, plusieurs backlogs et période antérieure vide ; 11 tests DB verts. Comparaison EXPLAIN et égalité des lignes avant/après conservées dans les preuves. |
| CA-08 — fixture d'autorisation indépendante | `56b2b5b` | `lib/auth/request-cache.integration.test.ts` : contributeur propriétaire d'un backlog provisionné, autorisation réellement accordée, parité et économie de requêtes ; deux tests verts après échec sur l'ancien premier utilisateur arbitraire. |
| CA-09 — clés de fixtures | `188f93c` | `items.integration.test.ts` : les trois clés sont réservées dans la séquence commune ; `presence-scope.integration.test.ts` : clés du lot uniques et entropie conservée ; 51 tests ciblés verts après deux violations uniques observées dans la suite DB. |

Les nouvelles régressions s'ajoutent aux assertions métier existantes. Aucun test rouge ni sonde temporaire n'est livré. Aucune migration, dépendance ou modification du calculateur burndown n'est introduite.

## Vérification consolidée

- `corepack pnpm typecheck` : vert ; `corepack pnpm lint` : vert, seul avertissement préexistant `lib/auth/client.ts:8`.
- `corepack pnpm test --project unit` : **3 370 réussis, 1 ignoré**, 291 fichiers.
- `JIROO_RUN_DB_TESTS=1 corepack pnpm test --project db` sur la base jetable `jiroo_e2e`, avec consentement et identité explicitement fournis au garde : **499 réussis, 5 ignorés**, 51 fichiers réussis et 1 ignoré. Aucun test rouge final.
- `corepack pnpm build` : vert sur `188f93c`.
- `corepack pnpm test:e2e e2e/permission-schemes.spec.ts` : **10/10 Chromium**, base fraîche sur le même conteneur jetable, révision `188f93c`, run `codex-jir136-final-20261029`, inventaire 24 artefacts. Un premier passage de 10/10 est conservé séparément.
- Relectures indépendantes des neuf corrections : avis favorables ; elles ne remplacent pas la revue Claude/CI de la PR à venir.


Preuves : [validation et mesures](reviews/codex-jir136-verification.json), [journal E2E final](runs/codex-jir136-final-20261029-junit.xml), [inventaire E2E final](runs/codex-jir136-final-20261029-manifest.json). Les artefacts du premier passage restent conservés ; ce passage avait été lancé avec le correctif de sécurité encore non commité, au-dessus de `511fa65`. Le passage final est celui à utiliser pour relier la preuve à la révision livrée.

Aucune instruction du dépôt modifiée : le changement de niveau de titre produit par `next dev` a été annulé après arrêt du serveur.
