# Audit critique de Jiroo

## Score global provisoire — avant remédiation

**47/100 — confiance moyenne-basse.** Ce score couvre la découverte générale, la création d'un item et le panneau de détail/édition. Il ne doit pas être interprété comme une validation globale du produit.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 62/100 | Création, édition, propriétés, activité, relations et GitHub présents ; profondeur encore limitée |
| Fiabilité et feedback | 50/100 | Mutations nominales correctes ; erreurs de longueur génériques et latence visuelle instable |
| Efficacité UX | 43/100 | Édition inline rapide, mais actions essentielles cachées et raccourci `C` défectueux |
| Accessibilité | 32/100 | Permissions de lecture solides, mais titre/removal au clavier impossibles et panneau sans gestion de focus |
| Responsive | 10/100 | Shell et action de création hors écran ; panneau détail écrasé à 390 px |
| Permissions | 88/100 | Admin/contributeur en écriture ; lecteur correctement rendu read-only dans le panneau |
| Performance locale | 65/100 | Navigation 349–370 ms ; mutations perçues ~1 s et rafales jusqu'à ~3 s en développement |

## Score du périmètre réaudité après remédiation

**68/100 — confiance élevée sur création et détail, faible sur le reste du produit.** Le gain vient de la correction des huit bugs observés, pas d'une extension de couverture fonctionnelle. Jiroo reste derrière les concurrents sur les fonctions encore non auditées ou manquantes.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 62/100 | Couverture inchangée ; aucune fonctionnalité non observée n'est créditée |
| Fiabilité et feedback | 72/100 | Erreurs structurées, limites partagées, mises à jour optimistes avec rollback |
| Efficacité UX | 65/100 | Création clavier réparée, renommage explicite, actions primaires mobiles visibles |
| Accessibilité | 78/100 | Dialogues nommés, `Escape`, retour du focus, actions de retrait dans l'ordre de tabulation |
| Responsive | 76/100 | Shell en drawer et détail plein écran validés à 390 × 844 ; 320/768/1024 restent à rejouer |
| Permissions | 88/100 | Comportement admin/lecteur déjà prouvé, inchangé par la remédiation |
| Performance locale | 67/100 | Feedback optimiste < 100 ms observé avec latence réseau simulée ; p95 production inconnu |

## Score global provisoire — après incrément 03

**61/100 — confiance élevée sur création, détail et transitions ; faible sur les fonctionnalités non encore auditées.** La qualité des mutations de statut hors drag est bonne, mais le board ne peut pas être considéré fiable tant qu'un dépôt horizontal peut persister une colonne différente de celle visée.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 66/100 | Changement de statut par sélecteur et drag, ordre, clavier et lecteur observés ; workflows/WIP/undo absents |
| Fiabilité et feedback | 52/100 | Rollback réseau correct, mais mauvaise destination réellement persistée sur desktop et mobile |
| Efficacité UX | 61/100 | Mutation directe rapide ; poignée petite, sans tooltip, et navigation clavier imprévisible |
| Accessibilité | 55/100 | Poignée focusable et instructions présentes ; annulation incohérente et région live inutilisable |
| Responsive | 58/100 | Board scrollable à 390 px et détail de statut utilisable ; auto-scroll du drag mobile dangereux |
| Permissions | 92/100 | Lecteur réel : 0 poignée, 0 création globale ou par colonne, aucun échec console/HTTP |
| Performance locale | 76/100 | Sélecteur de statut stabilisé en 178–267 ms ; requête lente verrouille le contrôle avec `aria-busy` |

## Score global provisoire — après incrément 04 et remédiation

**70/100 — confiance élevée sur création, détail, transitions et colonnes ; faible sur le pilotage produit encore non audité.** Jiroo dispose maintenant d'un workflow local configurable et sûr, mais n'atteint pas la parité Jira tant que backlog produit, cycles, estimation, releases, dépendances, reporting et règles de transition ne sont pas prouvés.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 74/100 | CRUD/ordre/couleur des colonnes et migration occupée prouvés ; règles, WIP et workflows partagés absents |
| Fiabilité et feedback | 76/100 | Migration transactionnelle, invariants todo/done, doublons refusés et historique stable ; matrice DnD longue non rejouée |
| Efficacité UX | 70/100 | Action `Colonnes` découvrable sur le board et statut mobile en deux gestes ; pas d'undo ni de configuration en masse |
| Accessibilité | 70/100 | Annulation cohérente et annonces DnD métier en français ; validation NVDA/VoiceOver restante |
| Responsive | 64/100 | Menu de statut sur carte vérifié à 390 × 844 ; gestion des colonnes et tactile natif non audités sur mobile |
| Permissions | 94/100 | Lecteur réel : 0 gestion de colonnes, 0 création, 0 drag ; `/admin` redirige sans erreur HTTP |
| Performance locale | 76/100 | Mutations nominales sans erreur HTTP ; budget et p95 du gestionnaire de colonnes non mesurés |

## Score global provisoire — après incrément 05

**58/100 — confiance élevée sur le socle opérationnel et le backlog produit.**
La baisse depuis 70/100 ne traduit pas une régression du board : elle vient de
l'élargissement du périmètre. Le score précédent était explicitement faible en
confiance sur le pilotage produit. Or le navigateur prouve maintenant que la
vue `Liste` est un inventaire triable, pas un backlog permettant de décider
quoi livrer et quand.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 48/100 | Tri, groupement, filtres et édition unitaire présents ; rang, estimation, cycles/sprints, releases et bulk edit absents |
| Fiabilité et feedback | 78/100 | Priorité changée puis restaurée en 110 ms, deux POST 200, aucune erreur console |
| Efficacité UX | 52/100 | Triage unitaire rapide, mais planifier ou modifier plusieurs items est impossible |
| Accessibilité | 68/100 | Tableau et menus nommés ; aucune sélection multiple ni commande clavier de classement à évaluer |
| Responsive | 64/100 | Non réaudité dans cet incrément volontairement desktop-first |
| Permissions | 94/100 | Inchangé ; aucun nouveau mécanisme de planification à gouverner |
| Performance locale | 78/100 | Tri observé à ~271 ms et mutation de priorité confirmée en ~110 ms en développement |

## Niveau d'avancement de l'audit

**Environ 56 %.** Ce pourcentage mesure la couverture de l'audit, pas la qualité
du produit. Les parcours création, détail, transitions, colonnes et
backlog/triage ont été audités en profondeur. Les cycles/sprints, releases,
dépendances, reporting, collaboration, recherche, sécurité complète et charge
restent à auditer.

| Domaine | Avancement |
|---|---|
| Création et édition d'items | Audité et remédié sur le périmètre observé |
| Board, transitions et colonnes | Audité et largement remédié |
| Backlog produit et triage | Audité ; vue, rang, estimation, sélection et bulk remédiés, sprints/releases encore ouverts |
| Cycles/sprints et capacité | Audités et remédiés sur le cycle principal ; variantes de clôture et concurrence à compléter |
| Releases/versions | Non auditées ; aucun point d'entrée observé |
| Hiérarchie et dépendances | Partiel : arbre découvert, comportement de parentage observé |
| Vues, recherche et reporting | Découvert seulement |
| Collaboration et notifications | Non audité |
| Administration, sécurité et concurrence | Partiel |
| Responsive multi-breakpoints et charge | À reprendre en fin d'audit |

## Périmètre de l'incrément 01

- Date : 4 août 2026, Europe/Berlin.
- Environnement : `http://localhost:3000`, Chromium piloté par Playwright.
- Données : compte administrateur seed ; deux items d'audit créés (`CASS-57`, `CASS-58`).
- Préparation : 2FA et sessions du compte seed réinitialisées, puis 2FA réenrôlée avec validation humaine. Le rôle du même compte a été temporairement basculé en `viewer`, puis `contributor`, puis restauré en `admin`.
- Fonctionnalité auditée : **création d'un item depuis le board**.

## Périmètre de l'incrément 02

- Date : 4 août 2026, Europe/Berlin.
- Environnement : `http://localhost:3000`, Chromium piloté par Playwright, desktop 1200 × 943 et mobile 390 × 844.
- Données : audit sur `CASS-57`, relation temporaire vers `CASS-58`, label et référence GitHub temporaires ; état métier de `CASS-57` restauré en fin de session.
- Permissions : compte `Audit Lecteur` créé via l'administration, 2FA enrôlée, contrôle read-only réalisé ; session finale restaurée sur l'administrateur.
- Fonctionnalité auditée : **panneau de détail et édition d'un item**.

## Périmètre de l'incrément 03

- Date : 5 août 2026, Europe/Berlin.
- Environnement : `http://localhost:3000`, Chromium piloté exclusivement par Playwright, desktop 1200 × 943 et mobile 390 × 844.
- Donnée de test : `CASS-58`, restaurée dans `À faire` à la fin de la session.
- Permissions : administrateur et compte réel `Audit DnD Lecteur` dans un contexte navigateur isolé ; 0 poignée de drag et 0 action de création pour le lecteur.
- Scénarios négatifs : latence de 900 ms, double mutation bloquée, échec réseau injecté et rollback, annulation clavier, colonnes vides/remplies et auto-scroll horizontal.
- Fonctionnalité auditée : **drag & drop et transitions de statut**.

## Périmètre de l'incrément 04 — terminé

- Date : 5 août 2026, Europe/Berlin.
- Environnement : `http://localhost:3000`, Chromium piloté par Playwright,
  desktop 1800 × 987.
- Fonctionnalité auditée : **configuration du workflow, des statuts et des
  colonnes**.
- Preuve initiale : aucune action de gestion sur le board ; création et édition
  d'un backlog limitées à clé, nom et couleur ; 0 erreur console observée.
- Verdict initial : fonctionnalité absente,
  [BUG-JIR-013](bugs.md#bug-jir-013--impossible-de-créer-ou-configurer-une-colonne-de-workflow),
  P0 produit.
- Remédiation vérifiée : création, renommage, couleur, ordre, rechargement,
  doublon, invariants, suppression vide/occupée, migration, activité et rôle
  lecteur. `BUG-JIR-013` est corrigé ; `BUG-JIR-014`, découvert pendant la
  migration, est également corrigé.

## Périmètre de l'incrément 05 — backlog produit et triage

- Date : 5 août 2026, Europe/Berlin.
- Environnement : `http://localhost:3000`, Chromium piloté par Playwright,
  desktop.
- Fonctionnalité auditée : **prioriser et préparer le travail avant exécution**.
- Scénarios : liste, tri et persistance dans l'URL, groupement, structure du
  tableau, sélection multiple, classement manuel, propriétés de création et de
  détail, arbre et parentage, administration, mutation unitaire de priorité,
  console, réseau et performance locale.
- Verdict : triage unitaire fonctionnel ; backlog de planification absent.
  `BUG-JIR-015` ouvert en P0 produit.

## Fonctionnalités découvertes

Présence observée dans le navigateur, sans validation fonctionnelle complète sauf mention contraire :

- authentification par mot de passe, enrôlement 2FA TOTP et codes de récupération ;
- vues Board, Liste et Arbre ;
- groupement, filtres et vues enregistrées personnelles/partagées ;
- recherche globale et notifications ;
- création d'items, modèles, types hiérarchiques et création depuis une colonne ;
- panneau de détail avec description, commentaires, activité, attributs, liens et développement ;
- Mes items, corbeille, administration, profil et préférences ;
- densité d'affichage, thème sombre et sidebar repliable.

Une fonctionnalité simplement découverte n'est **pas** considérée terminée.

## Couverture fonctionnelle — création d'item

### Fonctionnalités terminées et prouvées

- ouverture depuis `Nouvel item` et depuis `Créer dans <statut>` ;
- héritage du statut de la colonne ;
- titre obligatoire avec rejet des espaces seuls ;
- types Composant, Epic, Tâche et Sous-tâche ;
- parent obligatoire et filtré selon la hiérarchie ;
- statut, priorité et nature ;
- modèles `Rapport de bug` et `User story`, dont le contenu est visible après création ;
- création réelle avec rafraîchissement du compteur et apparition immédiate sur le board ;
- soumission par `Entrée` ;
- absence de doublon lors d'un double-clic ;
- conservation du formulaire après erreur serveur et remise à zéro après annulation ;
- permissions UI : admin et contributeur autorisés, lecteur sans action ni raccourci de création.

### Fonctionnalités incomplètes

- le formulaire ne permet pas de renseigner description, assigné, labels ou échéance alors que ces champs existent immédiatement après création ;
- l'effet des modèles n'est ni prévisualisé ni éditable avant soumission ;
- la validation serveur de 200 caractères n'est pas reflétée côté client ;
- les erreurs de validation sont génériques et non rattachées au champ ;
- le raccourci clavier annoncé est défectueux ;
- le point d'entrée principal n'est pas utilisable sur mobile ;
- aucun indicateur visuel ne précise les champs obligatoires ; le bouton reste seulement désactivé.

### Fonctionnalités manquantes dans le flux observé

- brouillons et récupération d'un formulaire interrompu ;
- option « créer un autre » ;
- pièces jointes à la création ;
- champs personnalisés/configurables et règles de champs obligatoires ;
- modèles personnalisables, modèle par défaut et formulaires structurés ;
- détection des doublons/similarités avant création ;
- estimation, dépendances, dates de début, sprint/cycle et jalon dans le composeur.

## Couverture fonctionnelle — détail et édition

### Fonctionnalités terminées et prouvées

- ouverture/fermeture par clic, deep-link `?item=CASS-57` et copie de lien avec toast ;
- édition du titre à la souris ;
- édition Markdown de la description, rendu GFM et neutralisation d'une balise `<script>` ;
- mise à jour de statut, priorité, nature, assigné, rapporteur, labels et échéance ;
- ajout/retrait d'une relation vers un autre item ;
- ajout/retrait d'une URL GitHub de pull request et validation d'une URL non GitHub ;
- activité mise à jour après chaque mutation ;
- rôles : administrateur éditable, lecteur réellement read-only dans le navigateur ;
- navigation complète locale mesurée à 370 ms au chargement, sans exception JavaScript nominale.

### Fonctionnalités incomplètes

- titre éditable uniquement par clic sur un heading non focusable ;
- description sans compteur/limite UI, avec erreur serveur générique au-delà de 20 000 caractères ;
- activité sans ancienne/nouvelle valeur ni restauration de description ;
- actions de retrait des relations/références cachées au survol et inaccessibles au clavier ;
- panneau sans fermeture `Échap`, nom accessible ni gestion/restauration de focus ;
- responsive du panneau inutilisable à 390 px ;
- feedback des mutations lent et parfois visuellement régressif pendant la transition ;
- références de développement limitées à des URLs GitHub collées manuellement ;
- relations limitées à trois types, sans édition du type existant ni vue de dépendances.

### Fonctionnalités manquantes dans le détail observé

- pièces jointes, checklists, estimation, sprint/cycle, jalon/version et temps suivi ;
- abonnés/watchers, votes, mentions et notifications contextuelles ;
- champs personnalisés et organisation configurable par type/rôle ;
- historique de description, diff des champs, undo général et time-in-state ;
- liens natifs vers branches/commits/builds/déploiements avec synchronisation ;
- sous-items éditables depuis la surface détail et vue structurée des dépendances.

## Couverture fonctionnelle — drag & drop et transitions

### Fonctionnalités terminées et prouvées

- changement de statut par glisser-déposer et par sélecteur dans le détail ;
- déplacement clavier par poignée focusable, `Espace` et flèches ;
- ordre dans une colonne envoyé avec `beforeId`/`afterId` ;
- persistance après rechargement lors d'un dépôt nominal ;
- rollback sur échec réseau avec toast `Déplacement impossible.` ;
- rollback du sélecteur avec toast `Mise à jour impossible.` ;
- contrôle de statut désactivé et `aria-busy=true` pendant une requête lente, empêchant une seconde mutation concurrente ;
- changement nominal local stabilisé en 178 à 267 ms ;
- lecteur sans poignée ni action de création, dans un compte réel et sans erreur console/HTTP.
- `Échap` restaure immédiatement le snapshot initial sans mutation serveur ;
- annonces clavier localisées avec clé, titre et statut métier, sans UUID ;
- dépôt souris vers une colonne vide correctement persisté après rechargement ;
- menu de statut directement sur la carte mobile, mutation puis restauration
  vérifiées à 390 × 844.

### Fonctionnalités incomplètes

- la poignée mesure 24 × 24 px, sans tooltip visible, sous la cible tactile recommandée ;
- la navigation clavier entre colonnes reste peu prévisible sans repère visuel
  permanent ;
- aucune confirmation/undo après un changement réussi ;
- aucune indication visuelle persistante de destination pendant l'auto-scroll ;
- correction de la collision prouvée sur un scénario desktop seulement, sans
  matrice longue ni tactile natif.

### Fonctionnalités manquantes

- workflows et transitions configurables avec conditions/validateurs ;
- limites WIP et signal de dépassement ;
- changement de statut en masse ;
- historique détaillé des transitions et temps passé par statut ;
- annulation utilisateur après persistance ;
- contrôle de concurrence multi-utilisateur et signal de conflit.

## Couverture fonctionnelle — workflow, statuts et colonnes

### Fonctionnalités terminées et prouvées

- quatre statuts créés automatiquement par backlog ;
- ordre des statuts persistant et partagé par les vues ;
- catégories métier `todo`, `in_progress` et `done` reflétées par les icônes et
  la date de clôture ;
- création d'un item directement dans un statut existant.
- action `Colonnes` découvrable depuis le board pour l'administrateur ;
- création, renommage, catégorie, couleur et réordonnancement persistants ;
- refus des noms dupliqués sans perdre le formulaire ;
- protection du dernier statut `todo` et du dernier statut `done` ;
- suppression occupée avec destination obligatoire et migration transactionnelle ;
- historique conservé avec noms métier même après suppression d'un statut ;
- lecteur réel sans administration de colonnes, création ni drag.

### Fonctionnalités incomplètes

- la notion de workflow se limite à un changement libre de statut, sans règles,
  conditions, validateurs ni explication d'un refus ;
- une colonne et un statut sont confondus, sans possibilité de regrouper
  plusieurs statuts dans une colonne ;
- pas d'archivage : une colonne doit être conservée ou supprimée ;
- pas d'aperçu global d'impact ni d'historique des changements de configuration ;
- le gestionnaire n'a pas encore été validé en responsive ni avec un lecteur
  d'écran réel.

### Fonctionnalités manquantes

- transitions autorisées, conditions, validateurs et post-actions ;
- limites WIP, Definition of Done et règles de sortie ;
- workflows réutilisables ou partageables entre backlogs ;
- mapping de plusieurs statuts vers une même colonne ;
- brouillon, aperçu d'impact et publication atomique d'un workflow complet.

## Top bugs

1. [BUG-JIR-011](bugs.md#bug-jir-011--lauto-défilement-horizontal-enregistre-une-colonne-différente-de-celle-visée) — corrigé sur le scénario desktop, mais la matrice de 50 dépôts et le tactile natif restent à exécuter.
2. [BUG-JIR-012](bugs.md#bug-jir-012--les-annonces-du-drag-clavier-exposent-des-uuid-internes-en-anglais) — corrigé dans la région live Playwright, validation NVDA/VoiceOver restante.
3. Aucun bug P0 ouvert dans le périmètre réaudité ; cette absence ne couvre pas les fonctionnalités encore non auditées.

## Top problèmes UX

1. Une poignée de 24 px sans tooltip reste peu découvrable et insuffisante en tactile.
2. La réorganisation des colonnes repose sur des flèches répétées, sans drag, aperçu ni publication groupée.
3. Aucun undo n'est proposé après une transition ou une migration administrative.
4. WIP, raisons de blocage et règles de transition manquent pour transformer le board en outil de pilotage fiable.
5. Le gestionnaire ne distingue pas encore clairement statut métier et colonne de visualisation.

## Top améliorations produit

1. Construire un composeur adaptatif : titre et description au centre, propriétés configurables en chips, préremplissage depuis vue/colonne/parent.
2. Faire de la création clavier un avantage distinctif : raccourci fiable, palette de commandes, navigation sans souris, brouillons.
3. Permettre aux équipes de configurer modèles, champs visibles, champs requis et valeurs par défaut.
4. Ajouter une création continue (« créer un autre ») et une détection de doublons.
5. Concevoir un véritable shell mobile, pas seulement une version desktop débordante.
6. Repenser le détail autour des propriétés fréquentes, sections repliables, historique/diff et clavier complet.
7. Remplacer le drag mobile comme voie principale par un menu `Changer le statut`, tout en conservant un drag précis en raccourci.
8. Ajouter destination annoncée, undo, limites WIP et transitions configurables.

## Quick Wins

- appeler `preventDefault()` avant d'ouvrir le dialogue via `C` et ajouter un test navigateur ;
- ajouter `maxLength={200}`, compteur de caractères et message `Titre trop long (200 max).` ;
- mapper les erreurs Zod au champ concerné au lieu de `Création impossible.` ;
- traduire le nom accessible `Close` en `Fermer` ;
- afficher une explication sous un parent requis manquant ;
- masquer/recomposer la toolbar sous 768 px et placer une action flottante de création.
- ajouter `maxLength={20000}` et compteur à la description avec erreur Zod précise ;
- ajouter `group-focus-within:flex` aux actions de retrait et les garder focusables ;
- rendre le renommage explicite via un bouton `Renommer`/crayon focusable ;
- gérer `Échap`, `aria-labelledby`, focus initial et retour au déclencheur sur le panneau ;
- passer la grille détail à une colonne sous le breakpoint mobile.
- localiser les annonces DnD et remplacer les UUID par clé, titre, colonne et position ;
- restaurer le snapshot d'origine sur `onDragCancel` ;
- porter la cible de la poignée à 44 px sans agrandir visuellement l'icône et ajouter un tooltip `Déplacer` ;
- afficher le nom de la colonne cible dans un badge flottant pendant le drag ;
- réduire la zone et la vitesse initiale d'auto-scroll horizontal.

## Dette technique visible

- Les contraintes de validation sont dupliquées implicitement entre UI et service ; l'UI ne partage pas la limite de 200 caractères.
- `mapCreateError` absorbe l'erreur Zod et détruit l'information actionnable.
- Le test unitaire du raccourci vérifie l'ouverture, mais pas l'absence d'injection dans un vrai navigateur.
- Les événements console de la session contiennent deux `401` TOTP attendus après codes invalides générés par l'audit ; aucune exception JavaScript n'a été observée pendant la création.
- Chromium signale que le formulaire de confirmation du mot de passe 2FA ne contient pas de champ username associé, ce qui peut dégrader les gestionnaires de mots de passe.
- `updateItemAction` absorbe les erreurs Zod non prévues dans `Mise à jour impossible.` ; le défaut est systémique, pas limité à la création.
- Le panneau est une modale construite manuellement avec backdrop + `aside`, sans primitive d'accessibilité ni handler clavier.
- Les actions de retrait utilisent `display:none` hors `group-hover`, ce qui les retire de l'arbre d'accessibilité.
- La grille `1fr 220px` et la largeur 620/92vw sont codées sans breakpoint.
- Le modèle DnD mélange projection locale, collision et état canonique : une annulation peut laisser une projection fantôme.
- Les identifiants techniques sont utilisés comme texte accessible par défaut.
- Le statut envoyé est dérivé de la cible courante après auto-scroll sans garde-fou prouvant qu'elle correspond à l'intention initialement visible.
- Aucun test navigateur de régression ne couvre drag horizontal, auto-scroll, annulation ou région live.

## Dette UX

- responsive non conçu pour les petits écrans ;
- raccourci non fiable malgré son affichage dans le tooltip ;
- erreurs globales au lieu d'erreurs de champ ;
- composeur minimal nécessitant des retours immédiats dans le panneau de détail ;
- ordre de tabulation décalé par rapport à l'ordre visuel ;
- libellés d'accessibilité partiellement en anglais.
- affordances `hover-only` et heading cliquable non sémantique ;
- panneau superposé sans modèle clavier standard ;
- propriétés non groupées et activité sans diff ;
- feedback de mutation dépendant du refresh, parfois lent ou transitoirement incohérent.
- drag présenté comme manipulation directe alors que la cible peut se déplacer sous le pointeur ;
- poignée non expliquée visuellement et cible tactile trop petite ;
- feedback lecteur d'écran non localisé et non métier ;
- absence d'undo et de voie mobile explicite hors drag.

## Historique des audits

### 2026-08-04 — Incrément 01

- Découverte générale de l'application authentifiée.
- Audit complet du parcours de création d'item sur desktop et viewport 390 × 844.
- Tests admin, contributeur et lecteur.
- Création de `CASS-57` avec modèle bug, statut En cours et priorité Urgent.
- Création de `CASS-58` au clavier avec modèle user story.
- Trois bugs enregistrés et benchmark de six concurrents ajouté.

### 2026-08-04 — Incrément 02

- Audit complet du panneau de détail et de l'édition sur desktop/mobile.
- Description Markdown, XSS, propriétés, activité, relations, GitHub, copie de lien et erreur de validation testés.
- Matrice admin/lecteur vérifiée avec un second compte réel et 2FA.
- Cinq nouveaux bugs enregistrés (`BUG-JIR-005` à `BUG-JIR-009`) ; `BUG-JIR-004` conservé comme diagnostic non-bug.
- Benchmark détail/édition de Jira, Linear, ClickUp, Azure DevOps, GitHub et Plane ajouté.
- Données temporaires retirées de `CASS-57` ; compte `Audit Lecteur` et label global `audit-detail` conservés comme données d'audit.

### 2026-08-04 — Remédiation P0/P1

- Correction et régression automatisée des huit bugs indexés : `BUG-JIR-001`, `002`, `003`, `005`, `006`, `007`, `008` et `009`.
- Validation partagée titre/description, erreurs Server Actions structurées et associées aux champs.
- Shell mobile en drawer, toolbar repliable et détail Radix plein écran monocolonne à 390 × 844.
- Renommage et retraits accessibles au clavier ; `Escape`, focus piégé et retour au déclencheur vérifiés.
- Propriétés du détail rendues optimistes avec `aria-busy`, confirmation, rollback et protection contre valeur serveur périmée.
- Vérification technique : 77 fichiers de tests, 663 tests réussis, 9 ignorés ; TypeScript, ESLint et build Next.js réussis.
- Session Chromium propre : 0 erreur console, 0 avertissement, aucune réponse HTTP en échec.

### 2026-08-05 — Incrément 03

- Audit complet du drag & drop et des transitions de statut sur desktop et viewport 390 × 844.
- Dépôt nominal, persistance, ordre, sélecteur, latence, verrouillage concurrent et deux rollbacks réseau vérifiés.
- Compte `Audit DnD Lecteur` créé et enrôlé en 2FA dans un contexte Playwright isolé ; aucune mutation du board exposée.
- Trois bugs enregistrés (`BUG-JIR-010` à `BUG-JIR-012`), dont un P0 d'intégrité du workflow.
- `CASS-58` restaurée dans `À faire` ; session admin finale propre avec 0 erreur et 0 avertissement.

### 2026-08-05 — Incrément 04 et remédiation board/workflow

- Audit initial des colonnes : aucune configuration disponible, création de
  `BUG-JIR-013` P0 produit.
- Implémentation et vérification Playwright du cycle créer, renommer, colorer,
  réordonner, recharger et supprimer une colonne vide ou occupée.
- Migration transactionnelle vers un statut choisi, invariants `todo`/`done`,
  refus des doublons et activité sans UUID après suppression.
- `BUG-JIR-014` découvert pendant le scénario de migration, corrigé puis rejoué
  sur `CASS-60` avec deux libellés métier stables.
- Revue de concurrence : verrouillage unifié `backlog → statuts → items` pour
  préserver `closedAt`, second drag bloqué pendant un commit et suppression
  initialement vide devenue occupée rendue récupérable avec le compte exact.
- Les deux courses UI ont été rejouées dans Chromium : 1 seul `POST` sous 900 ms
  de latence malgré une seconde tentative de drag ; le dialogue de suppression
  a basculé de « vide » à « 1 item » avec destination obligatoire sans fermeture.
- Régression DnD : annulation clavier restaurée, annonces françaises, dépôt
  souris vers `En revue` persisté et menu de statut mobile validé à 390 × 844.
- Compte réel `Audit Workflow Lecteur` créé et enrôlé en 2FA : aucune mutation
  du board exposée et accès `/admin` redirigé.
- Vérification technique : 82 fichiers de tests réussis, 682 tests réussis et
  15 ignorés ; TypeScript, ESLint, `git diff --check` et build Next.js 16.2.7
  avec webpack réussis. Le build Turbopack par défaut ne peut pas être certifié
  dans cette sandbox, qui refuse son port interne et l'accès à Google Fonts.

### 2026-08-05 — Incrément 05 backlog produit et triage

- Vue Liste vérifiée avec 11 items : tri titre ascendant/descendant persistant
  dans l'URL, groupement par priorité et mutation inline de priorité.
- Le tableau expose exactement `Clé`, `Titre`, `Statut`, `Prio`, `Labels`,
  `Échéance`, `Assigné` ; 0 checkbox, 0 ligne sélectionnable en masse et 0
  poignée de classement.
- L'arbre expose 11 éléments déplaçables, mais le dépôt sur un frère tente un
  parentage, affiche `Parent invalide pour ce type.` et laisse l'ordre inchangé.
- Création, détail, navigation et administration vérifiés : aucun champ ni point
  d'entrée pour estimation, cycle/sprint, release/version ou capacité.
- Priorité de `CASS-58` changée vers `Basse` puis restaurée à `Aucune` ; POST
  200 et retour visible mesuré à environ 110 ms.
- `BUG-JIR-015` créé avec quatre captures ; console finale : 0 erreur, 0
  avertissement ; réseau nominal : deux mutations POST 200 et rafraîchissements
  GET 200.

## Fin de session — incrément 02

### Ce qui a été testé

Panneau de détail/édition : ouverture, fermeture, copie de lien, titre, description Markdown/XSS/limite, propriétés, activité, relations, référence GitHub valide/invalide, lecteur read-only, performance, responsive 390 px et accessibilité clavier. Les preuves console/réseau/captures ont été archivées.

### Ce qui reste à tester

Drag & drop et transitions, filtres/groupements/vues enregistrées, commentaires de bout en bout, activité approfondie, navigation Liste/Arbre, recherche, notifications, Mes items, corbeille, administration, préférences, thème, authentification/2FA complète, sécurité et concurrence multi-utilisateur. La suppression/restauration d'item n'a pas été exécutée pour éviter de perturber les données d'audit.

### Trois priorités absolues pour la prochaine session

1. Auditer le **drag & drop et les transitions de statut**, y compris erreurs, limites et concurrence.
2. Auditer **filtres, groupements et vues enregistrées** comme workflow de triage.
3. Auditer les **commentaires et l'activité** de bout en bout, avec permissions, mentions, édition/suppression et notifications.

## Fin de session — remédiation P0/P1

### Ce qui a été testé

- Création : raccourci `C`, titre vide, focus, limite/compteur 200 et mapping de l'erreur serveur.
- Détail : titre clavier, description 20 000, dialogue/`Escape`, annulation d'édition sans fermeture parasite, retour du focus, grille responsive.
- Relations et développement : boutons de retrait atteignables par `Tab` sans survol ; relation temporaire créée puis supprimée.
- Shell mobile 390 × 844 : colonne unique, drawer, fermeture `Escape`, action `Nouvel item` entièrement visible.
- Propriétés : feedback optimiste observé sous 800 ms de latence simulée, `aria-busy=true`, confirmation puis restauration de la donnée initiale.
- Console/réseau, tests complets, TypeScript, ESLint et build de production.

### Ce qui reste à tester

Les corrections responsive doivent encore être rejouées à 320, 768 et 1024 px. Le reste du produit reste hors validation : drag & drop et transitions, filtres/groupements/vues enregistrées, commentaires/activité approfondis, Liste/Arbre, recherche, notifications, Mes items, corbeille, administration, préférences, thème, authentification/2FA complète, sécurité et concurrence multi-utilisateur.

### Trois priorités absolues pour la prochaine session

1. Auditer le **drag & drop et les transitions de statut**, avec rollback, permissions et concurrence.
2. Auditer **filtres, groupements et vues enregistrées**, y compris URL, partage et états vides.
3. Auditer les **commentaires et l'activité** de bout en bout, avec édition/suppression, permissions et notifications.

## Fin de session — incrément 03

### Ce qui a été testé

Drag souris et clavier, dépôt inter/intra-colonne, persistance après rechargement, annulation `Échap`, auto-scroll horizontal desktop/mobile, statut depuis le détail, latence normale et simulée, verrouillage de concurrence, échecs réseau et rollback, annonces accessibles, découvrabilité de la poignée et rôle lecteur réel. Les captures, transcriptions console et requêtes ont été archivées.

### Ce qui reste à tester

Filtres/groupements/vues enregistrées, commentaires/activité approfondis, Liste/Arbre, recherche, notifications, Mes items, corbeille, administration complète, préférences, thème, authentification/2FA complète, charge de boards volumineux et concurrence multi-utilisateur réelle. Le drag tactile natif reste à rejouer dans un contexte Playwright `hasTouch` dédié.

### Trois priorités absolues pour la prochaine session

1. Corriger et réauditer **BUG-JIR-011** avant toute autre évolution du board.
2. Corriger **BUG-JIR-010** et **BUG-JIR-012**, puis ajouter la régression Playwright clavier/auto-scroll.
3. Une fois le board fiable, auditer **filtres, groupements et vues enregistrées**, y compris URL, partage et états vides.

## Fin de session — incrément 04 et remédiation

### Ce qui a été testé

Configuration des colonnes par administrateur, persistance après rechargement,
ordre, couleur, catégorie, doublon, protection des derniers statuts initial et
terminé, suppression vide/occupée, migration d'item, cohérence de l'activité,
droits d'un lecteur réel, redirection `/admin`, annulation DnD clavier, annonce
live française, dépôt souris desktop et statut mobile à 390 × 844. Les preuves
console, réseau et captures sont archivées.

### Ce qui reste à tester

La configuration mobile du workflow, NVDA/VoiceOver, la matrice de 50 dépôts par
colonne, le tactile natif et les mutations forgées de rôle restent à rejouer.
Pour la gestion produit de bout en bout : backlog/triage, cycles ou sprints,
estimations, releases, dépendances, vues enregistrées, reporting, recherche,
notifications et concurrence multi-utilisateur ne sont pas encore validés.

### Trois priorités absolues pour la prochaine session

1. Auditer le **backlog produit et le triage** : capture, priorisation, estimation,
   classement, bulk edit et passage vers l'exécution.
2. Auditer les **cycles/sprints et releases** de bout en bout, ou constater leur
   absence avec un écart Jira explicite.
3. Auditer **hiérarchie et dépendances** : epic → tâche → sous-tâche, blocages,
   progression et visibilité cross-équipe.

## Fin de session — incrément 05 backlog produit et triage

### Ce qui a été testé

Liste desktop, tri et persistance URL, groupement par priorité, colonnes
disponibles, absence de sélection multiple, mutation inline de priorité avec
restauration, création, propriétés du détail, navigation, administration et
arbre. Le déplacement de l'arbre a été cassé volontairement avec des types et
des cibles incompatibles pour distinguer parentage et classement. Console,
réseau, performance et captures ont été archivés.

### Ce qui reste à tester

Les filtres combinés et vues enregistrées seront audités comme fonctionnalité
séparée. Il reste surtout à auditer puis construire cycles/sprints, capacité,
estimations, releases, dépendances, progression d'epic, reporting, recherche,
notifications, collaboration et concurrence multi-utilisateur. Le responsive
multi-breakpoints reste volontairement repoussé à la fin.

Note produit enregistrée pour plus tard : connecter des dépôts et lier les pull
requests aux items, avec checks CI, merge, déploiement et traçabilité de release.

### Trois priorités absolues pour la prochaine session

1. Concevoir puis implémenter le **socle de backlog planifiable** : rang
   persistant, réordonnancement manuel et sélection/bulk edit.
2. Ajouter les **estimations et cycles/sprints**, avec capacité et passage clair
   du backlog vers l'exécution.
3. Ajouter les **releases/versions**, puis relier dates, progression et éléments
   livrés.

## Fin de session — incrément 06 partiel : vue Backlog et classement

### Score provisoire du pilotage produit

**62/100 — confiance élevée sur le classement clavier, faible sur la
planification complète.** La vue Backlog, le rang et l’estimation réduisent
l’écart constaté à l’incrément 05. Le score reste limité par l’absence de bulk
UI, sprints/capacité et releases.

### Ce qui a été testé

- Onglet Backlog, tâches non terminées, champs de planification, compteurs de
  points et items non estimés.
- Classement clavier avec annonces françaises, mutation POST, ordre optimiste
  et persistance après rechargement.
- Tri binaire des rangs fractionnels, dont le cas réel `aBV` / `aBl`.
- Hydratation SSR/client du contexte DnD avec identifiant stable.
- Tests complets Vitest : 734 passés ; tests transactionnels ciblés PostgreSQL :
  10 passés ; TypeScript et ESLint verts.
- Playwright Chromium : 1 scénario passé, 0 erreur console, 0 échec réseau,
  0 réponse HTTP en erreur ; POST 141 ms, `DOMContentLoaded` 176 ms, load 318 ms.

Preuves : [capture](screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png),
[console](console/2026-08-05-session-06-backlog-ranking-smoke-console.log) et
[réseau](network/2026-08-05-session-06-backlog-ranking-smoke-requests.log).

### Ce qui reste à tester

Dans PR1 : classement souris, annulation/rollback réseau, rôle lecteur réel,
édition d’estimation, sélection multiple, plage, tout sélectionner et chaque
action bulk. Ensuite : sprints, capacité, démarrage, board du sprint actif et
clôture. Le responsive reste volontairement en fin d’audit.

### Trois priorités absolues pour la prochaine session

1. Implémenter et casser la sélection multiple, la sélection par plage et le
   verrouillage pendant mutation.
2. Brancher et auditer les bulk actions statut, priorité, assigné, estimation
   et sprint, avec rollback transactionnel.
3. Terminer la matrice Playwright PR1 : souris, lecteur, filtres/tri/groupement,
   panne réseau, performances et reload.

## Fin de session — incrément 06 final : fondation Backlog PR1

### Score provisoire du pilotage produit

**70/100 — confiance élevée sur la fondation Backlog PR1.** Jiroo couvre
désormais le rang manuel, les estimations nullables, la sélection simple/par
plage/globale et le triage groupé transactionnel. Il reste derrière Jira tant
que sprints, capacité, board du sprint actif et releases ne sont pas livrés.

### Ce qui a été testé

- Sélection visible permanente, clic individuel, `Shift` par plage, checkbox
  globale et état indéterminé.
- `Ctrl/Cmd+A` limité à la surface de travail, `Échap`, isolation des éditeurs
  inline, réconciliation après filtre et remise à zéro au changement de vue.
- Bulk statut, priorité, assigné et estimation sur deux tâches, avec compteurs
  modifiés/inchangés, valeurs visibles et restauration de l’état d’audit.
- Estimation unitaire `5 → 0 → null`, fermeture du menu après succès et
  distinction explicite entre zéro et non estimé.
- Classement souris persistant, restauration clavier persistante, blocage avec
  tri/groupement, conservation de `view=backlog` après rechargement.
- Deux POST interrompus volontairement : classement exactement restauré,
  sélection bulk conservée et messages français sûrs.
- Compte réel `Audit Playwright Lecteur` : 0 poignée, 0 checkbox, 0 éditeur
  d’estimation, 0 barre bulk et aucune mutation.
- Matrice Playwright Chromium finale : **7 scénarios passés en 12,8 s**.
  Scénario nominal : 0 erreur console, 0 échec réseau, 0 réponse HTTP ≥ 400.
  Échecs injectés : deux `net::ERR_FAILED` attendus, expliqués et isolés.
- Mesures bulk locales : priorité 256 ms, statut 240 ms, assigné 221 ms,
  estimation 141 ms. Rechargement : `DOMContentLoaded` 289 ms, load 290 ms.

Preuves : [bulk edit](screenshots/FIXED-PARTIAL-BUG-JIR-015-bulk-edit.png),
[points](screenshots/FIXED-PARTIAL-BUG-JIR-015-story-points.png),
[classement](screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png),
[console nominale](console/2026-08-05-session-06-backlog-foundation-console.log),
[réseau nominal](network/2026-08-05-session-06-backlog-foundation-requests.log),
[console d’échec injecté](console/2026-08-05-session-06-backlog-foundation-failure-console.log)
et [réseau d’échec injecté](network/2026-08-05-session-06-backlog-foundation-failure-requests.log).

### Ce qui reste à tester

La vérification technique complète de PR1 est passée : **755 tests unitaires
et composants**, **17 tests d’intégration avec base**, typecheck, lint et build
Next.js de production. Fonctionnellement, le prochain manque bloquant est le
cycle sprint : création, objectif, dates, capacité, engagement, démarrage,
board du sprint actif, clôture et report des tâches incomplètes. Releases,
reporting et hiérarchie/dépendances approfondies suivent. Le responsive
multi-breakpoints reste volontairement à la fin.

### Trois priorités absolues pour la prochaine session

1. Ajouter les **sprints** avec nom, objectif, dates, capacité et états
   planifié/actif/terminé.
2. Faire du **board le board du sprint actif**, sans sprint parallèle en V1,
   puis prouver démarrage et clôture dans Playwright.
3. Ajouter les **releases/versions** et commencer le pilotage de livraison,
   avant reporting de vélocité et intégration dépôt/PR.

## Fin de session — incrément 08 : sprints et capacité

### Score global provisoire

**78/100 — confiance élevée sur le cycle sprint et ses cas limites principaux.**
Jiroo permet désormais de planifier, démarrer, exécuter et clôturer un sprint.
Le score reste plafonné par l'absence de releases, de rapport de sprint, de
vélocité et de signalement des changements de périmètre actif.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 82/100 | Drag/bulk, capacité, Board actif et trois destinations de clôture prouvés |
| Fiabilité et feedback | 88/100 | Cycle persistant, rollbacks réseau, collation binaire et mutations transactionnelles |
| Efficacité UX | 77/100 | Sections compactes repliables et Board contextualisé ; tâche encore artificiellement liée à un Epic |
| Accessibilité | 82/100 | Contrôles nommés, rôle lecteur protégé et nom accessible de création corrigé |
| Responsive | 64/100 | Inchangé : audit volontairement desktop-first |
| Permissions | 95/100 | Lecteur réel : métadonnées visibles, zéro contrôle de mutation sur Backlog et Board |
| Performance locale | 81/100 | Mutations principales observées entre 192 et 540 ms en développement |

### Ce qui a été testé

- création de deux sprints, nom, objectif, dates, capacité et agrégats ;
- création contextuelle et affectation groupée d'une plage de deux tâches ;
- repli/réouverture des sections et persistance après rechargement ;
- démarrage d'un sprint unique, redirection vers son Board et exclusion réelle
  des tâches du backlog ;
- création depuis le Board actif et transition réelle d'une carte par drag ;
- clôture avec report d'une tâche incomplète vers un sprint planifié, historique
  de membership et retour du Board à l'état vide ;
- absence de sprint actif avec conservation des paramètres d'URL ;
- POST de démarrage interrompu : message français, dialogue et état planifié
  conservés ;
- compte lecteur réel : consultation Backlog/Board sans checkbox, drag, création
  ou action de cycle ;
- dépassement de capacité recalculé `3 → 0 → 1 pt` sans bloquer artificiellement
  le démarrage ;
- clôture vers Backlog, sprint existant et nouveau sprint unique ; blocage d'une
  sous-tâche ouverte avec sa clé métier et transaction inchangée ;
- drag souris vers une section vide, répété **5/5**, et rollback d'un drag
  inter-section après panne ;
- matrice Playwright Chromium complète PR1 + PR2 : **14 scénarios passés en
  42,8 s**, dont les 7 scénarios sprint. Les parcours nominaux n'ont produit
  aucune erreur console ou HTTP. Quatre
  `net::ERR_FAILED` sont injectés et attendus : bulk sprint, drag, démarrage et
  clôture.

Mesures locales finales : création sprint 204–208 ms, création de tâche
175–278 ms, démarrage 260 ms, drag Board 492 ms, clôture 238 ms et bulk sprint
301 ms. Chargement mesuré : `DOMContentLoaded` 304 ms, load 391 ms.

Vérification technique finale : **804 tests unitaires/composants**, **38 tests
d'intégration PostgreSQL**, typecheck, lint et build Next.js 16 de production
passés.

Preuves : [Board sans sprint](screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sans-sprint-actif.png),
[Board actif](screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sprint-actif.png),
[clôture](screenshots/FIXED-PARTIAL-BUG-JIR-015-cloture-sprint.png),
[variantes de clôture](screenshots/FIXED-PARTIAL-BUG-JIR-015-cloture-variantes.png),
[capacité dépassée](screenshots/FIXED-PARTIAL-BUG-JIR-015-capacite-depassee.png),
[planification bulk](screenshots/FIXED-PARTIAL-BUG-JIR-015-planification-sprint-bulk.png),
[lecteur](screenshots/FIXED-PARTIAL-BUG-JIR-015-sprint-lecteur.png),
[échec réseau attendu](screenshots/EXPECTED-sprint-start-network-error.png),
[console nominale](console/2026-08-05-session-08-sprint-lifecycle-console.log)
et [réseau nominal](network/2026-08-05-session-08-sprint-lifecycle-requests.log).

### Ce qui reste à tester

Les dates invalides, le clavier vers une section vide, les changements de scope
du sprint actif et la concurrence de deux responsables restent à rejouer dans
Chromium. Les releases/versions, rapports de sprint, vélocité, burndown et
prévision sont absents. La contrainte imposant un Epic parent à toute tâche est
un écart Jira important. Le responsive multi-breakpoints reste volontairement
en fin d'audit.

### Trois priorités absolues pour la prochaine session

1. Ajouter et auditer les **releases/versions** de la planification à la
   publication.
2. Ajouter le **rapport de sprint**, la vélocité et un premier burndown fondé
   sur l'historique désormais persistant.
3. Concevoir l'**intégration dépôt/PR** pour relier exécution technique, checks
   CI et release sans confondre `Terminé` avec `Livré`.

## Fin de session — incrément 09 : schémas de permissions Jira-like

### Score global provisoire

**82/100 — confiance élevée sur l’autorisation et le cycle sprint, plus faible
sur le pilotage produit restant.** Le gain depuis 78 vient d’une matrice réelle
à cinq identités, d’un setup 2FA autonome et de preuves causales UI/serveur/base
sur les schémas partagés. Après revue, ce score est conservé uniquement parce
que le rôle protégé parasite a été retiré, les mutations `browse_backlog` sont
effectuées dans l’UI et les invariants de non-mutation sont vérifiés en base. Il
ne crédite aucune interface Releases, encore absente.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 84/100 | Groupes, rôles, grants, schémas, concurrence et dix scénarios multi-utilisateurs |
| Fiabilité et feedback | 92/100 | Payload forgé sans mutation métier/audit, conflit stale récupérable et historique exact append-only |
| Efficacité UX | 80/100 | Mode Simple, mode Avancé et Assistant explicitent les sources de droit |
| Accessibilité | 86/100 | Un seul `main`, contrôles nommés et surfaces interdites absentes |
| Responsive | 64/100 | Inchangé : matrice permissions desktop Chromium |
| Permissions | 98/100 | Cinq comptes 2FA, rôle personnalisé seul en CASS, refus LABS et contrôles UI + serveur + données |
| Performance locale | 84/100 | Mutations 21–339 ms ; navigations/reloads 248–1 040 ms en développement isolé |

### Ce qui a été testé

- setup Playwright autonome : reset refusé sans opt-in explicite, autorité URL
  locale et nom de base autorisé ; les paramètres `host`, `hostaddr`, `port`,
  `database`/`dbname`, `service`, socket et équivalents sont refusés, et tout
  paramètre inconnu est deny-by-default hors liste TLS/app-name ; exactement
  cinq comptes, enrôlement TOTP réel, sessions `0600` séparées et fixtures
  CASS/LABS ;
- création UI d’un groupe, d’un rôle personnalisé et d’un clone de schéma ;
- portée backlog du seul chemin `Membre E2E → Équipe delivery → Spécialiste
  delivery` dans CASS, sans rôle direct/protégé, puis refus dans LABS ;
- explication des grants direct, groupe et rôle par l’Assistant ;
- rejeu par un lecteur d’une Server Action capturée, reciblée vers un nom neuf
  qui aurait muté sans garde : erreur structurée, compte de groupes et historique
  strictement identiques avant/après ;
- spécialiste autorisé à gérer les sprints, sans édition d’item ni workflow ;
- `manage_releases` expliqué sans inventer de page ou contrôle Releases ;
- ajout puis retrait de `browse_backlog` depuis la matrice UI dans un second
  contexte admin, répercutés sur navigation, recherche, récents, contenu du
  panneau notifications et accès URL direct ;
- conflit de version entre deux éditeurs d’un schéma partagé, puis récupération
  après reload ;
- baseline exacte de l’historique `group_created`, deux mutations navigateur,
  exactement deux événements supplémentaires retrouvés par cible/valeur/
  corrélation et premier événement byte-for-byte inchangé après le second ;
  persistance après reload et dans un second contexte utilisateur.

`test:e2e` ne définit jamais le consentement destructif. Le reset accepte
exclusivement la base locale `jiroo_e2e` et vérifie aussi l’identité physique de
l’instance sur la même connexion que le `TRUNCATE`. L’URL reste dans
l’environnement local de l’opérateur ; la commande suivante capture
l’identifiant sans l’afficher ni l’inscrire dans l’historique shell :

```sh
export PATH=/Users/nkrmr/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin
# DATABASE_URL doit déjà provenir d’un fichier local ignoré ou d’un gestionnaire de secrets.
JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER="$(
  psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align \
    --command='SELECT system_identifier FROM pg_control_system()'
)"
export JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER

JIROO_ALLOW_E2E_RESET=1 \
JIROO_E2E_RUN_ID='<run-id-unique>' \
JIROO_E2E_COMMAND_LABEL='pnpm --ignore-workspace test:e2e -- --project=chromium' \
JIROO_E2E_SCENARIOS='régression Chromium complète' \
JIROO_E2E_PERSIST_AUDIT=1 \
pnpm --ignore-workspace test:e2e -- --project=chromium
```

Le flag unique `JIROO_E2E_PERSIST_AUDIT=1` maintient ensemble le JUnit, le
manifeste, les journaux et les captures ; une configuration partielle n’est
plus possible. Playwright lance son propre serveur depuis ce worktree sur `:3100`, avec
`.next-e2e`, sans réutiliser le serveur manuel `:3000`. `globalSetup` réserve
chaque run-id exactement une fois par `wx` `0600`; aucune variable transmissible
ne permet la réentrance. Journaux et captures sont toujours préfixés par le run
ID et publiés sans écrasement. Un manifeste `0600` conserve Node/pnpm, SHA Git,
nom et empreinte de base, serveur, invocation, horodatages et lien JUnit, jamais
l’identifiant PostgreSQL brut. Au round 3, sous Node 24.13.0 et sur
`jiroo_e2e`, la matrice dédiée passe **10/10 en 25,4 s** et la régression
Chromium complète **24/24 en 59,8 s**. Les preuves immuables sont le
[run dédié](runs/20260806-review-r3-permissions-02-junit.xml), son
[manifeste](runs/20260806-review-r3-permissions-02-manifest.json), le
[run complet](runs/20260806-review-r3-chromium-01-junit.xml), son
[manifeste](runs/20260806-review-r3-chromium-01-manifest.json) et le
[contrôle d’intégrité historique](runs/20260806-review-r3-chromium-01-history-integrity.json).
Chaque scénario permissions conserve aussi ses journaux uniques, par exemple
[console](console/20260806-review-r3-permissions-02-permission-schemes-01-create-group-role-scheme-console.log)
et [réseau](network/20260806-review-r3-permissions-02-permission-schemes-01-create-group-role-scheme-network.log).
Aucun parcours nominal ne contient d’erreur console, de requête échouée ou de
réponse HTTP inattendue. Les six échecs réseau du run complet sont les POST
interrompus volontairement et marqués `[expected]` par les scénarios de rollback.
Les 187 fichiers historiques restent byte-for-byte identiques sans restauration.
Le premier run round 3, qui a révélé puis permis de corriger une extension de
capture temporaire perdue, est conservé sous son run ID mais n’est pas cité
comme preuve d’acceptation.

La vérification finale Task 10 rejoue la régression complète sur le commit
`e07fa2f` avec le run conservé `20260806-task10-chromium-01` :
[JUnit 24/24](runs/20260806-task10-chromium-01-junit.xml),
[manifeste de provenance](runs/20260806-task10-chromium-01-manifest.json) et
[revue/ledger](reviews/2026-08-06-task10-review.md). Les dix scénarios de
permissions restent sans erreur console/page/requête ni statut HTTP 4xx/5xx.
La revue indépendante suivante a identifié une course de publication JUnit
entre deux processus ayant chargé la configuration avant la réservation. Les
commits de correction publient désormais le rapport temporaire du seul
propriétaire par lien atomique exclusif; un test lance réellement deux processus
Playwright avec le même run ID. Le run ci-dessus reste la preuve Chromium de
`e07fa2f` et n'est pas présenté comme une preuve navigateur des corrections.

Après fermeture des quatre findings Important, la preuve finale complète est le
run immuable `20260806-task10-final-chromium-02` sur `f891d2c` :
[JUnit 24/24](runs/20260806-task10-final-chromium-02-junit.xml) et
[manifeste de provenance](runs/20260806-task10-final-chromium-02-manifest.json).
Ses 60 fichiers sont tous run-scoped : 20 journaux console, 20 journaux réseau,
18 captures, JUnit et manifeste. Les parcours nominaux ne contiennent aucune
erreur console/page/requête, aucun échec réseau et aucun statut HTTP 4xx/5xx.
Les six `ERR_FAILED` sont limités aux trois journaux de rollback injecté. Les
scans ne trouvent ni motif de secret générique ni identité PostgreSQL brute.
Le premier essai `20260806-task10-final-chromium-01` est conservé comme diagnostic
(22 réussites, 2 erreurs) : les sélecteurs E2E attendaient encore les anciens
libellés avec email. Il n'est pas cité comme preuve d'acceptation.

La re-review R2 suivante a fermé trois autres findings Important par TDD : les
identités assigné/rapporteur courantes restent affichées séparément des candidats
et deviennent des options désactivées lorsqu'elles ne sont plus sélectionnables ;
le Server Action du helper exige maintenant `browse_users` après ses gates
backlog/admin ; la résolution `assignable_user` utilise deux requêtes DAL bornées
au lieu d'un `checkPermission` par compte. La preuve de charge ajoute 64 comptes
d'annuaire et vérifie exactement deux requêtes, tandis que la matrice PostgreSQL
complète passe 16/16 fichiers et 125/125 tests. Conformément au gate R2, aucun
Chromium n'a été relancé avant re-review : le run `20260806-task10-final-chromium-02`
reste uniquement la preuve de son SHA source enregistré `f891d2c`, pas des
commits R2. Le détail et les SHA sont dans le
[ledger Task 10](reviews/2026-08-06-task10-review.md).

La R3 indépendante conclut ensuite **PASS, 0 Critical/Important**. La preuve de
livraison finale est le run immuable unique
`20260806-task10-delivery-chromium-01` sur le SHA source `3e592090` :
[JUnit 24/24](runs/20260806-task10-delivery-chromium-01-junit.xml) et
[manifeste de provenance](runs/20260806-task10-delivery-chromium-01-manifest.json).
Le gate complet compte 125 fichiers unitaires et 1 051 tests réussis, puis
16 fichiers/125 tests PostgreSQL, typecheck, ESLint et build Next 16.2.7 verts.
Les 60 preuves navigateur sont run-scoped : 20 consoles, 20 réseaux,
18 captures, JUnit et manifeste. Les scans trouvent 0 erreur nominale,
0 statut HTTP 4xx/5xx, 0 motif de secret et 0 identité PostgreSQL brute ; les
six `ERR_FAILED` et six `[error]` sont limités aux trois parcours de rollback
injecté. Ce run remplace les preuves historiques comme preuve de livraison de
la branche corrigée R2/R3.

Le détail finding par finding est conservé dans le
[registre de revue Task 9 round 1/5](reviews/2026-08-06-task9-review-r1.md) et le
[registre round 2/5](reviews/2026-08-06-task9-review-r2.md). Le durcissement
d’identité, d’immuabilité et de provenance est détaillé dans le
[registre round 3/5](reviews/2026-08-06-task9-review-r3.md).

### Bugs et dette observés

`BUG-JIR-024` ferme une élévation de privilège via les membres d’un groupe
administrateur. `BUG-JIR-025` élimine les clés React dupliquées des blockers de
rôle. `BUG-JIR-026` restaure un unique landmark principal sur la page Accès.
Le harnais de classement attend maintenant une interaction client réelle avant
sa capture, ce qui évite une course entre hydratation React et le masquage de
caret de Playwright.

Restent hors couverture : responsive multi-breakpoints de l’administration,
lecteurs d’écran réels, volumétrie élevée, concurrence à plus de deux éditeurs
et visualisation UI complète de l’historique de sécurité. Releases/versions,
rapport de sprint, vélocité et burndown demeurent des fonctions produit absentes.

### Trois priorités absolues pour la prochaine session

1. Livrer les **releases/versions** et appliquer réellement `manage_releases`.
2. Exposer l’**historique de sécurité** filtrable dans l’interface et rejouer
   l’administration aux breakpoints 390/768/1024/1440 px.
3. Construire le **rapport de sprint**, la vélocité et le burndown à partir des
   événements persistants, avec totaux explicables item par item.

---

## Fin de session — incrément 10 : découverte Releases / Versions

### Verdict

**Fonctionnalité manquante — P0.** Playwright confirme que Jiroo ne possède
aucun consommateur métier de `manage_releases`. La permission est visible dans
l’Assistant d’accès, mais aucune Release/Version ne peut être créée, consultée,
affectée à un item, filtrée, publiée ou archivée.

Le score global reste **82/100** : les incréments précédents n’accordaient déjà
aucun crédit à Releases. La confiance sur ce constat est élevée, car les
surfaces principales et les URL directes ont été testées dans Chromium.

### Ce qui a été testé

- navigation principale et administration : aucun menu Releases/Versions ;
- Backlog : aucune colonne, aucun filtre et aucune action bulk Release/Version ;
- création d’item : aucun champ de planification de version ;
- détail d’item : aucun champ `Fix versions` ;
- page Accès : `Gérer les releases` existe bien dans l’Assistant ;
- `/b/CASS/releases` et `/b/CASS/versions` : réponses HTTP 404 ;
- serveur `main` redémarré et compte d’audit réinitialisé avant le parcours
  nominal ; ce parcours ne produit aucune erreur console ou réseau inattendue.

Preuves : [Backlog sans Release](screenshots/BUG-JIR-027-releases-absentes-backlog.png),
[console nominale](console/2026-08-07-session-10-releases-nominal-console.log),
[réseau nominal](network/2026-08-07-session-10-releases-nominal-network.log),
[console des routes directes](console/2026-08-07-session-10-releases-direct-routes-console.log)
et [réseau des routes directes](network/2026-08-07-session-10-releases-direct-routes-network.log).

### Ce qui reste à tester

La fonctionnalité étant absente, aucun cycle de création, affectation,
publication, archivage, permission ou concurrence ne peut encore être exécuté.
Ces scénarios constitueront la matrice d’acceptation de l’implémentation.

### Trois priorités absolues pour la prochaine session

1. Valider le design du modèle Jira : Version de backlog et champ multivalué
   `Fix versions` sur les items.
2. Livrer le cycle non publiée → publiée → archivée, l’affectation unitaire/bulk,
   les filtres et la progression sous `manage_releases`.
3. Prouver dans Playwright la publication avec items incomplets, la persistance,
   les refus serveur et un second contexte utilisateur.

---

## Fin de session — incrément 10 livré : noyau Releases / Versions

### Verdict et score

**87/100 — confiance élevée sur le noyau Releases et sa régression, plus faible
sur le reporting et la profondeur Release PR2.** `BUG-JIR-027` est fermé : la
permission `manage_releases` possède désormais un consommateur métier complet,
et les `Fix versions` multivaluées participent réellement à la planification.

| Dimension | Score | Preuve principale |
|---|---:|---|
| Couverture fonctionnelle observée | 91/100 | Cycle, affectations, filtres, progression et 16 scénarios Releases prouvés |
| Fiabilité et feedback | 95/100 | Transactions, snapshots append-only, stale conflict, rollback et persistance |
| Efficacité UX | 86/100 | Navigation dédiée, sélecteur partagé, bulk, filtres URL et drilldowns |
| Accessibilité | 88/100 | Contrôles nommés, permissions visibles et régression clavier conservée ; lecteur d’écran réel restant |
| Responsive | 64/100 | Inchangé : livraison auditée en Chromium desktop |
| Permissions | 98/100 | `manage_releases`, `edit_items`, refus forgés et isolation CASS/LABS prouvés |
| Performance locale | 86/100 | Requêtes bornées, filtre SQL direct et preuve de 1 000 liens sans fan-out |

L’avancement de l’audit atteint **environ 90 %** : création, détail, workflow,
Backlog, sprints, permissions et Releases sont couverts en profondeur. Restent
principalement le rapport de sprint/vélocité/burndown, la Release PR2,
l’intégration dépôt/PR, le responsive multi-breakpoints et les lecteurs d’écran.

### Fonctionnalités terminées et prouvées

- Version backlog-scoped avec nom, description, responsable, dates et états
  non publiée, publiée et archivée ;
- création, modification, publication, dépublication, archivage et restauration ;
- `Fix versions` many-to-many depuis création, détail et barre bulk, avec
  ajout, remplacement et retrait ;
- filtre Version en SQL, combinable avec les autres facettes, persistant dans
  l’URL et les vues enregistrées sur Liste, Backlog, Board et Arbre ;
- progression par statuts, points estimés/non estimés et drilldowns vers les
  items exacts ;
- traitement explicite des incomplets à la publication, sans retirer leurs
  versions sans rapport ;
- snapshots de publication append-only et historique corrélé ;
- cycle de vie sous `manage_releases`, affectation sous `edit_items`, éditeur
  sans contrôles de cycle et lecteur sans mutation ;
- erreurs foreign/absent/deleted indistinguables, IDs malformés sans erreur SQL,
  conflit optimiste, rollback réseau, second utilisateur et isolation backlog.

### Fonctionnalités incomplètes ou manquantes

- fusion de versions et suppression avec transfert ou retrait explicite ;
- ordre manuel des versions ;
- notes de release exportables et travail connexe ;
- signaux Git/PR/checks/déploiement dans la readiness ;
- responsive 390/768/1024/1440, zoom 200 % et validation NVDA/VoiceOver ;
- rapport de sprint, vélocité, burndown et prévision de release.

### Revue, vérification et preuve immuable

Les six vagues indépendantes de revue spécification puis sécurité se terminent
toutes par **PASS, 0 Critical, 0 Important**. Les findings importants ont été
corrigés par TDD : provenance immuable, intégrité des événements après
suppression, audit de cycle/move, oracle bulk, rechargements, IDs malformés,
ancêtres hiérarchiques et détail non filtré. La revue finale du delta E2E
`92a00b8..88b8171` passe également avec **0/0/0**.

Vérification finale autoritative sur
`8eef265f971ca8244e67299926223046a3529cda` :

- Vitest hors DB : **135 fichiers, 1 182 tests**, 29,14 s Vitest ;
- PostgreSQL gardé `jiroo_e2e` : **19 fichiers, 184 tests**, 32,52 s Vitest ;
- TypeScript, ESLint, merge-base exact et `git diff --check` : verts ;
- build Next.js 16.2.7 : vert, compilation 4,7 s et TypeScript 8,6 s ;
- Chromium persistant : [JUnit **40/40**](runs/20260807-releases-core-delivery-03-junit.xml),
  0 échec/erreur/skip, 124,838 s JUnit, avec
  [manifeste](runs/20260807-releases-core-delivery-03-manifest.json) exact ;
- preuve : **93 fichiers run-scoped** — 36 consoles, 36 réseaux,
  18 captures, JUnit, manifeste et [résumé de scan](runs/20260807-releases-core-delivery-03-scan.txt) ;
- scans : 0 statut HTTP 4xx/5xx, 0 secret, 0 URL/variable DB, 0 header
  auth/cookie, 0 token et 0 identité PostgreSQL brute. Les **neuf erreurs
  console et neuf requêtes échouées** sont confinées aux six scénarios
  délibérément injectés : les trois logs legacy backlog-foundation-failure,
  sprint-lifecycle-failure et sprint-planning-failure, plus Releases S07, S12
  et S14 ; ils sont accompagnés de huit marqueurs `[expected]`.

Correction historique : le run immuable delivery-02 reste **39/39** et 90
fichiers, mais son scan compte lui aussi **9 + 9 dans ces six scénarios**. La
formulation antérieure 6 + 6 / trois scénarios avait omis S07, S12 et S14 sans
modifier les artefacts gelés. Delivery-03 est désormais la preuve autoritative.

Le run persistant `20260807-releases-core-delivery-01` sur le SHA
`92a00b8489c747a6ad2fd693964658b11e722dff` est conservé comme diagnostic :
**36/39**. Il a révélé trois attentes legacy devenues fausses ou
instables après Releases (permission sans interface, colonne `Fix versions`,
drag rollback dépendant du scroll). Il n’est pas une preuve d’acceptation.

Le détail finding par finding est dans le
[registre Releases core](reviews/2026-08-07-releases-core-review.md).

### Trois priorités absolues pour la prochaine session

1. Livrer la **PR Release 2** : fusion, suppression/transfert, ordre et notes.
2. Construire le **rapport de sprint, la vélocité et le burndown** à partir des
   snapshots et événements existants, avec drilldowns explicables.
3. Ajouter la **readiness Git/PR/déploiement**, puis rejouer Releases aux quatre
   breakpoints et avec VoiceOver/NVDA.
