# JIR-136 — Contre-audit indépendant

Date : 29 octobre 2026. Base : `b0b6c72684d11b8b6c778325f3d357f1649f9375` (PR #168).
Branche locale : `audit/jir-136-codex-counter-audit`. Révision du code livré : `188f93c`.

## Verdict

Neuf corrections locales sont livrées : six constats importants et trois mineurs. Aucun défaut de gravité bloquante n'a été démontré dans le périmètre examiné. Trois constats importants restent ouverts : deux dans le chantier d'identité historique **JIR-138**, un sur la suppression d'une tâche d'un sprint planifié, dont la règle reste à arbitrer.

La fiabilité est renforcée par des reproductions réelles PostgreSQL, des contrôles de concurrence et une vérification E2E des permissions. Ce résultat ne constitue pas une certification de sécurité ni un feu vert général à la production : les cas historiques de sprint restent problématiques, les limites d'accessibilité déjà recensées restent distinctes, et aucun déploiement n'a été vérifié.

## Méthode et portée

Lecture des instructions, de la gouvernance, des spécifications pertinentes sous `docs/superpowers`, de `audit/README.md`, `bugs.md`, `ux.md`, `roadmap.md`, `benchmark.md` et `matrix.md`. Les anciens fichiers et artefacts n'ont pas été réécrits. Leurs scores et passages historiques ne sont pas des mesures de la révision courante ; aucune nouvelle note numérique n'est attribuée.

Examen indépendant des permissions et de l'isolation, des frontières d'actions/API, des services de tickets et de liens, des statuts/workflows, sprints/rapports, releases, lecteurs de recherche/détail/roadmap/présences, transactions, schéma et tests. Trois lectures spécialisées en parallèle ont produit des hypothèses ; les constats corrigés ont ensuite été reproduits et vérifiés par l'agent principal. Chaque correctif livré a reçu une relecture indépendante ; les trois premiers ont été relus ensemble.

Exécution exclusivement locale : Node 24.18.1, pnpm 10.34.5 via Corepack, PostgreSQL 17 dans `jiroo-jir136-tmp`, tmpfs, port 5460. Base `jiroo_audit` pour les investigations et `jiroo_e2e` sur le même conteneur pour le garde d'identité, la suite finale et Playwright. Aucun `.env`, accès Neon, port 5433, push, PR, écriture Linear ou déploiement.

## Constats corrigés

| ID | Gravité | Défaut et scénario confirmé | Correction / preuve |
|---|---|---|---|
| CA-01 | Important | `items.ts:335` ne lisait que `error.code`. Drizzle enveloppe le code PostgreSQL dans `cause`, donc la reprise prévue ne se produisait pas. | `f52c294`. Régression pure utilisant `DrizzleQueryError`, puis vraie violation unique Drizzle en transaction : RED avant, GREEN après. Erreur non rejouable conservée. |
| CA-02 | Important | `items.ts:1204` excluait les descendants en corbeille de la réécriture ltree. A → E → T, supprimer T, déplacer E sous B, restaurer T : `parentId` correct, chemin encore sous A. | `012454a`. Le sous-arbre déplacé inclut les éléments supprimés. Test DB vérifiant chemin, profondeur puis nouvelle suppression en cascade depuis B. |
| CA-03 | Important | `sprints.ts:181` classait uniquement les sprints planifiés, alors que l'unicité du rang couvre tous les états. S1 actif=`a0`, S2 planifié=`a1`, S3 planifié=`a2` : placer S3 avant S2 tentait de réutiliser `a0`, erreur 23505. | `511fa65`. Sous le verrou backlog existant, choisir un rang libre parmi tous les états sans sortir des bornes planifiées. Régression DB RED→GREEN. |
| CA-04 | Important | Les bloqueurs de groupes/rôles divulguaient les noms des backlogs non consultables ; les noms de schémas privés encodent aussi des UUID. Le catalogue Accès divulguait ces schémas et les comptes d'usage cachés. Les réponses `add/removeGroupMemberAction` livraient clés et UUID des backlogs affectés. | `220a4ae`. Masquage SQL via `browseAccessPredicate`, références cachées regroupées/dédoublonnées, compteurs visibles seulement, acteur transmis par les pages. Catalogue partagé conservé, privés filtrés par propriétaire lisible, bypass plateforme conservé. Réponse d'appartenance limitée à `{groupId,userId}`, invalidation interne complète. Tests DB et actions RED→GREEN ; E2E permissions. |
| CA-05 | Mineur | `readBacklogAccess` relisait quatre fois le contexte global pour chaque occupant. À 1/100 occupants : 7/403 requêtes, 75,6 ms pour le grand cas dans la reproduction. | `95c39c3`. Contexte local chargé une fois ; 7/7 requêtes, 15,1 ms pour 100 occupants lors de la mesure après. Les mutations continuent à relire dans leur transaction ; les décisions de retrait restent identiques. |
| CA-06 | Important | `links.ts:113` vérifiait la paire puis insérait sans sérialisation. Deux transactions pouvaient créer A bloque B et B bloque A, ou deux liens symétriques inversés. Des UUID en majuscules contournaient aussi les comparaisons de chaînes. | `6469d69`. Verrou consultatif transactionnel par paire canonique, UUID normalisés avant validation d'identité. Barrière DB réelle : deux réussites avant ; une réussite et un refus après, pour blocks/relates en casse homogène et mixte. |
| CA-07 | Important | `presence-page.ts:67` laissait le planificateur réévaluer l'agrégat d'historique par ticket. Sur 2 001 tickets, agrégat exécuté 2 001 fois ; test de volume de départ dépassant 5 s. | `6bc158f`. Agrégat matérialisé une fois. EXPLAIN comparatif : 2 776,083 → 244,668 ms, mêmes résultats. La suite DB des présences passe et vérifie aussi une période entièrement antérieure aux transitions. Aucun index ni migration ajouté. |
| CA-08 | Mineur | `lib/auth/request-cache.integration.test.ts:33` choisissait un utilisateur arbitraire et supposait son accès. Un compte non administrateur faisait échouer une frontière ; le premier test pouvait valider une simple parité de refus. | `56b2b5b`. Contributeur et backlog propres à la fixture, provisionnement normal des droits, assertion explicite d'autorisation accordée, nettoyage dédié. Deux tests DB verts. |
| CA-09 | Mineur | Deux fixtures produisaient des collisions sans défaut produit : clés d'items `-1/-2/-3` insérées hors séquence, et préfixes de backlogs réduisant tous les chiffres UUID à `A` (deux `PSAAAAAAAAAAAA` dans le même INSERT). | `188f93c`. Réservation des clés via `nextItemKey` ; entropie conservée par conversion injective des chiffres et suffixe distinct dans le lot. Les 51 tests ciblés passent sans assouplir leurs assertions. |

### Autorisation : règle et libellé

La spécification unifiée exige « An unreadable backlog or item produces a not-found response so its existence is not disclosed » (`2026-08-06-jiroo-unified-permission-schemes-design.md:259`) et le filtrage SQL des listes. `manage_users_groups` n'accorde pas la lecture de tous les backlogs. Claude a confirmé ces règles et accordé l'exception de wording pour cette correction de sécurité le 29 octobre.

Libellé appliqué et recommandé : **« un backlog non accessible »**, par exemple « Rôle Membre dans un backlog non accessible ». Variantes soumises à Nicolas à la PR : « un backlog que vous ne pouvez pas consulter » (plus explicite), « un backlog masqué » (plus court, moins précis). Aucun autre libellé produit modifié.

Les références cachées restent des bloqueurs de suppression, sans exposer leur nom, clé, UUID ni nombre exact. Les erreurs de `deleteGroup`/`deleteProjectRole` sont déjà génériques. Les autres réponses de topologie examinées sont réservées à `administer_jiroo` ; les invalidations internes restent complètes.

## Constats importants non corrigés

### CA-10 — Identité historique fondée sur une clé modifiable — JIR-138

Chaîne statique précise : `updateBacklog` réécrit les clés des items (`backlogs.ts:255–285`) ; les événements immuables gardent leur ancienne clé ; `completeSprint` exige `event.itemKey === sourceItem.key` (`sprint-lifecycle.ts:425–428`). Les participants actifs sont aussi réunis par clé courante/historique (`sprint-reports.ts:402–462`) et le calculateur indexe ses états par clé (`burndown-calculations.ts:339–340,388`).

Scénario : démarrer un sprint avec ABC-1, changer son estimation, renommer ABC en DEF, relire les rapports puis clôturer. La clôture rejette l'historique et la lecture peut dédoubler un participant ou échouer. Le lien d'un participant terminé emploie en outre sa clé figée (`components/reports/sprint-report.tsx:113`) : le libellé historique est correct, mais la cible devient périmée après renommage.

Statut : **non corrigé, défaut statiquement confirmé par Claude et tracé dans JIR-138**. La sonde DB de renommage n'a pas abouti : deux erreurs d'options de harnais avant les lectures des rapports ; arrêt des essais sur ce point. Aucune reproduction DB réussie du renommage n'est revendiquée.

### CA-11 — Purge d'un ancien participant actif empêchant la clôture — JIR-138

Scénario DB exécuté : démarrer avec une tâche estimée, la supprimer logiquement (événement de retrait), la purger via `purgeItem`, puis clôturer. La purge réussit ; la clôture répond « Le contenu historique du sprint est incohérent. ». L'assertion de cette observation passe.

`sprint_items.item_id` est `ON DELETE CASCADE` (`schema/domain.ts:442–444`) ; les références du registre deviennent nulles. `completeSprint` exige encore la source et l'appartenance (`sprint-lifecycle.ts:414–428,456–480`). Les faits de départ ne sont donc pas garantis disponibles pour tous les cas. Reconstituer ou deviner ces valeurs ne serait pas une correction sûre sans reprise du modèle historique.

Statut : **non corrigé, reporté explicitement dans JIR-138 par Claude**. Aucune garde de purge ni nouveau refus produit ajouté. La stabilité d'un rapport déjà terminé après purge est un cas distinct, couvert par les suites existantes ; elle ne prouve pas la capacité à clôturer après purge.

### CA-12 — Une tâche en corbeille bloque un sprint planifié

Scénario DB exécuté : affecter une tâche au sprint planifié, la supprimer logiquement, appeler `startSprint`. L'appartenance reste présente ; le lecteur exclut l'item supprimé et rejette la différence de cardinalité (`sprint-lifecycle.ts:142–162`). `removeDeletedItemsFromActiveSprintsInTx` ne traite que les sprints actifs (`sprint-events.ts:239–249`). L'assertion de cette observation passe.

Statut : **non corrigé, règle à arbitrer**. Recommandation validée comme proposition par Claude : retirer aussi l'appartenance planifiée lors de la suppression, sans réadhésion automatique à la restauration. Restaurer la tâche permet actuellement de reprendre le parcours ; aucune règle nouvelle appliquée dans cet audit.

## Résultats et limites de la contre-expertise

- `corepack pnpm typecheck` : vert ; `corepack pnpm lint` : vert, seul avertissement préexistant `lib/auth/client.ts:8`.
- `corepack pnpm test --project unit` : **3 370 réussis, 1 ignoré**, 291 fichiers.
- `JIROO_RUN_DB_TESTS=1 corepack pnpm test --project db` sur la base jetable `jiroo_e2e`, avec consentement et identité explicitement fournis au garde : **499 réussis, 5 ignorés**, 51 fichiers réussis et 1 ignoré. Aucun test rouge final.
- `corepack pnpm build` : vert sur `188f93c`.
- `corepack pnpm test:e2e e2e/permission-schemes.spec.ts` : **10/10 Chromium**, base fraîche sur le même conteneur jetable, révision `188f93c`, run `codex-jir136-final-20261029`, inventaire 24 artefacts. Un premier passage de 10/10 est conservé séparément.
- Relectures indépendantes des neuf corrections : avis favorables ; elles ne remplacent pas la revue Claude/CI de la PR à venir.


Les contrôles API/auth examinés conservent : session et 2FA côté serveur ; ressource/backlog dérivés en base ; non-divulgation des ressources illisibles ; réponses privées non mises en cache ; événements temps réel ne portant que des identifiants. Les webhooks vérifient signature/jeton sur corps brut borné avant ingestion, sans appel réseau sortant à une forge. Les suites correspondantes font partie de la passe globale ; ce n'est pas un test d'intrusion exhaustif.

Les sprints terminés conservent leurs valeurs de snapshot ; le lecteur burndown emploie une transaction `repeatable read` en lecture seule. Les causes `sprint_started` et `sprint_completed`, leurs deltas nuls et leur place dans les pages alignées ne sont pas modifiées. Releases, statuts, bulk et lecteurs existants ont été relus et leurs suites exécutées ; aucun autre défaut nouveau suffisamment étayé n'est retenu dans ces domaines.

Le benchmark pur Node 24 sur 1 000 participants et 10 000 événements répartis donne 23,82–25,07 ms (trois mesures, fixture exclue), avec total final, 10 002 points exacts et projection ≤600 vérifiés. À 10 000 participants/10 000 événements : 158,62–168,21 ms. Le coût multiplicatif existe, mais ces mesures ne démontrent pas un blocage produit. Elles ne remplacent pas une mesure DB de charge combinée ni un test multiutilisateur de production.

Restent hors certification : lecteur d'écran manuel, matrice complète Firefox/WebKit et zoom, charge soutenue, environnement déployé, reprise de sauvegarde, rotation des secrets et tous les entrelacements de révocation de permissions. Les rouges/limites déjà suivis par JIR-128 à JIR-135 et le titre long mobile de Le point ne sont pas effacés par ce résultat.

**Évaluation indépendante :** base exploitable et sensiblement renforcée dans les domaines vérifiés ; défaut d'isolation confirmé corrigé ; aucune prétention de préparation générale à la production tant que les cas JIR-138 et les validations restantes n'ont pas été traités ou explicitement acceptés par le propriétaire. Prochaine étape : relecture de ces commits par Claude, PR/CI, puis plan validé pour JIR-138 et arbitrage de CA-12.
