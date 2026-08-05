# Benchmark — création d'un item

## Note après remédiation — 4 août 2026

Jiroo a comblé plusieurs écarts de qualité d'exécution : raccourci fiable, validation précise, accessibilité clavier et surfaces mobiles fonctionnelles sur le périmètre observé. Cela le rapproche de Linear sur le socle d'interaction, mais ne change pas le verdict de couverture : Linear reste supérieur sur brouillons et continuité clavier, Jira sur configurabilité, ClickUp sur profondeur, Azure DevOps sur règles/relations, GitHub Projects sur création continue et Plane sur structuration des propriétés.

## Verdict

Sur le périmètre observé, **Jiroo ne bat encore aucun des six concurrents sur la création**. Il est plus simple que ClickUp ou Jira, mais cette simplicité vient aujourd'hui d'une couverture réduite, pas d'une exécution supérieure. Linear est la référence UX ; ClickUp domine la profondeur ; Jira la configurabilité et la gouvernance.

## Comparaison

| Produit | Ce qu'il fait mieux | Limite/opportunité pour Jiroo |
|---|---|---|
| Jira | `C` fiable, titre + description, champs requis et quick create configurable ; parent configurable à la création | Jiroo peut rester plus léger, mais doit rendre ses champs rapides configurables et ses erreurs précises |
| Linear | `C`, création plein écran, modèles, brouillons, URLs préremplies, champs et formulaires structurés | Référence à dépasser sur vitesse clavier et continuité du brouillon |
| ClickUp | Description, assignés, champs personnalisés, sous-tâches, checklist, pièces jointes, dates, estimation, dépendances et modèles dans le modal | Ne pas copier toute la densité ; proposer un composeur progressif avec propriétés configurables |
| Azure DevOps | Ajout ultra-rapide titre + Entrée depuis board/backlog, formulaire riche et CLI/API avec champs | Jiroo a une hiérarchie claire, mais manque de modes rapide/riche assumés |
| GitHub Projects | Héritage du groupe, assignés/labels/milestones/description, `Create more`, draft issues et custom fields | Jiroo doit ajouter création continue et brouillons tout en gardant ses types métiers |
| Plane | Command surface clavier et API riche : description, état, assignés, priorité, labels, parent, estimation, type, module et dates | Jiroo doit exposer davantage de propriétés et une palette cohérente |

## Détail par concurrent

### Jira

Jira permet `C` pour créer. Son quick create moderne inclut titre, description et jusqu'à trois champs requis, et les administrateurs peuvent déterminer les champs visibles. Il peut aussi proposer le parent à la création.

Sources officielles : [raccourcis Jira](https://support.atlassian.com/jira-software-cloud/docs/use-keyboard-shortcuts/), [création et quick create](https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/).

**Comment Jiroo peut faire mieux :** conserver une interface plus rapide, mais permettre à chaque backlog de définir 3 à 5 propriétés visibles, sans ouvrir un formulaire Jira massif.

### Linear

Linear traite la création comme l'action la plus fréquente : `C` ouvre le modal, `V` le plein écran, `Alt/Option+C` ouvre les modèles. Les brouillons sont conservés et les modèles peuvent inclure propriétés, sous-items et champs structurés obligatoires.

Sources officielles : [Create issues](https://linear.app/docs/creating-issues), [Issue templates](https://linear.app/docs/issue-templates).

**Comment Jiroo peut faire mieux :** faire de la hiérarchie métier une force — type et parent préremplis depuis le contexte — tout en égalant Linear sur raccourcis, brouillons et feedback instantané.

### ClickUp

ClickUp permet d'ajouter dans le modal presque toute la définition d'une tâche : description, assignés, custom fields, sous-tâches, checklist, pièces jointes, priorité, dates, tags, estimation, dépendances, followers et modèles. Les tâches créées depuis une vue héritent aussi de nombreux filtres/champs.

Sources officielles : [Create a task](https://help.clickup.com/hc/en-us/articles/6309647350807-Create-a-task), [Create a task from views](https://help.clickup.com/hc/en-us/articles/31463619842711-Create-a-task-from-views).

**Comment Jiroo peut faire mieux :** éviter la surcharge de ClickUp avec un système de champs favoris, une section `Plus` et des modèles adaptés au contexte.

### Azure DevOps

Azure Boards permet d'ajouter rapidement un work item depuis Boards/Backlogs/Sprints en choisissant le type, saisissant le titre puis `Entrée`. Son CLI prend aussi assigné, description, discussion, itération et champs personnalisés.

Source officielle : [View and add work items](https://learn.microsoft.com/en-us/azure/devops/boards/work-items/view-add-work-items?view=azure-devops).

**Comment Jiroo peut faire mieux :** offrir une vraie saisie inline pour les cas simples, avec ouverture optionnelle du composeur enrichi seulement quand nécessaire.

### GitHub Projects

GitHub hérite la valeur du groupe lors de la création, comme Jiroo le fait pour le statut. Il ajoute assignés, labels, jalons, autres projets et description avant création, offre `Create more`, et distingue issues réelles et drafts ultra-rapides.

Source officielle : [Adding items to your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project?apiVersion=2022-11-28).

**Comment Jiroo peut faire mieux :** ajouter un mode idée/brouillon et `Créer et continuer`, puis convertir/enrichir sans casser la hiérarchie.

### Plane

Plane documente une command surface clavier capable de créer des work items et une API de création avec description, état, assignés, priorité, labels, parent, estimation, type, module, dates de début et cible.

Sources officielles : [documentation Plane](https://docs.plane.so/), [API Create a work item](https://developers.plane.so/api-reference/issue/add-issue), [Power K](https://plane.so/blog/introducing-power-k-keyboard-first-navigation-and-actions).

**Comment Jiroo peut faire mieux :** proposer une palette de commandes focalisée et des raccourcis mémorisables, avec une validation de niveau produit supérieure à l'écosystème open source.

## Cible recommandée pour Jiroo

Le meilleur compromis n'est pas de cloner un concurrent :

1. vitesse et brouillons de Linear ;
2. champs de création configurables de Jira ;
3. héritage de contexte de ClickUp/GitHub ;
4. hiérarchie stricte propre à Jiroo ;
5. feedback et accessibilité sans dette.

Un objectif mesurable : créer une tâche complète — titre, description, parent, assigné, priorité et échéance — en moins de 15 secondes, sans souris, sans correction post-création et sans erreur console.

---

# Benchmark — détail et édition d'un item

## Verdict

Jiroo couvre le socle attendu — titre, Markdown, propriétés, activité, relations et références GitHub — mais **reste derrière les six concurrents sur la maturité de la surface détail**. Linear fait mieux sur l'édition directe et l'historique de description ; Jira sur l'autosave et la configurabilité ; ClickUp sur la richesse ; Azure DevOps sur les relations et règles ; GitHub sur la clarté des actions et l'historique ; Plane sur l'architecture de l'information moderne.

## Comparaison synthétique

| Produit | Qui fait mieux et pourquoi | Comment Jiroo pourrait faire mieux |
|---|---|---|
| Jira | Jira : édition au clic/tap, autosave au blur et `Échap` pour abandonner ; champs configurables et masquables quand vides | Garder une surface plus légère, mais adopter autosave robuste, annulation explicite, champs configurables et feedback précis |
| Linear | Linear : titre/description éditables directement, raccourcis, historique de description restaurable et undo | Rendre l'édition clavier native, ajouter historique/diff et viser une latence perçue quasi instantanée |
| ClickUp | ClickUp : custom fields, sous-tâches, relations, checklists, commentaires assignés, pièces jointes et activité dans une seule tâche | Organiser progressivement ces capacités sans créer une page dense ; sections repliables et personnalisables |
| Azure DevOps | Azure DevOps : grand nombre de champs typés, règles de validation/permissions, nombreux types de liens et édition explicite des relations | Ajouter schéma de champs/règles et relations symétriques complètes, avec actions toujours accessibles |
| GitHub | GitHub : boutons `Edit/Save` explicites, timeline du renommage, historique de description, champs structurés et dépendances via UI/CLI | Conserver l'inline, mais ajouter affordance visible, historique et surface d'automatisation/API cohérente |
| Plane | Plane : propriétés clés promues près du titre, propriétés secondaires groupées, activité divisée en commentaires/historique/transitions/worklogs, time-in-state | S'inspirer de cette hiérarchie d'information et dépasser Plane par une accessibilité clavier et un responsive irréprochables |

## Détail par concurrent

### Jira

Jira enregistre les modifications de détail lorsque l'utilisateur quitte le champ et documente `Échap` pour abandonner. Il permet aussi aux équipes de configurer le layout et de masquer les champs vides.

Source officielle : [Update a work item's details](https://support.atlassian.com/jira-software-cloud/docs/update-a-work-items-details/).

**Opportunité Jiroo :** proposer un mode inline plus rapide que Jira, mais avec état `Enregistrement…/Enregistré`, annulation et validation structurée. Le flat list actuel ne doit pas devenir un mini formulaire Jira non configurable.

### Linear

Linear permet de modifier titre et description directement. Il expose l'historique de description via la commande `Issue description history` et permet de restaurer une version antérieure.

Source officielle : [Edit issues](https://linear.app/docs/editing-issues).

**Opportunité Jiroo :** égaler Linear sur le clavier et l'historique tout en exploitant mieux la hiérarchie type/parent propre à Jiroo. Le renommage par heading cliquable seul est très en dessous de cette barre.

### ClickUp

ClickUp rassemble sous la description les custom fields, sous-tâches, relations, checklists, commentaires assignés et pièces jointes ; la tâche possède aussi un journal continu d'activité et commentaires.

Sources officielles : [Task sections](https://help.clickup.com/hc/en-us/articles/34958820098839-Custom-Fields-subtasks-relationships-and-attachments), [Intro to tasks](https://help.clickup.com/hc/en-us/articles/10552031987735-Intro-to-tasks).

**Opportunité Jiroo :** ne pas chercher la parité brute. Définir un noyau visible, des sections repliables et une personnalisation par rôle/type pour rester plus lisible que ClickUp.

### Azure DevOps

Azure DevOps fournit plus de cent champs selon le process, avec types, listes de valeurs, règles, valeurs requises/readonly et restrictions par groupe. Les relations couvrent parent/enfant, lié, prédécesseur/successeur, commits et pull requests, avec ajout, modification et suppression explicites.

Sources officielles : [Add or modify a work tracking field](https://learn.microsoft.com/en-us/azure/devops/reference/add-modify-field?view=azure-devops-server), [Link work items to objects](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/add-link?view=azure-devops).

**Opportunité Jiroo :** offrir une version SaaS plus simple des règles de champ et des relations, sans cacher les actions. Les trois relations actuelles et l'URL GitHub sont un début, pas une couverture équivalente.

### GitHub

GitHub affiche un bouton `Edit` explicite près du titre, conserve le changement dans la timeline et garde un historique de description. Ses issues prennent aussi en charge type, parent, sous-issues et dépendances, y compris via CLI.

Sources officielles : [Editing an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/editing-an-issue), [Adding and managing issue fields](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-and-managing-issue-fields).

**Opportunité Jiroo :** conserver la rapidité inline, mais rendre l'action aussi explicite que GitHub et journaliser les anciennes/nouvelles valeurs, pas seulement « a modifié ».

### Plane

Plane a récemment refondu sa page détail autour des données d'usage : état, priorité, assigné et dates près du titre ; propriétés groupées et repliables ; historique, transitions et worklogs séparés ; description longue tronquée ; relations personnalisées et time-in-state.

Sources officielles : [Meet the new work item detail page](https://plane.so/blog/meet-the-new-work-item-detail-page), [New work-item detail view and custom relations](https://plane.so/blog/new-work-item-detail-view-custom-relations-and-more).

**Opportunité Jiroo :** reprendre la logique de priorisation plutôt que le visuel. Une différenciation crédible serait : panneau instantané, entièrement clavier, mobile-first, historique précis et schéma de propriétés configurable.

## Cible recommandée pour Jiroo

- Toute propriété fréquente modifiable en un geste, avec feedback < 100 ms et confirmation serveur < 800 ms p95 en production.
- Toutes les actions accessibles sans souris ; `Échap` ferme, focus restauré, aucune action `hover-only`.
- Panneau monocolonne utile à 320–480 px, deux colonnes seulement quand la largeur le permet.
- Titre et description avec historique/diff/restauration.
- Propriétés groupées/configurables par type et rôle, relations extensibles et références de développement structurées.

---

# Benchmark — drag & drop et transitions de statut

## Verdict

Jiroo possède plus de fondations qu'un simple prototype : statut par drag ou sélecteur, ordre, clavier, rollback et permissions. Mais **il est actuellement derrière les six concurrents sur la confiance opérationnelle**, car une mauvaise colonne peut être persistée. Linear est la meilleure référence pour l'alternative clavier ; Jira et Plane pour les transitions gouvernées ; Azure DevOps pour WIP/Definition of Done ; GitHub Projects et ClickUp pour le groupement flexible.

## Comparaison synthétique

| Produit | Qui fait mieux et pourquoi | Comment Jiroo pourrait faire mieux |
|---|---|---|
| Jira | Jira bloque les déplacements sans transition valide et explique que le workflow/les conditions empêchent le mouvement | Afficher les destinations autorisées et la raison d'un refus avant le dépôt, avec un modèle de workflow plus simple que Jira |
| Linear | Linear offre sélection, navigation, commande `S`, menu de commandes et raccourcis de réordonnancement ; le drag n'est pas l'unique voie | Faire du menu de statut clavier/mobile la voie fiable et conserver le drag comme accélérateur précis |
| ClickUp | ClickUp groupe le board par statut, assigné, tag, échéance ou priorité et permet les changements en masse | Étendre le drag aux groupements seulement après avoir sécurisé collision, permissions et rollback |
| Azure DevOps | Azure permet de déplacer entre colonnes, réordonner, configurer WIP, colonnes scindées et Definition of Done | Ajouter WIP et critères de sortie légers, visibles au moment du dépôt |
| GitHub Projects | GitHub applique la valeur du groupe lors du dépôt, quel que soit le champ de groupement, et conserve plusieurs layouts/vues | Généraliser le moteur de groupe avec une correspondance stricte entre cible visible et valeur écrite |
| Plane | Plane combine cinq layouts, bulk operations, workflow/approbations et journal de chaque transition avec time-in-state | Dépasser Plane sur accessibilité et mobile, puis ajouter gouvernance et historique sans alourdir le geste quotidien |

## Détail par concurrent

### Jira

Jira ne traite pas toutes les colonnes comme librement accessibles : le drag dépend des transitions et conditions du workflow. Son message d'échec indique qu'un élément empêche le passage au statut et renvoie vers la configuration.

Source officielle : [Unable to drag and drop issues between columns](https://support.atlassian.com/jira/kb/unable-to-drag-and-drop-issues-between-the-columns-on-the-board/).

**Opportunité Jiroo :** proposer des règles compréhensibles directement dans la cible — `Revue impossible : assigné requis` — sans imposer l'administration complexe de Jira.

### Linear

Linear permet de naviguer et sélectionner les issues au clavier, d'ouvrir la commande de statut et de réordonner sans long drag. Lors d'un changement via raccourci ou menu, l'issue va en haut de la colonne ; la souris conserve la position choisie.

Sources officielles : [Board layout](https://linear.app/docs/board-layout), [Select issues](https://linear.app/docs/select-issues).

**Opportunité Jiroo :** garder la poignée accessible, mais ajouter un raccourci de statut explicite qui annonce les noms de colonnes. Un geste clavier ne devrait jamais exiger de deviner combien de flèches traversent cartes et colonnes.

### ClickUp

ClickUp positionne le board comme une surface drag & drop et permet de grouper par statut, assigné, tags, échéance ou priorité, avec sous-groupes et actions en masse.

Source officielle : [List view vs Board view](https://help.clickup.com/hc/en-us/articles/6310314670359-List-view-vs-Board-view).

**Opportunité Jiroo :** ne pas multiplier les groupements tant que la destination n'est pas fiable. Ensuite, offrir moins d'options que ClickUp, mais une collision plus prédictible et accessible.

### Azure DevOps

Azure Boards permet les déplacements avant/arrière, le réordonnancement vertical, les limites WIP, les colonnes scindées et la Definition of Done. Le dépassement WIP est signalé visuellement.

Sources officielles : [Manage columns on your board](https://learn.microsoft.com/en-us/azure/devops/boards/boards/add-columns?view=azure-devops), [Kanban quickstart](https://learn.microsoft.com/azure/devops/boards/boards/kanban-quickstart?view=azure-devops).

**Opportunité Jiroo :** ajouter un WIP minimaliste et des critères de sortie dans les en-têtes, avec avertissement avant mutation plutôt qu'un board purement décoratif.

### GitHub Projects

GitHub Projects applique automatiquement la valeur d'un groupe lors d'un drag : déplacer de `In progress` à `Done` modifie le champ `Status`. Le même modèle s'applique à d'autres champs groupables.

Sources officielles : [Customizing the table layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-table-layout), [Quickstart for Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects).

**Opportunité Jiroo :** formaliser `cible visible = valeur écrite` comme invariant testé, puis réutiliser ce moteur pour priorité/assigné/composant.

### Plane

Plane expose plusieurs layouts, bulk operations, workflows/approbations et un journal de chaque transition avec auteur, timestamp et time-in-state.

Sources officielles : [Work items](https://plane.so/work-items), [New work-item detail view, custom relations and more](https://plane.so/blog/new-work-item-detail-view-custom-relations-and-more), [Plane documentation](https://docs.plane.so/).

**Opportunité Jiroo :** viser une exécution plus nette : mobile sans drag obligatoire, annonces françaises exemplaires et historique compact. La gouvernance peut venir ensuite.

## Cible recommandée pour Jiroo

1. invariant absolu entre cible active, payload et état rechargé ;
2. changement de statut accessible hors drag en deux gestes maximum ;
3. undo de 5 à 10 secondes après succès ;
4. WIP et règles de transition avec raison visible ;
5. historique des transitions et time-in-state ;
6. p95 de confirmation serveur inférieur à 800 ms, feedback local inférieur à 100 ms.

---

# Benchmark — configuration du workflow et des colonnes

## Verdict

Après remédiation, Jiroo couvre le socle backlog-local : création, renommage,
catégorie, couleur, ordre et suppression transactionnelle avec migration. Il ne
rattrape toutefois aucun des six concurrents sur la profondeur de workflow :
transitions, WIP, mapping statut/colonne, modèles, héritage et gouvernance restent
absents. Son avantage observable est une suppression occupée explicite et sûre,
pas une parité Jira.

| Produit | Qui fait mieux et pourquoi | Cible Jiroo |
|---|---|---|
| Jira | Workflows, transitions, statuts et mapping vers les colonnes sont configurables | Offrir d'abord un modèle backlog-local beaucoup plus simple, puis ajouter règles et mapping |
| Linear | Les statuts d'équipe sont configurables, ordonnés et regroupés par catégorie | Égaler la rapidité de configuration avec des catégories explicites et une UX française plus accessible |
| ClickUp | Statuts personnalisés par espace/dossier/liste et nombreux modèles | Éviter la cascade complexe, mais permettre duplication et héritage explicites plus tard |
| Azure DevOps | Colonnes, WIP, split columns et Definition of Done | Ajouter WIP et critères de sortie après la gestion sûre des colonnes |
| GitHub Projects | Champ Status et groupes configurables par vue | Séparer plus tard statut métier et représentation de board, sans perdre la simplicité actuelle |
| Plane | États configurables par groupe, cycles et workflows modernes | Dépasser Plane sur migration sûre, clavier et feedback d'impact |

## Comment Jiroo peut faire mieux

Commencer par un invariant lisible : une colonne correspond à un statut du
backlog, toutes les mutations sont transactionnelles et aucune suppression ne
perd un item. Ensuite seulement, introduire plusieurs statuts par colonne,
transitions, WIP et workflows partagés. Cette progression peut être plus claire
que l'administration Jira, mais elle ne doit pas être présentée comme une parité
Jira avant l'arrivée des règles et schémas réutilisables.

---

# Benchmark — backlog produit et triage

## Verdict

Les six concurrents font mieux que Jiroo sur la préparation du travail. Jira et
Azure DevOps proposent les chaînes les plus complètes ; Linear est la référence
de vitesse ; ClickUp domine les opérations en masse ; GitHub Projects fournit
les briques configurables ; Plane couvre déjà cycles, releases, estimations et
bulk operations. Jiroo n'a pour l'instant qu'une liste filtrable et un triage
unitaire rapide.

| Produit | Capacité officielle pertinente | Qui fait mieux / cible Jiroo |
|---|---|---|
| Jira | Backlog Scrum avec rang DnD, sprints, versions, estimation et bulk edit | Jira fait nettement mieux ; Jiroo doit couvrir le chemin rang → estimation → sprint → release sans reprendre sa complexité d'administration |
| Linear | Ordre manuel souris/clavier, sélection multiple, estimations, cycles automatiques, triage dédié et releases | Linear fait mieux en vitesse ; viser les mêmes raccourcis avec des décisions de capacité plus visibles |
| ClickUp | Liste avec sélection/bulk toolbar, sprints, sprint points ou temps estimé | ClickUp fait mieux en volume ; proposer moins d'actions, mais les rendre cohérentes et rapides |
| Azure DevOps | Product/portfolio/sprint backlogs, Stack Rank, bulk update, effort, forecast et velocity | Azure DevOps fait mieux en planification ; viser d'abord un seul backlog d'équipe lisible avec capacité fiable |
| GitHub Projects | Table/board/roadmap, champs personnalisés, iteration field, priorité et estimation configurables | GitHub fait mieux en flexibilité ; Jiroo peut faire mieux avec des concepts produit natifs et moins de configuration préalable |
| Plane | Cycles, modules, releases, estimations et bulk operations documentés | Plane fait mieux sur le socle open source ; Jiroo doit égaler ce minimum avant de revendiquer la gestion de produit de bout en bout |

## Sources officielles

- Jira : [Use your Scrum backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/), [Rank a work item](https://support.atlassian.com/jira-software-cloud/docs/rank-an-issue/), [Enable sprints](https://support.atlassian.com/jira-software-cloud/docs/enable-sprints/), [Releases and versions](https://support.atlassian.com/jira-software-cloud/docs/enable-releases-and-versions/), [Bulk actions from the backlog](https://support.atlassian.com/jira-software-cloud/docs/edit-multiple-issues-at-once-from-the-backlog/).
- Linear : [Select issues](https://linear.app/docs/select-issues), [Estimates](https://linear.app/docs/estimates), [Cycles](https://linear.app/docs/use-cycles), [Triage](https://linear.app/docs/triage), [Releases](https://linear.app/docs/releases).
- ClickUp : [List view](https://help.clickup.com/hc/en-us/articles/6310260883351-Intro-to-List-view), [Bulk Action Toolbar](https://help.clickup.com/hc/en-us/articles/6309768265495-Manage-tasks-with-the-Bulk-Action-Toolbar), [Run a sprint](https://help.clickup.com/hc/en-us/articles/6304342064151-Run-a-sprint).
- Azure DevOps : [Use backlogs to manage projects](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/backlogs-overview?view=azure-devops), [Create and manage your product backlog](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/create-your-backlog?view=azure-devops).
- GitHub Projects : [Planning and tracking with Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), [Projects quickstart](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects), [Iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields).
- Plane : [Documentation](https://docs.plane.so/), [Cycles API](https://developers.plane.so/api-reference/cycle/overview), [Work item estimates](https://developers.plane.so/api-reference/issue/overview).

## Comment Jiroo pourrait faire mieux

Ne pas construire six écrans séparés. Une seule vue Backlog peut réunir rang
persistant, sélection multiple, estimation et affectation par glisser-déposer à
un cycle ou une release. L'avantage différenciant doit être une planification
compréhensible en moins de quinze minutes par une nouvelle équipe, avec calculs
de capacité explicables et aucune configuration Jira-like avant le premier
sprint.

## Mise à jour — classement Backlog de l’incrément 06

Jiroo couvre désormais le noyau du classement Jira : vue dédiée, rang persistant,
drag clavier annoncé, ordre conservé après rechargement et estimation nullable
visible. Sur ce sous-périmètre, l’implémentation est crédible et plus explicite
que Jira quand un tri temporaire empêche le classement manuel.

Jira, Linear, ClickUp, Azure DevOps et Plane restent devant sur la sélection en
masse et la planification en sprint/cycle. GitHub Projects reste devant sur les
champs et itérations configurables. Aucun crédit de parité globale n’est donc
accordé avant la preuve navigateur des bulk actions, de la capacité et du cycle
complet démarrage → exécution → clôture.
