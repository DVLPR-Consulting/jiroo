# Audit UX

## Mise à jour de remédiation — 4 août 2026

Les défauts UX reproductibles de création et de détail ont été corrigés et rejoués dans Chromium : raccourci `C` sans caractère parasite, limites visibles 200/20 000, bouton de renommage clavier, actions de retrait révélées au focus, dialogue nommé avec `Escape` et retour au déclencheur, shell mobile en drawer, toolbar repliable et détail plein écran monocolonne.

Le feedback des propriétés est désormais optimiste : la nouvelle valeur apparaît immédiatement, le champ expose `aria-busy=true`, puis confirme ou revient à la valeur précédente en erreur. Cela corrige la régression visuelle observée, mais ne remplace pas une mesure p95 sur un environnement de production.

Dette UX restante : composeur trop pauvre, activité sans diff/restauration, architecture plate des propriétés, cibles tactiles encore compactes dans le header du détail, et absence de validation navigateur à 320/768/1024 px.

### Dette UX remboursée dans cette session

- shell desktop forcé sur mobile ;
- action primaire de création hors viewport ;
- panneau détail écrasé par une grille fixe ;
- actions de retrait exclusivement au survol ;
- heading cliquable non sémantique ;
- absence de modèle clavier standard et de restitution du focus ;
- erreurs globales de longueur sans limite visible ;
- feedback pessimiste des propriétés du détail.

## Fonctionnalité auditée : création d'item

### Efficacité mesurée

| Parcours | Interactions minimales observées | Résultat |
|---|---:|---|
| Ouvrir depuis la toolbar | 1 clic | Dialogue ouvert, aucun contexte métier hérité |
| Ouvrir depuis une colonne | 1 clic | Statut de la colonne correctement prérempli |
| Créer un composant minimal | 1 clic + saisie + `Entrée` | Fonctionnel |
| Créer une tâche hiérarchique | 1 clic + type + titre + parent + soumission | Fonctionnel, mais parent obligatoire expliqué uniquement par bouton désactivé |
| Créer au clavier | `C`, saisie, `Entrée` | Défectueux : `C` injecte un caractère |

- Création nominale ressentie : environ **1,03 s** entre soumission et retour au board en serveur de développement.
- Requête de création observée : environ **261 ms**.
- Navigation complète observée après changement de rôle : **344 ms**, `DOMContentLoaded` à 329 ms, transfert 26 Ko / corps décodé 182 Ko.

Ces mesures locales servent de ligne de base, pas de SLA de production.

### Clarté et feedback

Points solides :

- les libellés de champs sont explicites ;
- le statut de colonne est hérité ;
- le bouton change d'icône/libellé accessible selon le type ;
- le formulaire reste rempli après une erreur ;
- l'item créé apparaît immédiatement et le compteur est actualisé.

Défauts :

- aucune indication de limite sur le titre ;
- erreur globale non actionnable ;
- aucun marquage des champs requis ;
- le modèle choisi ne montre pas le contenu qui sera injecté ;
- l'utilisateur doit ouvrir le nouvel item pour renseigner description, assigné, labels et échéance ;
- le type par défaut est `Composant`, choix risqué si la tâche est l'unité de travail la plus fréquente ; cette décision doit être validée par la télémétrie, pas supposée.

### États et résilience

- Titre vide ou composé d'espaces : soumission désactivée, correctement.
- Parent requis absent : soumission désactivée, mais sans message explicatif si des parents existent.
- Double-clic : une seule création observée.
- Annulation par `Échap` : données remises à zéro lors de la réouverture.
- Erreur serveur : dialogue conservé avec données, mais feedback trop générique.
- Lecteur : aucune action de création et `C` inactif, correctement.

### Accessibilité

- Les champs disposent de noms accessibles et les labels sont associés.
- Le dialogue piège correctement le focus.
- Le nom accessible de fermeture est `Close` dans une interface française.
- L'autofocus commence sur `Titre`. En tabulant vers l'avant, l'ordre observé est : Titre → Statut → Priorité → Nature → Créer → Close → Modèle → Type → Titre. L'ordre ne suit donc pas l'ordre visuel au point d'entrée.
- Plusieurs contrôles mesurent 28 à 32 px de haut, sous la cible tactile confortable de 44 px.
- Les erreurs ne sont pas associées au champ via `aria-describedby`/`aria-invalid`.

### Responsive

Le dialogue s'adapte correctement à 390 px lorsqu'il est ouvert. Le shell, lui, rend l'action primaire hors écran. La responsabilité n'est pas celle du dialogue seul : la création reste inutilisable si l'utilisateur ne peut pas atteindre son déclencheur.

### Cohérence

- `Fermer` est utilisé sur le panneau de détail, `Close` sur le dialogue de création.
- `Rapport de bug` et `User story` se comportent comme des modèles, mais leur effet n'est visible qu'après création.
- Le formulaire rapide et le panneau de détail exposent des ensembles de champs nettement différents sans expliquer qu'une étape d'enrichissement suivra.

## Recommandations UX prioritaires

1. Reconcevoir le shell mobile et conserver une action de création toujours visible.
2. Corriger le raccourci et ajouter une vraie palette de commandes.
3. Ajouter description et propriétés fréquentes dans un composeur progressif configurable.
4. Afficher les contraintes au niveau du champ et déplacer le focus sur la première erreur.
5. Prévisualiser le contenu des modèles et permettre de le modifier avant création.
6. Proposer `Créer` et `Créer et continuer` ; sauvegarder les brouillons lors d'une interruption.
7. Aligner l'ordre de focus sur l'ordre visuel ou placer Modèle/Type après le titre.

## Observations de découverte à auditer plus tard

- Les états vides des vues personnelles et partagées sont clairs et orientés action, mais le parcours d'enregistrement n'a pas encore été testé.
- La recherche affiche un état `Aucun item récent.` ; pertinence, raccourcis et erreurs restent à tester.
- Les notifications affichent `Aucune notification.` ; génération, lecture et préférences restent à tester.

## Fonctionnalité auditée : panneau de détail et édition

### Efficacité mesurée

| Parcours | Interactions minimales observées | Résultat |
|---|---:|---|
| Ouvrir un item depuis le board | 1 clic | Fonctionnel ; panneau visible en ~1,1 s lors de la première mesure |
| Modifier statut/priorité/nature/assigné | 1 sélection par champ | Fonctionnel ; feedback par désactivation temporaire, stabilisation jusqu'à ~3 s lors de changements rapides |
| Modifier la description | 1 clic `Éditer` + saisie + 1 clic `Enregistrer` | Fonctionnel, Markdown GFM rendu et balise script neutralisée |
| Renommer le titre | 1 clic direct sur le titre + saisie + blur/Entrée | Fonctionnel mais caché et inaccessible au clavier |
| Ajouter une relation | type + recherche + item + ajout | Fonctionnel ; suppression cachée au survol |
| Ajouter une référence GitHub | coller URL + ajouter | Fonctionnel ; validation d'URL correcte |
| Copier le lien | 1 clic | Fonctionnel avec toast `Lien copié.` |

- Navigation complète locale après reconnexion : `DOMContentLoaded` **349 ms**, `load` **370 ms**, TTFB **201 ms**.
- Enregistrement de description observé : environ **1,06 s** avant rendu mis à jour.
- Les propriétés modifiées en rafale reviennent visuellement à l'ancienne valeur pendant la transition et se stabilisent après environ **3 s**. Le résultat final est correct, mais l'incertitude perçue est trop élevée.

### Clarté, feedback et cohérence

Points solides :

- les propriétés clés sont regroupées dans une colonne cohérente ;
- les changements de statut, priorité, nature, assigné, rapporteur, labels et échéance sont visibles dans l'activité ;
- le Markdown est rendu, les liens sont cliquables et une balise `<script>` reste du texte inerte ;
- les rôles lecteur voient les données sans affordance de mutation ;
- l'URL GitHub invalide produit un message précis ;
- le lien copié, les ajouts et les suppressions ont un feedback visible.

Défauts :

- `Actions` ne contient que la suppression, alors que le renommage est caché dans le titre ;
- aucune limite ni compteur sur la description ; l'erreur de dépassement est générique ;
- le succès d'ajout d'un lien GitHub peut disparaître lors du rafraîchissement, même si le nouveau lien devient visible ;
- les actions de retrait n'existent visuellement qu'au survol ;
- aucune prévisualisation côte à côte ni historique/restauration de description ;
- les propriétés sont une liste plate : l'évolutivité sera faible dès l'ajout de champs personnalisés.

### Permissions

- Admin : lecture, édition, liens, développement et suppression disponibles.
- Lecteur : titre/description/propriétés visibles, mais aucun éditeur, menu `Actions`, composition de commentaire, ajout ou retrait de lien. Ce comportement a été vérifié avec le compte navigateur `Audit Lecteur`.
- Le rôle contributeur a été validé sur la création dans l'incrément 01 ; sa matrice complète sur commentaires/suppression reste à auditer.

### Accessibilité clavier

- Le titre éditable est un `<h2>` non focusable (`tabIndex=-1`) avec un handler de clic ; il n'est ni découvrable ni activable au clavier.
- Les boutons de retrait des relations et liens GitHub utilisent `display:none` hors survol. Après focus sur la relation, `Tab` passe directement au sélecteur de type.
- `Échap` ne ferme pas le panneau ; seul le bouton `Fermer` retire `?item=…`.
- Le panneau est un `aside` superposé avec backdrop, sans nom accessible observé, sans focus initial ni piège/restauration de focus.
- Les cibles de fermeture et d'actions du header restent petites pour un usage tactile.

### Responsive

À 390 × 844, le panneau est limité à 92 vw (359 px), mais conserve une grille interne `1fr 220px`. La colonne de contenu utile tombe à environ 98 px. Le panneau est techniquement dans le viewport, mais son contenu principal est pratiquement illisible : c'est un échec responsive, pas une adaptation réussie.

### Recommandations UX prioritaires — détail

1. Recomposer le panneau en plein écran monocolonne sur mobile ; propriétés dans un accordéon ou sous le contenu.
2. Rendre toutes les mutations explicites et clavier : titre focusable, actions de retrait visibles au focus, `Échap`, focus initial et retour au déclencheur.
3. Partager les limites de validation, afficher compteurs et erreurs directement sous le champ.
4. Remonter statut, priorité, assigné et échéance près du titre ; grouper les propriétés secondaires et statiques.
5. Ajouter historique/restauration de description et diff des valeurs dans l'activité.
6. Introduire un feedback optimiste cohérent avec état `Enregistrement…`, succès persistant bref et restauration en cas d'échec.

## Fonctionnalité auditée : drag & drop et transitions de statut

### Efficacité mesurée

| Parcours | Interactions minimales observées | Résultat |
|---|---:|---|
| Changer le statut depuis le détail | 1 sélection | Fonctionnel ; stabilisation locale mesurée entre 178 et 267 ms |
| Déplacer au clavier vers la colonne suivante | `Espace`, deux flèches, `Espace` | Persiste correctement, mais les annonces ne permettent pas de comprendre la destination |
| Annuler un drag clavier | `Échap` | Annonce l'annulation, mais peut laisser un déplacement fantôme |
| Déplacer horizontalement à la souris | saisir + glisser + relâcher | Geste direct, mais destination non fiable dès que l'auto-scroll s'active |
| Changer le statut à 390 px depuis le détail | ouverture + 1 sélection | Contrôle pleine largeur (333 px) dans un dialogue 390 × 844, utilisable |

### Points solides

- La poignée est un vrai bouton focusable, avec `aria-label`, `aria-roledescription=sortable` et instructions clavier.
- Le sélecteur de statut expose `aria-busy`, se désactive pendant la mutation et empêche les changements concurrents.
- Un échec réseau restaure la valeur et affiche `Déplacement impossible.` ou `Mise à jour impossible.`.
- Le lecteur ne voit aucune poignée ni action de création : les permissions sont cohérentes avec une surface read-only.
- Le board reste dans un scroller dédié à 390 px ; il ne recrée pas le débordement global corrigé lors de la remédiation.

### Défauts UX

- La manipulation directe est mensongère quand le board défile : la cible se déplace sous le pointeur et une autre colonne est persistée.
- La poignée visible ne mesure que 24 × 24 px ; son curseur `grab` aide à la souris, mais aucun tooltip n'apparaît après une seconde de survol.
- À 390 px, la première colonne tient dans le viewport et la suivante n'est visible que sur environ 66 px. Le drag dépend donc fortement de l'auto-scroll, précisément défectueux.
- Les annonces vocales sont en anglais et composées d'UUID ; le clavier est présent techniquement mais non compréhensible.
- Les flèches naviguent entre cartes/zones de dépôt sans annoncer de noms. Deux pressions droites peuvent être nécessaires pour changer d'une seule colonne ; `droite + bas` a projeté la carte jusqu'à `Terminé`.
- Aucune action `Annuler` après persistance, aucun historique de transition exploitable et aucune limite WIP.

### Permissions observées

- Administrateur : poignée, drag, création par colonne et sélecteur de statut disponibles.
- Lecteur réel `Audit DnD Lecteur` : 0 poignée `Déplacer`, 0 `Nouvel item`, 0 `Créer dans…`; lecture des cartes conservée.
- Le contexte lecteur n'a produit aucune erreur console ni réponse HTTP en échec.

### Recommandations UX prioritaires — transitions

1. Corriger la stabilité de destination avant toute optimisation visuelle ; afficher en permanence `Déplacer vers : <statut>` pendant le geste.
2. Sur mobile, proposer un menu de statut sur la carte et considérer le drag comme raccourci secondaire.
3. Ajouter un undo après succès, avec annonce accessible et durée suffisante.
4. Localiser la région live et annoncer clé, titre, colonne, position, annulation et erreur.
5. Agrandir la zone interactive à 44 px et ajouter un tooltip, sans augmenter la densité visuelle.
6. Ajouter limites WIP, règles de transition et raison de blocage directement dans la colonne cible.

## Workflow et colonnes — constat initial du 5 août 2026

- **Découvrabilité : échec total.** Aucun bouton, menu contextuel, affordance en
  fin de board ou lien d'administration ne permet d'ajouter une colonne.
- Les boutons `+` des en-têtes signifient uniquement `Créer dans <statut>` ;
  leur répétition peut faire croire que le board est configurable alors qu'ils
  ne modifient jamais sa structure.
- L'administration annonce seulement « backlogs, utilisateurs et rôles » et le
  formulaire `Modifier le backlog` ne contient que clé, nom et couleur.
- Coût actuel pour une équipe dont le flux diffère : capacité impossible, pas
  simplement trop de clics.
- Cible UX : action explicite `Colonnes` sur le board, ajout en deux clics
  maximum, ordre modifiable au clavier, erreurs de suppression liées à la ligne
  concernée et aperçu clair du nombre d'items à migrer.

## Workflow et colonnes — après remédiation du 5 août 2026

- L'action `Colonnes` est visible dans la barre primaire du board : le défaut de
  découvrabilité bloquant est corrigé sur desktop.
- Le gestionnaire rend visibles nom, catégorie et nombre d'items ; une
  suppression occupée explique l'impact et bloque la confirmation tant qu'aucune
  destination n'est choisie.
- Les derniers statuts initial et terminé sont désactivés avec une explication,
  ce qui évite une erreur tardive après saisie.
- Un doublon conserve le formulaire et affiche `Un statut portant ce nom existe
  déjà.` au lieu de fermer silencieusement.
- Le statut mobile est désormais modifiable depuis la carte en deux gestes ; le
  drag n'est plus l'unique voie de transition rapide à 390 px.
- Dette restante : réordonner par flèches devient laborieux au-delà de 6 à 8
  colonnes ; aucun undo, aperçu global, archivage ou mode brouillon ; poignée
  DnD toujours 24 px sans tooltip ; gestionnaire non réaudité sur mobile.

## Backlog produit et triage — incrément 05 du 5 août 2026

### Ce qui fonctionne

- Passer de Board à Liste ou Arbre prend un clic et conserve le contexte du
  backlog.
- Le tri par titre et le groupement par priorité sont explicites et persistés
  dans l'URL.
- Statut, priorité et assigné sont éditables directement dans la Liste.
- La priorité de `CASS-58` a été changée puis restaurée en deux gestes par
  mutation, avec feedback visible et confirmation serveur en ~110 ms.
- L'Arbre rend la hiérarchie compacte et refuse un parent incompatible avec un
  message compréhensible.

### Défauts UX et coût utilisateur

- La vue s'appelle `Liste` et le menu `Tous les items`, ce qui est honnête :
  aucun point d'entrée ne promet un vrai backlog. Le défaut est produit avant
  d'être cosmétique.
- Les tris automatiques donnent une impression de priorisation, mais aucun
  ordre métier stable n'est modifiable. Pour départager deux items de même
  priorité, le nombre d'interactions utiles est **infini : tâche impossible**.
- 11 lignes sont affichées sans aucune checkbox. Modifier cinq priorités exige
  au minimum dix gestes et cinq mutations séparées, contre une sélection et une
  action groupée chez les concurrents.
- L'Arbre et la Liste emploient des interactions différentes sans explication :
  dans l'Arbre, déposer sur une ligne signifie « devenir enfant », pas « placer
  avant/après ». Le message d'erreur explique l'invalidité du parent, mais pas
  la sémantique du geste avant son exécution.
- Estimation, cycle/sprint et release sont absents à la fois de la création, du
  détail, de la liste et de l'administration. Ils ne sont donc ni difficiles à
  découvrir ni cachés : ils ne sont pas observables.

### Recommandations UX prioritaires

1. Créer une vue `Backlog` dédiée, séparée du board d'exécution, avec rang
   manuel par défaut et ligne d'insertion visible.
2. Afficher des checkboxes au survol et au focus, `Shift` pour une plage,
   `Cmd/Ctrl+A` sur le résultat filtré et une barre d'actions groupées.
3. Ajouter estimation, cycle et release comme colonnes configurables et
   propriétés rapides, sans alourdir systématiquement le composeur.
4. Conserver `Arbre` pour le parentage, avec indicateur explicite « Déplacer
   sous… » ; utiliser une poignée/zone distincte si le réordonnancement de
   frères est ajouté.
5. Rendre visibles capacité, somme des estimations et items non estimés avant
   le démarrage d'un cycle.

## Backlog classé — incrément 06 du 5 août 2026

### Résultat observé

- L’onglet `Backlog` est explicite et accessible en un clic depuis le même
  contexte que Board/Liste/Arbre.
- Les tâches terminées et les éléments structurels sont exclus ; quatre tâches
  planifiables sont observées sur `CASS`.
- Chaque ligne expose clé, titre, statut, priorité, points et assigné, avec un
  total de points et un compteur d’items non estimés.
- Une poignée nommée `Déplacer <clé>` permet `Espace`, flèches, `Espace` et
  annonce la position en français. L’ordre est conservé après reload.
- Quand un tri ou groupement est actif, les poignées disparaissent et une
  explication indique comment retrouver l’ordre manuel.

### Mesures et dette restante

Le POST de classement est observé à **141 ms** ; après rechargement,
`DOMContentLoaded` est à **176 ms** et `load` à **318 ms** en développement.
Console, réseau et HTTP sont propres. Le parcours clavier est validé dans
Chromium ; le pointeur/souris, le rollback réseau, le rôle lecteur réel et une
liste volumineuse restent à rejouer dans cette fonctionnalité. Surtout, aucune
checkbox ni barre bulk n’est encore visible : le coût de triage par lot reste
celui constaté dans l’incrément 05.

## Backlog sélectionnable et bulk — incrément 06 final du 5 août 2026

### Résultat observé

- Les checkboxes sont visibles en permanence sur desktop. Cette décision est
  plus découvrable qu’un contrôle exclusivement au survol et évite de confondre
  la sélection avec l’icône bleue du type Tâche.
- Un clic sélectionne sans ouvrir le détail ; `Shift` crée une plage continue
  depuis l’ancre stable. La checkbox d’en-tête expose visuellement et
  sémantiquement l’état indéterminé.
- `Ctrl/Cmd+A` fonctionne quand une ligne a le focus, mais ne capture pas le
  raccourci dans un bouton, input, select, lien ou zone éditable. `Échap` vide
  la sélection.
- La barre sticky nomme le nombre sélectionné et rend statut, priorité, assigné
  et estimation immédiatement disponibles. Une sélection de deux lignes puis
  quatre modifications demande 2 gestes de sélection et 2 gestes par champ,
  au lieu de huit éditions de ligne indépendantes.
- L’échec réseau bulk conserve la sélection et le message est actionnable ;
  l’utilisateur peut réessayer sans reconstruire sa plage.
- La sélection Liste ne fuit pas vers Backlog et les items retirés par un
  filtre ne restent pas sélectionnés en mémoire.
- Le menu d’estimation restait ouvert après succès (`BUG-JIR-018`) ; il se ferme
  désormais après confirmation, mais reste ouvert en erreur.

### Mesures et dette restante

Les quatre mutations bulk ont répondu en **141 à 256 ms** en développement.
Le parcours nominal ne produit aucune erreur console, réseau ou HTTP. Deux
`net::ERR_FAILED` sont exclusivement les interruptions Playwright injectées et
provoquent les rollbacks attendus.

Dette UX restante : la barre devient dense sous 1 000 px et n’a pas encore été
réauditée en responsive ; aucun undo après succès ; pas de sélection des 500
items d’un résultat paginé/virtualisé ; aucune commande bulk sprint/release ;
la proximité visuelle entre l’icône bleue Tâche et une checkbox cochée mérite
une vérification utilisateur, même si la vraie sélection est maintenant dans
une colonne dédiée.

## Planification par sprint — incrément 08 du 5 août 2026

### Résultat observé

- La vue Backlog sépare clairement sprint actif, sprints planifiés et backlog,
  avec compteurs d'items, points, non estimés et capacité.
- Une plage sélectionnée est affectée à un sprint en une action bulk ; l'ordre
  et la section persistent après rechargement.
- Les sections sont compactes et repliables. Le défaut où une nouvelle section
  paraissait ouverte tout en masquant son contenu (`BUG-JIR-019`) est corrigé.
- Le démarrage affiche objectif, dates et capacité, puis mène au Board qui ne
  contient que le sprint actif. Sans sprint actif, le Board explique l'état au
  lieu d'exposer le backlog comme travail engagé.
- La clôture quantifie terminé/incomplet et exige une destination. Le report
  vers un sprint planifié est visible immédiatement et reste historisé.
- Un rejet réseau conserve le dialogue et les valeurs avec un message français
  (`BUG-JIR-020`). Le lecteur voit les informations mais aucun contrôle.

### Dette UX et écart Jira

- Le drag direct Backlog → sprint est disponible et persistant. Sa collision
  vers une section vide a dû être rendue prioritaire après un résultat
  intermittent ; le sens inverse, les sections remplies et le clavier restent
  à compléter dans Chromium.
- Une tâche créée dans un sprint exige encore un Epic parent. Cette contrainte
  n'existe pas pour une tâche standard Jira et alourdit artificiellement la
  capture : le bouton reste désactivé sans explication centrale tant que le
  parent manque.
- La capacité et son dépassement sont recalculés immédiatement et prouvés dans
  Chromium ; aucune recommandation n'est encore fondée sur la vélocité passée.
- Le sprint actif accepte des changements, mais l'interface ne signale pas
  encore clairement qu'ils modifient le scope engagé.
- Aucun rapport ne permet d'expliquer engagement, terminé, ajouté, retiré ou
  reporté. L'historique existe dans les données, pas dans l'expérience.
- Releases/versions absentes : `Terminé` reste le dernier horizon visible alors
  qu'il ne prouve ni publication ni livraison.

### Recommandations prioritaires

1. Compléter le drag entre toutes les sections et sa voie clavier, puis rendre
   les changements du sprint actif explicitement marqués `Ajouté après
   démarrage`.
2. Autoriser une tâche sans Epic, tout en conservant le parentage comme option
   rapide et filtrable.
3. Construire le rapport de sprint depuis les événements : chaque métrique doit
   ouvrir les items exacts qui la composent.
4. Afficher vélocité et capacité ensemble pour éclairer l'engagement, jamais
   comme une cible de performance individuelle.
5. Ajouter les versions dans la même surface de planification et une page
   release centrée sur la readiness réelle.

## Administration des permissions — incrément 09 du 6 août 2026

### Résultat observé

- Le mode Simple reste centré sur des personnes/groupes et trois rôles protégés ;
  le mode Avancé rend visibles schéma, rôles personnalisés et grants détaillés.
- L’Assistant de permissions répond par utilisateur, backlog et permission, puis
  distingue clairement droit direct, héritage de groupe et rôle de projet.
- Un même schéma peut servir CASS et LABS sans rendre globale l’occupation d’un
  rôle : le membre sans rôle direct/protégé reçoit la capacité exclusivement via
  le groupe et le rôle personnalisé de CASS, puis reste refusé dans LABS.
- L’ajout puis le retrait de `browse_backlog` depuis la matrice UI ajoutent puis
  retirent CASS de toutes les surfaces de découverte. Après retrait, le bouton
  s’appelle exactement `Notifications`, le panneau est vide et l’URL directe
  explique le refus sans dévoiler le backlog.
- Le conflit de deux éditeurs est explicite et récupérable par rechargement ; le
  premier enregistrement n’est ni écrasé ni masqué.
- La page Accès expose désormais un seul landmark `main`. Les contrôles de
  membres d’un groupe privilégié sont absents pour un simple gestionnaire.

### Mesures et dette restante

Les mutations UI observées répondent en **21 à 339 ms** ; les explications de
permission en **75 à 205 ms** ; navigations et rechargements en **248 à
1 040 ms** sur le serveur local isolé. Les dix scénarios sont propres côté
console/réseau/HTTP ; leurs durées individuelles et la durée totale sont
conservées dans le rapport JUnit immuable du run. Le rejeu round 3 confirme la
matrice **10/10 en 25,4 s** et l’ensemble Chromium **24/24 en 59,8 s**. Les 20
captures probantes, toutes préfixées par leur run ID, ont été inspectées sans
écran vide, erreur ou troncature ; les 187 preuves historiques sont restées
byte-for-byte identiques sans restauration.

L’administration reste dense et desktop-first. La source exacte d’un droit est
lisible, mais l’historique append-only n’a pas encore de timeline UI filtrable.
Il faut encore tester zoom 200 %, 390/768/1024/1440 px, VoiceOver/NVDA, listes
volumineuses et navigation clavier complète dans les matrices de grants. Enfin,
`manage_releases` n’affiche correctement aucun contrôle aujourd’hui parce que
la fonctionnalité Releases n’existe pas ; son premier consommateur devra éviter
de dupliquer les sélecteurs complexes de l’écran d’administration.

### Recommandations prioritaires

1. Ajouter une vue « Historique de sécurité » filtrable et liée depuis chaque
   schéma/groupe/rôle, avec détail de corrélation sans exposer de donnée sensible.
2. Réduire la densité du mode Avancé par sections progressives et résumé des
   différences par rapport au schéma par défaut.
3. Rejouer toute l’administration au clavier et aux quatre breakpoints avant
   d’ajouter Releases ; réutiliser l’Assistant dans les écrans métier refusés.

---

## Mise à jour UX — découverte Releases du 7 août 2026

La fonctionnalité n’est pas seulement difficile à découvrir : elle est absente.
Le parcours demande donc un nombre de clics et un temps **infinis** pour créer
une version ou y affecter un item. Aucun état vide ne guide vers une première
Release, aucun lien de navigation n’existe et la permission dédiée n’explique
pas où exercer le droit accordé.

Le Backlog est l’emplacement naturel de planification, mais sa table s’arrête à
Points et Assigné. La barre bulk propose Statut, Priorité, Assigné, Sprint et
Estimation, sans Version. Le détail expose Sprint et Échéance, mais pas
`Fix versions`; la création ne permet pas non plus de planifier une version.

### Dette UX à traiter dans le design

1. Ajouter « Releases » dans la navigation du backlog avec un état vide utile.
2. Réutiliser un même sélecteur multivalué de Versions dans création, détail et
   bulk, sans fabriquer trois interactions différentes.
3. Montrer la progression et les items incomplets avant l’action Publier ; ne
   jamais assimiler silencieusement statut `Done` et livraison effective.
4. Rendre les versions filtrables depuis Backlog/Board et conserver le filtre
   dans l’URL et les vues enregistrées.

---

## Mise à jour UX — Releases core livré le 7 août 2026

Les quatre dettes de découverte ci-dessus sont fermées sur desktop. `Releases`
est un onglet du backlog ; l’état vide conduit à `Créer une version` ; le même
vocabulaire `Fix versions` apparaît dans création, détail, bulk et tableaux ;
la progression expose ses catégories et ouvre les items sources ; le filtre
Version reste dans l’URL et les vues enregistrées.

### Parcours prouvés

- création puis modification d’une version depuis la page dédiée ;
- affectation de deux versions à la création et depuis le détail ;
- ajout, remplacement et retrait en masse ;
- filtre conservé après reload et réutilisé sur les quatre vues ;
- publication avec incomplets conservés ou déplacés, puis dépublication ;
- version archivée absente des candidats mais affectation courante lisible ;
- éditeur capable d’affecter sans voir le cycle de vie ; spécialiste
  `manage_releases` capable de créer/publier ; lecteur sans mutation.

### Qualités observées

- les dialogues restent ouverts après erreur et restaurent l’état ;
- le conflit stale est explicite entre deux contextes ;
- les drilldowns utilisent le contexte complet de l’item même sous filtre ;
- le tableau legacy affiche désormais `Fix versions` sans casser la sélection,
  le drag, les sections sprint ou le reload ;
- aucun parcours nominal ne produit d’erreur console, réseau ou HTTP.

### Dette UX restante

1. Fusion/suppression : montrer l’impact et imposer un choix transfert/retrait.
2. Notes : distinguer snapshot publié, brouillon édité et export final.
3. Readiness : rendre visibles PR, checks et déploiement sans surcharger la page.
4. Responsive/accessibilité : rejouer 390/768/1024/1440, zoom 200 %,
   VoiceOver/NVDA et listes volumineuses.

Le noyau est cohérent mais ne revendique pas encore une expérience Jira
complète : l’ordre, la fusion, les notes et le travail connexe appartiennent à
la PR2, tandis que les rapports de sprint restent un chantier séparé.
