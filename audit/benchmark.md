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
