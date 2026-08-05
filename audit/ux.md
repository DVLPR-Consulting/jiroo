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
