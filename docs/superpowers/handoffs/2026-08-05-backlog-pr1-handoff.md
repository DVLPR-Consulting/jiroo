# Passation — audit Jiroo et fondation Backlog PR1

Date de passation : 5 août 2026, Europe/Berlin.

Ce document est la source de reprise de la prochaine session Codex. Il doit
être lu avant toute commande Git ou modification de code.

## Commande de reprise recommandée

Depuis un terminal, fermer la session sandboxée actuelle puis reprendre la
dernière conversation avec un accès Git et réseau complet :

```bash
codex resume --last \
  -C /Users/nkrmr/Development/www/jiroo \
  --sandbox danger-full-access \
  --ask-for-approval on-request
```

Le dépôt est fiable, mais `danger-full-access` reste un accès étendu : ne pas
l'utiliser pour un autre dépôt sans vérifier son contenu.

## Prompt prêt à coller

```text
Reprends l'audit critique et l'implémentation de Jiroo depuis le fichier :
docs/superpowers/handoffs/2026-08-05-backlog-pr1-handoff.md

Lis entièrement ce handoff, puis lis AGENTS.md et les instructions Superpowers
applicables avant d'agir. Cette session doit avoir un accès direct en écriture
à .git et au réseau GitHub. N'utilise plus de clone temporaire dans /tmp et ne
me demande pas d'exécuter les commandes Git : crée les branches, commits, push
et PR toi-même.

Commence par vérifier la fusion de feat/jira-backlog-foundation dans
origin/main. La fusion a été confirmée par l'utilisateur, mais l'ancienne
session n'a pas pu la récupérer à cause du sandbox. Ne rebase pas et ne
force-push pas l'ancienne branche feat/configurable-board-workflows. Mets le
dépôt local à jour proprement depuis main, conserve tout fichier utilisateur,
puis crée une nouvelle branche dédiée à la suite de la PR1.

Poursuis le plan existant :
docs/superpowers/plans/2026-08-05-jiroo-backlog-foundation-implementation.md

La prochaine tâche est Task 4 : ajouter la vraie vue Backlog enregistrable et
partageable, distincte de Liste. Travaille en TDD strict : test en échec observé,
implémentation minimale, test vert, typecheck. Ensuite seulement : Task 5
classement persistant souris/clavier, Task 6 sélection multiple et barre bulk,
puis audit réel dans Chromium avec Playwright, console, réseau, performances et
captures. Mets à jour /audit après la validation navigateur. BUG-JIR-015 reste
ouvert tant que le parcours complet n'est pas prouvé dans Chromium.

Ne suppose jamais une fonctionnalité présente. Ne valide rien sur la seule base
du code ou des tests unitaires. Priorise la gestion produit desktop de bout en
bout et la parité Jira avant le responsive, qui sera repris en fin d'audit.

À chaque checkpoint, indique ce qui est prouvé, ce qui ne l'est pas et les trois
priorités suivantes. Une fois une fonctionnalité complètement auditée, mets à
jour le rapport et attends ma validation avant d'auditer la fonctionnalité
suivante.
```

## État Git à la fermeture de la session

- Dépôt : `DVLPR-Consulting/jiroo`.
- Branche locale encore active : `feat/configurable-board-workflows`.
- HEAD local : `bc10084 feat(backlog): add estimates and transactional bulk editing`.
- Le `main` local est ancien et ne doit pas servir de nouvelle base sans fetch.
- Une branche distante propre a été reconstruite depuis le dernier `origin/main`
  alors disponible : `feat/jira-backlog-foundation`.
- Commit propre poussé : `4609968 feat(backlog): add estimates and transactional bulk editing`.
- L'utilisateur a confirmé que la PR `feat/jira-backlog-foundation` est fusionnée.
- Cette fusion n'a pas pu être vérifiée localement : `.git/FETCH_HEAD` était en
  lecture seule et la résolution DNS GitHub était intermittente.
- Le clone `/tmp/jiroo-backlog-pr-yIT9HF` était uniquement un contournement de
  sandbox. Ne pas l'utiliser pour la suite.

### Synchronisation sûre au démarrage

Exécuter et contrôler chaque résultat, sans `reset --hard`, sans force-push et
sans supprimer les fichiers non suivis :

```bash
git status --short --branch
git fetch origin
git log --oneline --decorate --max-count=12 origin/main
git branch --remotes --contains 4609968
git switch main
git pull --ff-only
git switch -c feat/jira-backlog-view
```

Si `4609968` n'est pas contenu dans `origin/main`, arrêter et inspecter la PR
fusionnée avant de modifier le code. Ne pas rejouer automatiquement `bc10084`.

Le présent handoff sera probablement non suivi lors de la reprise. Le conserver
et le committer sur la nouvelle branche avec la prochaine livraison documentaire.

## Décisions produit validées

La cible est un fonctionnement aussi proche que pertinent de Jira pour gérer un
produit de bout en bout, avec une priorité desktop.

### Pull request 1 — fondation Backlog

- réutiliser le rang persistant existant ;
- créer une vraie vue Backlog distincte de Liste ;
- estimations en points nullables ;
- checkboxes, sélection par plage et sélection du résultat filtré ;
- bulk edit : statut, priorité, assigné et estimation ;
- aucun concept de sprint dormant dans cette PR.

### Pull request 2 — sprints Scrum

- sprint : nom, objectif, dates, capacité dérivée et état ;
- un seul sprint actif en V1 ;
- le Board devient le board du sprint actif ;
- les items sans sprint restent dans le backlog ;
- démarrage, clôture et report explicite des items incomplets ;
- ajout du sprint à la barre d'actions groupées.

La connexion native d'un dépôt et la liaison des pull requests sont notées pour
plus tard ; elles ne font pas partie de la PR1 Backlog.

## Implémentation déjà fusionnée selon l'utilisateur

### Estimation

- colonne nullable `items.estimate_points` en `numeric(5,2)` ;
- contrainte de plage de `0` à `999.99` et deux décimales maximum ;
- migration `drizzle/0008_jira_backlog_foundation.sql` ;
- estimation autorisée uniquement pour `tache` ;
- distinction persistée et affichée entre `null`, `0` et une valeur décimale ;
- édition unitaire dans la liste et le panneau de détail ;
- activité `estimate_points` avec valeurs stables.

### Bulk edit transactionnel

- contrat Zod pour 1 à 500 UUID uniques ;
- champs : `statusId`, `priority`, `assigneeId`, `estimatePoints` ;
- verrouillage du backlog et des items sélectionnés ;
- validation avant mutation des items supprimés, absents ou étrangers ;
- transaction tout-ou-rien ;
- validation du statut, de l'assigné et du type tâche ;
- gestion de `closedAt` lors des changements de catégorie de statut ;
- une activité par item réellement modifié ;
- comptage séparé des changements et des no-op ;
- action serveur authentifiée, autorisation writer-first, mapping d'erreurs
  françaises et une revalidation de `/b/<clé>`.

## Preuves de vérification disponibles

- Baseline avant la PR1 : 82 fichiers de tests réussis, 6 ignorés ; 682 tests
  réussis, 15 ignorés.
- Tests UI/action/validation de l'estimation : 84 réussis sur 7 fichiers.
- Tests bulk validation et action serveur : 20 réussis sur 2 fichiers.
- Tests PostgreSQL du bulk edit exécutés par l'utilisateur : 7 sur 7 réussis,
  dont rollback, no-op, statut/`closedAt`, assigné et estimation task-only.
- `pnpm typecheck` réussi.
- `pnpm lint` réussi pendant le hook du commit local `bc10084`.

Ces preuves valident le domaine et les composants ciblés. Elles ne remplacent
pas la validation Playwright du parcours complet.

## Prochaine étape exacte — Task 4

Suivre les étapes de Task 4 dans
`docs/superpowers/plans/2026-08-05-jiroo-backlog-foundation-implementation.md`.

Ordre attendu :

1. Ajouter des tests rouges pour la sauvegarde/restauration du mode `backlog`.
2. Ajouter un test rouge du lien `Backlog` qui conserve les paramètres URL.
3. Étendre `DisplayMode`, le schéma Zod, `ViewBar` et `GroupControl`.
4. Créer les tests rouges de `ItemBacklog` : titre, totaux, rang, champs,
   lecteur et états vides.
5. Implémenter le composant statique `ItemBacklog`.
6. Dans `backlog-view-content.tsx`, fournir uniquement les tâches non terminées,
   filtrées, rangées par rang manuel en l'absence de tri, puis groupées si demandé.
7. Exécuter les tests ciblés et `pnpm typecheck`.
8. Inspecter le diff avant le commit.

Ne pas commencer le drag de classement ou la sélection multiple avant que cette
surface statique et sauvegardable soit verte.

## Étapes restantes de la PR1

1. Task 4 — vraie vue Backlog.
2. Task 5 — classement persistant, souris et clavier, avec rollback sûr.
3. Task 6 — checkboxes, Shift-plage, `Cmd/Ctrl+A`, `Escape` et barre bulk.
4. Task 7 — validation Playwright réelle et mise à jour des preuves d'audit.
5. Revue de code, suite complète, commit, push et PR gérés par Codex.

## État de l'audit

- Couverture d'audit estimée : environ 40 %, pas 40 % de parité Jira.
- Score provisoire après l'incrément 05 : 58/100.
- Création/détail : audités et largement remédiés sur le périmètre observé.
- Board/transitions/colonnes : audités et largement remédiés.
- Backlog produit/triage : audité ; `BUG-JIR-015` reste P0 jusqu'à preuve finale.
- Sprints/capacité/releases : non audités fonctionnellement.
- Hiérarchie/dépendances, reporting, collaboration, recherche, sécurité complète
  et charge : encore partiels ou non audités.
- Responsive multi-breakpoints : volontairement reporté après les fonctions
  essentielles de gestion produit desktop.

## Règles de travail à conserver

- Lire le guide Next.js pertinent dans `node_modules/next/dist/docs/` avant tout
  changement Next.js, conformément à `AGENTS.md`.
- Suivre TDD : aucun code de production sans test rouge observé.
- Tous les constats d'audit doivent provenir d'un comportement observé dans le
  navigateur, jamais seulement du code.
- Pour chaque scénario Playwright : console JavaScript, réseau, HTTP,
  performances et capture explicite en cas de problème.
- Pour chaque bug : identifiant unique, reproduction, obtenu, attendu, gravité,
  priorité, impacts, capture et hypothèse de cause.
- Ne jamais supprimer les résultats précédents de `/audit`.
- Préserver les modifications utilisateur et éviter toute commande Git
  destructive.
- Ne jamais déclarer une fonctionnalité terminée sans preuve fraîche.

## Trois priorités absolues à la reprise

1. Resynchroniser Git directement sur le `main` qui contient la PR fusionnée.
2. Terminer et tester la vraie vue Backlog sauvegardable.
3. Enchaîner classement manuel puis sélection/bulk UI avant l'audit Chromium.
