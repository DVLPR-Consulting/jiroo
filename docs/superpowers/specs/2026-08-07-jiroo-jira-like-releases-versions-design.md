# Jiroo — Releases / Versions au niveau Jira

**Date :** 7 août 2026

**Statut :** design validé en deux PR, en attente de revue écrite

**Branche :** `feat/jira-releases-versions`

## 1. Contexte et problème

L’audit Playwright de l’incrément 10 confirme que Releases/Versions est
entièrement absent de Jiroo : aucun modèle visible, aucune route, aucun champ
d’item, aucun filtre, aucune action bulk et aucune page de progression. Les URL
intuitives `/b/CASS/releases` et `/b/CASS/versions` répondent 404.

La permission backlog `manage_releases` existe déjà et est explicable par
l’Assistant de permissions, mais elle ne protège encore aucune capacité métier.
Jiroo ne peut donc pas répondre à la question « qu’avons-nous réellement livré
dans cette release ? ».

Dans Jira Cloud, une Release est une Version du projet. Les work items y sont
associés par le champ multivalué `Fix versions`. Une version peut être publiée,
dépubliée, archivée et désarchivée. Sa page agrège la progression et la
publication demande une décision explicite pour les items non terminés.

## 2. Objectifs

1. Atteindre une parité Jira crédible sur le noyau Releases/Versions.
2. Permettre plusieurs Fix versions par item dès le premier incrément.
3. Distinguer clairement version cible, publication effective et archivage.
4. Conserver une preuve historique de ce qui était dans le périmètre lors de
   chaque publication, même si les items évoluent ensuite.
5. Consommer réellement `manage_releases` sans donner implicitement le droit de
   modifier les items.
6. Réutiliser les interactions existantes du Backlog, les filtres URL et les
   transactions tout-ou-rien.
7. Livrer en deux PR révisables et sûres.

## 3. Non-objectifs immédiats

La PR 1 n’implémente pas :

- fusion ou suppression de versions ;
- réordonnancement manuel ;
- notes de release, travail connexe ou approbations ;
- intégration dépôt, PR, build, déploiement ou feature flags ;
- Release Burndown, Version Report ou prédiction de date ;
- releases multi-backlogs ou Advanced Roadmaps ;
- champ Jira séparé `Affects versions` ;
- nouvelle notion de `Resolution` sur les items.

Pour la PR 1, un item est « terminé » lorsque son statut appartient à la
catégorie `done`. Cette règle est affichée dans l’interface et figée dans les
snapshots de publication. Jira combine catégorie Done et Resolution ; Jiroo ne
prétend pas copier ce détail avant d’avoir un vrai modèle de résolution.

## 4. Approches considérées

### A — Deux PR : noyau puis profondeur Jira — retenue

La PR 1 livre le modèle, les Fix versions multivaluées, la planification, la
progression, le cycle de publication, les permissions et l’historique. La PR 2
ajoute fusion, suppression/transfert, ordre, notes et travail connexe.

Avantages : migrations et invariants revus tôt, matrice navigateur bornée,
aucune grosse PR impossible à auditer. Inconvénient : deux cycles de livraison.

### B — Une PR de parité étendue

Tout livrer jusqu’aux notes, merge et related work dans une seule branche.

Avantage : surface complète immédiatement. Inconvénients : risque élevé sur les
transactions de transfert, revue trop large et diagnostic Playwright difficile.

### C — Champ Version minimal mono-valué

Ajouter un seul `versionId` à l’item et une liste rudimentaire.

Avantage : rapide. Inconvénient : dette structurelle immédiate, incompatible
avec `Fix versions`, migrations futures coûteuses et fausse parité Jira.

La décision validée est l’approche A. L’approche C est explicitement interdite.

## 5. Vocabulaire produit

- **Release** : libellé principal de navigation et de page.
- **Version** : objet métier appartenant à un backlog.
- **Fix versions** : champ multivalué d’un item.
- **Non publiée** : version qui n’a pas de publication active.
- **Publiée** : version possédant une publication active.
- **Archivée** : version masquée des sélecteurs opérationnels. L’archivage est
  orthogonal à la publication et ne détruit pas son état publié/non publié.
- **Date cible** : date de livraison planifiée.
- **Date effective** : date choisie lors d’une publication.
- **Périmètre publié** : snapshot immuable des items liés au moment précis de la
  publication, avant déplacement éventuel des items non terminés.

## 6. Modèle de données — PR 1

### 6.1 `releases`

Chaque version appartient à exactement un backlog.

Champs :

- `id` UUID ;
- `backlogId` FK restrictive ;
- `name` requis, normalisé, unique sans tenir compte de la casse dans le backlog ;
- `description` nullable ;
- `driverId` nullable, initialisé avec le créateur ;
- `startDate` nullable ;
- `targetDate` nullable ;
- `releasedAt` nullable, horodatage technique de la publication active ;
- `releasedBy` nullable ;
- `effectiveReleaseDate` nullable ;
- `archivedAt` et `archivedBy` nullables ;
- `revision` entier positif pour concurrence optimiste ;
- `createdBy`, `createdAt`, `updatedAt`.

Invariants :

- nom non vide après trim ;
- `startDate <= targetDate` si les deux existent ;
- les champs de publication active sont tous nuls ou tous renseignés ;
- une version archivée conserve ses champs de publication ;
- une version archivée doit être désarchivée avant publication/dépublication ;
- toutes les mutations comparent `expectedRevision` sous verrou transactionnel.

### 6.2 `item_fix_versions`

Relation many-to-many entre items et versions :

- `backlogId`, `itemId`, `releaseId` ;
- `addedBy`, `addedAt` ;
- unicité `(itemId, releaseId)` ;
- FKs composites garantissant que l’item et la version appartiennent au même
  backlog ;
- suppression d’un item supprime ses liens ; suppression d’une version n’existe
  pas en PR 1.

Une version publiée mais non archivée reste candidate à une affectation, comme
dans Jira. Une version archivée n’est jamais candidate à une nouvelle
affectation. Une association archivée existante reste visible dans le détail et
les filtres historiques ; un éditeur peut la retirer, mais pas la réajouter sans
désarchivage.

### 6.3 `release_publications`

Chaque publication ou republication crée une ligne immuable :

- `id`, `releaseId`, `sequence` ;
- `effectiveDate`, `publishedAt`, `publishedBy` ;
- `incompleteDisposition` : `keep` ou `move` ;
- `destinationReleaseId` nullable, requis pour `move` ;
- `destinationReleaseName` nullable, copié pour préserver un libellé historique ;
- `unreleasedAt`, `unreleasedBy` nullables ;
- unicité `(releaseId, sequence)` ;
- au plus une publication active par release.

Dépublier ferme la publication active mais ne la supprime jamais. Republier
crée une nouvelle séquence et un nouveau snapshot.

### 6.4 `release_publication_items`

Snapshot immuable de tous les items liés avant traitement des incomplets :

- `id`, `publicationId`, `itemId` nullable avec `ON DELETE SET NULL` ;
- `itemKey`, `title`, `type` ;
- `statusId`, `statusName`, `statusCategory` ;
- `estimate` nullable ;
- `completed` booléen ;
- `disposition` : `retained` ou `moved` ;
- destination éventuelle.

`(publicationId, itemKey)` est unique. Le snapshot reste donc adressable même
si l’item source est supprimé définitivement plus tard.

Ce snapshot répond à « quel était le périmètre ? » et « qu’était réellement
terminé ? » sans dépendre de l’état futur de l’item.

## 7. Permissions

| Action | Permission requise |
|---|---|
| Voir les releases d’un backlog visible | `browse_backlog` |
| Créer, éditer, publier, dépublier, archiver | `manage_releases` |
| Renseigner Fix versions pendant la création | `create_items` |
| Affecter/retirer Fix versions sur un item existant | `edit_items` |
| Affectation bulk | `bulk_change_items` global + `edit_items` backlog |
| Publier en déplaçant les incomplets | `manage_releases` + `edit_items` |
| Lire le snapshot de publication | `browse_backlog` |

`manage_releases` ne donne pas `edit_items`. Un spécialiste Releases peut gérer
le calendrier et publier en conservant les incomplets, mais le choix `move` est
désactivé et refusé côté serveur sans `edit_items`. Il ne peut donc pas
recatégoriser silencieusement les items. Inversement, un éditeur d’item peut
utiliser des versions non archivées existantes sans pouvoir les créer ou les
publier.

Toutes les Server Actions appliquent la porte commune de dissimulation du
backlog avant la permission fonctionnelle. Les refus forgés ne modifient ni
données métier ni historique.

## 8. Services et transactions

### 8.1 Services dédiés

- `lib/services/releases.ts` : lectures, création, édition et cycle ;
- `lib/services/item-fix-versions.ts` : affectation unitaire et bulk ;
- `lib/validation/release.ts` : schémas de commandes ;
- `app/actions/releases.ts` : autorisation et adaptation UI ;
- extensions ciblées aux DTO/capacités items, filtres et bulk existants.

Les composants UI n’accèdent jamais directement à la base. Les services
acceptent un acteur explicite et écrivent l’activité dans la même transaction.

### 8.2 Publication

La publication verrouille la version, vérifie la révision, charge en batch son
périmètre et classe les items selon la catégorie de statut.

Commande :

- date effective requise ;
- disposition des incomplets `keep` ou `move` ;
- destination requise pour `move`, non archivée, non publiée et du même backlog.

Dans une transaction unique :

1. créer la publication ;
2. écrire le snapshot complet ;
3. pour `move`, retirer la version publiée des incomplets et ajouter la
   destination sans doublon, en conservant toutes leurs autres Fix versions ;
4. marquer la version publiée et incrémenter sa révision ;
5. écrire activités de release et changements de Fix versions corrélés.

Une panne à n’importe quelle étape restaure tout l’état. Aucun snapshot partiel
ne peut subsister.

### 8.3 Dépublication et archivage

- Dépublier clôt la publication active, vide l’état courant de publication et
  conserve snapshot/date/acteur historiques.
- Archiver masque la version des créations, pickers et actions bulk mais garde
  les liens historiques visibles.
- Désarchiver restaure la version dans les surfaces compatibles avec son état.
- Ces opérations utilisent `expectedRevision` et sont idempotentes uniquement
  lorsque l’intention courante est déjà satisfaite ; une intention stale est
  signalée, jamais écrasée.

Après publication, les liens Fix versions courants peuvent encore évoluer si
la version n’est pas archivée. La page distingue alors le périmètre actuel du
snapshot immuable de chaque publication. Une republication crée un nouveau
snapshot ; elle ne réécrit jamais le précédent.

## 9. Calculs et lectures

La page Releases charge les versions et leurs agrégats en requêtes batchées,
sans lecture par version ou par item.

Pour chaque version :

- total d’items ;
- comptes À faire / En cours / Terminé selon les catégories de statut ;
- points totaux, terminés et non estimés ;
- pourcentage principal par nombre d’items ;
- retard si non publiée, non archivée et `targetDate < aujourd’hui` ;
- nombre d’items incomplets avant publication.

Chaque agrégat ouvre la liste exacte des items qui le compose. Les points sont
secondaires et ne remplacent pas le nombre d’items, afin que les résultats
restent explicables.

## 10. Interface — PR 1

### 10.1 Navigation et page Releases

Ajouter `Releases` aux vues du backlog, route `/b/[key]/releases`.

État vide : explication courte, bénéfice métier et action `Créer une version`
uniquement si `canManageReleases`.

La liste desktop affiche : état, nom, responsable, dates, progression,
incomplets et menu d’actions autorisées. Les versions archivées sont cachées par
défaut et révélées par un filtre explicite.

### 10.2 Détail d’une release

Route `/b/[key]/releases/[releaseId]` :

- métadonnées et état ;
- progression À faire / En cours / Terminé ;
- liste filtrable des items ;
- avertissement clair pour les incomplets ;
- historique des publications et snapshots ;
- actions Publier, Dépublier, Archiver/Désarchiver selon les capacités.

Le dialogue Publier demande date effective et traitement des incomplets. Il
affiche les conséquences avant confirmation.

### 10.3 Items et Backlog

- création d’item : sélecteur `Fix versions` multivalué ;
- détail : valeurs courantes toujours visibles, versions archivées marquées et
  non ajoutables ;
- Backlog : colonne configurable `Fix versions` ;
- filtre `Version` dans Backlog et Board, sérialisé dans l’URL et les vues ;
- barre bulk : ajouter/remplacer/retirer des Fix versions, avec résumé avant
  application et transaction tout-ou-rien ;
- liste : affichage compact des deux premières versions et compteur `+N`.

Le même composant de sélection et la même projection serveur sont réutilisés
dans les trois surfaces.

## 11. Feedback et erreurs

- noms/dates invalides : erreur liée au champ et focus restauré ;
- conflit de révision : message indiquant que la release a changé, bouton de
  rechargement, saisie non perdue ;
- publication sans incomplets : confirmation simple ;
- publication avec incomplets : choix obligatoire, aucune valeur implicite ;
- destination invalide : refus avant mutation ;
- panne réseau : dialogue et sélection conservés, données inchangées ;
- permissions insuffisantes : contrôle absent et refus serveur structuré ;
- toutes les actions réussies produisent un toast et une annonce `aria-live`.

## 12. Historique et audit

Événements minimum :

- `release_created`, `release_updated` ;
- `release_published`, `release_unreleased` ;
- `release_archived`, `release_unarchived` ;
- `item_fix_versions_changed` unitaire ou corrélation bulk ;
- `release_incomplete_items_moved` avec comptes et destination.

Les événements stockent identifiants et libellés métier nécessaires pour rester
lisibles après renommage. Ils n’exposent pas de données de backlog à un acteur
sans `browse_backlog`.

## 13. Concurrence et performance

- révision optimiste sur toute mutation Release ;
- verrou déterministe Release puis items pour publication/déplacement ;
- tri stable des IDs avant verrouillage pour éviter les deadlocks ;
- lectures batchées et aucun N+1 ;
- pagination de la liste d’items d’une release ;
- filtres appliqués SQL-side ;
- test de volumétrie avec au moins 100 versions et 1 000 liens Fix versions ;
- temps locaux documentés, sans seuil produit artificiel non mesuré.

## 14. Matrice de tests

### 14.1 Unitaires et intégration PostgreSQL

- validation dates, noms, révisions et destinations ;
- contraintes cross-backlog et doublons ;
- affectations multivaluées unitaire/bulk ;
- rollback intégral de publication ;
- snapshots immuables ;
- keep/move des incomplets ;
- dépublication/republication séquencée ;
- archivage et sélecteurs ;
- concurrence stale et verrous ;
- permissions directes, groupe, rôle et bypass plateforme ;
- lectures batchées et volumétrie.

### 14.2 Playwright Chromium

1. créer deux versions et modifier leurs métadonnées ;
2. affecter un item à plusieurs Fix versions depuis le détail ;
3. planifier plusieurs items par bulk depuis le Backlog ;
4. filtrer Backlog et Board, enregistrer/recharger la vue ;
5. vérifier les agrégats contre les items sources ;
6. publier en conservant les incomplets ;
7. dépublier puis republier et retrouver les deux snapshots ;
8. publier en déplaçant les incomplets vers une autre version ;
9. archiver/désarchiver et vérifier tous les sélecteurs ;
10. spécialiste `manage_releases` sans `edit_items` : cycle visible, affectation
    interdite ;
11. éditeur sans `manage_releases` : affectation autorisée, cycle absent ;
12. lecteur et Server Action forgée : refus, base et historique inchangés ;
13. conflit entre deux éditeurs et récupération après reload ;
14. panne réseau injectée pendant publication : rollback et dialogue conservé ;
15. second contexte utilisateur et reload : persistance identique.

Chaque scénario collecte console, réseau, statuts HTTP, durée et capture au
premier défaut. Le run utilise la base `jiroo_e2e` et le harnais immuable livré
par l’incrément permissions.

## 15. PR 2 — profondeur Jira

Après validation et merge de la PR 1 :

- fusion atomique de versions avec transfert/dédoublonnage des liens ;
- suppression avec choix explicite transfert ou retrait ;
- ordre manuel persistant ;
- notes de release générées depuis l’état courant, format sauvegardé, export
  Markdown et HTML ;
- travail connexe : URL, description, catégorie et placeholder ;
- tests Playwright de concurrence, rollback et permissions pour chaque action.

Les approbations, données de développement, warnings PR/build/déploiement et
rapports de prédiction restent des incréments ultérieurs explicites.

## 16. Critères d’acceptation de la PR 1

La PR 1 n’est terminée que si :

1. plusieurs Fix versions par item sont prouvées en base et dans Chromium ;
2. création, édition, publication, dépublication, archivage et désarchivage sont
   transactionnels et protégés ;
3. les incomplets exigent une décision explicite ;
4. chaque publication conserve un snapshot immuable et explicable ;
5. filtres, bulk, détail et création restent cohérents après reload ;
6. la matrice multi-utilisateurs prouve les séparations de permissions ;
7. console, réseau et HTTP sont propres hors pannes injectées ;
8. typecheck, lint, build, unitaires, intégration DB et Playwright sont verts ;
9. l’audit `/audit` est enrichi sans supprimer aucune preuve antérieure ;
10. une revue indépendante ne trouve aucun finding Critical ou Important.

## 17. Références Jira officielles

- [Manage versions](https://support.atlassian.com/jira-cloud-administration/docs/manage-versions/)
- [Create a version](https://support.atlassian.com/jira-software-cloud/docs/create-a-version-in-a-classic-project/)
- [Release a version](https://support.atlassian.com/jira-software-cloud/docs/release-a-version-in-your-classic-project/)
- [Release progress](https://support.atlassian.com/jira-software-cloud/docs/use-the-release-page-to-check-the-progress-of-a-version/)
- [Create release notes](https://support.atlassian.com/jira-cloud-administration/docs/create-release-notes/)
