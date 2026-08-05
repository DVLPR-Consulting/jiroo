# Bugs Jiroo

## BUG-JIR-001 — Le raccourci `C` injecte `c` dans le titre

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** création d'item

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS` avec un rôle admin ou contributeur.
2. S'assurer qu'aucun champ de saisie ni dialogue n'a le focus.
3. Appuyer sur la touche `C`.

### Résultat obtenu

Le dialogue `Nouvel item` s'ouvre, le champ Titre reçoit le focus et contient déjà `c`.

### Résultat attendu

Le dialogue s'ouvre avec un titre vide et le caractère du raccourci est consommé.

### Impacts

- **Utilisateur :** correction manuelle obligatoire à chaque création clavier ; risque de titres commençant par `c` non détectés.
- **Métier :** dégrade le principal levier de vitesse face à Linear/Jira et pollue la qualité des données.

### Preuve

- [Capture Playwright](screenshots/BUG-JIR-001-create-shortcut-injects-c.png)
- Aucune erreur console ou HTTP associée.

### Cause probable

Le handler `keydown` appelle `setOpen(true)` sans `event.preventDefault()`. L'ouverture et l'autofocus du champ surviennent avant que l'action de frappe ne soit totalement consommée. Le test unitaire vérifie l'ouverture et les garde-fous, mais pas la valeur du champ dans un navigateur réel.

### Correction proposée

Appeler `event.preventDefault()` immédiatement avant `setOpen(true)`, puis ajouter un test Playwright qui appuie sur `C` et exige `Titre === ""`.

### Critères de vérification

- `C` ouvre le dialogue avec un titre vide.
- `C` dans input/textarea/select/contenteditable ne déclenche rien.
- les modificateurs et les dialogues déjà ouverts restent protégés.

## BUG-JIR-002 — La limite de 200 caractères produit une erreur générique

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** création d'item

### Étapes de reproduction

1. Ouvrir `Nouvel item`.
2. Saisir un titre de 1 000 caractères.
3. Observer que le champ reste valide et que `Créer` est actif.
4. Cliquer sur `Créer`.

### Résultat obtenu

Le client accepte 1 000 caractères (`maxLength = -1`, `checkValidity() = true`). Le serveur répond via une Server Action HTTP 200 avec `{ ok: false, error: "Création impossible." }`. Le formulaire affiche uniquement `Création impossible.`.

### Résultat attendu

La limite de 200 caractères doit être visible et empêchée côté client ; le serveur doit retourner et l'UI afficher `Titre trop long (200 max).` au niveau du champ.

### Impacts

- **Utilisateur :** impossible de comprendre comment corriger ; essais successifs aléatoires.
- **Métier :** abandon de création, charge support et validation incohérente entre couches.

### Preuves

- [Capture Playwright](screenshots/BUG-JIR-002-create-title-validation-generic-error.png)
- [Corps de requête](network/BUG-JIR-002-create-title-1000-request.txt)
- [Corps de réponse](network/BUG-JIR-002-create-title-1000-response.txt)

### Cause probable

Le schéma service limite bien `title` à 200 caractères, mais l'input n'a ni `maxLength` ni compteur. `mapCreateError` ne mappe pas les erreurs Zod et retombe sur `Création impossible.`.

### Correction proposée

Partager la constante `ITEM_TITLE_MAX = 200`, ajouter `maxLength`, compteur et `aria-describedby`, puis sérialiser les erreurs de validation structurées par champ depuis la Server Action.

### Critères de vérification

- le 201e caractère est refusé ou déclenche immédiatement une erreur claire ;
- le champ fautif reçoit `aria-invalid=true` et le focus à la soumission ;
- une requête forgée côté client reçoit la même erreur précise côté serveur.

## BUG-JIR-003 — Action de création hors écran sur mobile

- **Gravité :** bloquante sur mobile
- **Priorité :** P0
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** création d'item / shell responsive

### Étapes de reproduction

1. Ouvrir `/b/CASS` dans un viewport de 390 × 844.
2. Observer le board avec la sidebar ouverte.
3. Replier la sidebar et observer à nouveau la toolbar.

### Résultat obtenu

- Sidebar ouverte : 248 px sont réservés, le contenu ne dispose que de 142 px ; `Nouvel item` se situe autour de x = 914.
- Sidebar repliée : le contenu dispose de 326 px, mais `Nouvel item` reste autour de x = 730.
- Plusieurs actions du header et colonnes sont également hors viewport.

Le dialogue lui-même est adapté à 390 px lorsqu'il est ouvert par le raccourci, mais son point d'entrée visuel est inaccessible.

### Résultat attendu

À 390 px, la sidebar doit devenir un drawer/overlay fermé par défaut et la création doit rester visible, idéalement via une action primaire fixe. Aucun contrôle critique ne doit nécessiter un défilement horizontal de la page.

### Impacts

- **Utilisateur :** création pratiquement impossible sans connaître le raccourci ; orientation perdue et contrôles invisibles.
- **Métier :** exclusion des usages mobiles/tablettes et perception de produit non fini.

### Preuve

- [Capture Playwright](screenshots/BUG-JIR-003-mobile-create-action-offscreen.png)

### Cause probable

Le shell conserve des largeurs desktop fixes pour la sidebar et la toolbar. Les groupes d'actions ne se replient pas et n'ont pas de variante mobile.

### Correction proposée

Introduire des breakpoints de layout : sidebar en drawer sous 768 px, toolbar en deux niveaux ou menu overflow, board horizontal contenu dans sa zone, et bouton flottant `Nouvel item` accessible au pouce.

### Critères de vérification

- 320, 390, 768 et 1024 px sans débordement de page ;
- création accessible en un geste à chaque largeur ;
- aucun contrôle interactif hors viewport ;
- test Playwright sur `scrollWidth <= clientWidth` pour le shell, hors scroller explicite du board.

## BUG-JIR-005 — Une description trop longue est rejetée avec une erreur générique

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** panneau de détail / édition de description

### Étapes de reproduction

1. Ouvrir `CASS-57` avec un rôle admin ou contributeur.
2. Dans l'onglet `Détail`, cliquer sur `Éditer` sous la description.
3. Saisir 20 001 caractères.
4. Cliquer sur `Enregistrer`.

### Résultat obtenu

Le textarea n'expose aucune limite (`maxLength = -1`) ni compteur. La Server Action répond en HTTP 200 avec `{ ok: false, error: "Mise à jour impossible." }`; l'éditeur reste ouvert et affiche uniquement ce message générique.

### Résultat attendu

La limite de 20 000 caractères doit être annoncée et contrôlée avant envoi. Si une requête forgée dépasse la limite, l'erreur serveur doit identifier précisément `Description trop longue (20 000 caractères max).` et être associée au champ.

### Impacts

- **Utilisateur :** aucune indication sur la correction attendue ; risque de perte de temps sur une longue spécification.
- **Métier :** abandon de rédaction, charge support et perception d'un produit peu fiable sur les tickets complexes.

### Preuves

- [Capture Playwright](screenshots/BUG-JIR-005-description-length-generic-error.png)
- [Corps de requête](network/BUG-JIR-005-description-20001-request.txt)
- [Corps de réponse](network/BUG-JIR-005-description-20001-response.txt)

### Cause probable

Le schéma `lib/validation/item.ts` limite la description à 20 000 caractères, mais `description-editor.tsx` ne partage ni cette constante ni une validation UI. `updateItemAction` remplace les erreurs non liées au statut ou aux labels par `Mise à jour impossible.`.

### Correction proposée

Partager `ITEM_DESCRIPTION_MAX`, ajouter compteur, `maxLength`, `aria-describedby` et erreur structurée par champ. Conserver la validation serveur comme autorité.

### Critères de vérification

- limite et compteur visibles avant soumission ;
- erreur précise et focus sur la description ;
- requête forgée rejetée avec le même code/message métier ;
- texte valide de 20 000 caractères enregistré avec succès.

## BUG-JIR-006 — Le panneau de détail devient illisible sur mobile

- **Gravité :** majeure
- **Priorité :** P0 mobile
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** panneau de détail / responsive

### Étapes de reproduction

1. Ouvrir `/b/CASS?item=CASS-57`.
2. Régler le viewport Chromium à 390 × 844.
3. Ouvrir les onglets `Détail` puis `Commentaires`.

### Résultat obtenu

Le panneau occupe 359 px, mais conserve une grille fixe `1fr + 220px`. Après paddings, la colonne principale ne mesure qu'environ 98 px : le titre se répartit sur de nombreuses lignes et description, onglets et commentaires sont écrasés. Le shell sous-jacent reste lui aussi large et tronqué.

### Résultat attendu

Sous un breakpoint mobile, le panneau doit devenir plein écran et monocolonne, avec propriétés repliables ou placées sous le contenu principal. Chaque zone de lecture/édition doit conserver une largeur utile.

### Impacts

- **Utilisateur :** lecture et édition très pénibles, risque d'erreurs de saisie, navigation sans repères.
- **Métier :** usages terrain/mobile exclus ; qualité perçue fortement dégradée.

### Preuve

- [Capture Playwright](screenshots/BUG-JIR-006-detail-panel-mobile-cramped.png)

### Cause probable

Le conteneur applique `w-[620px] max-w-[92vw]`, mais son contenu conserve `grid-cols-[1fr_220px]` sans breakpoint responsive.

### Correction proposée

Passer à une colonne sous 640/768 px, utiliser `w-screen max-w-none`, rendre les propriétés repliables et tester les contenus longs.

### Critères de vérification

- colonne principale ≥ 320 px à 390 px de viewport ;
- aucune information ou action hors viewport ;
- édition du titre et de la description réalisable sans zoom ni défilement horizontal ;
- tests Playwright à 320, 390, 768 et 1024 px.

## BUG-JIR-007 — Les actions de suppression de liens sont inaccessibles au clavier

- **Gravité :** majeure (accessibilité)
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** relations et liens de développement

### Étapes de reproduction

1. Ajouter une relation d'item et une URL GitHub à `CASS-57`.
2. Sans utiliser la souris, placer le focus sur le lien de relation.
3. Appuyer sur `Tab`.

### Résultat obtenu

Le focus passe directement au sélecteur `Type de relation`. Les boutons `Supprimer le lien…` ont `display: none` tant que le groupe n'est pas survolé ; ils n'apparaissent pas dans l'arbre d'accessibilité et ne peuvent pas recevoir le focus. Le même défaut touche les liens GitHub.

### Résultat attendu

Toute action réalisable à la souris doit être atteignable, identifiable et activable au clavier. Les actions peuvent être visuellement discrètes, mais doivent apparaître au focus du groupe (`focus-within`) et rester dans l'ordre de tabulation.

### Impacts

- **Utilisateur :** une personne utilisant le clavier ou une technologie d'assistance ne peut pas retirer une relation ou une référence erronée.
- **Métier :** non-conformité au principe WCAG 2.1.1 Clavier et données impossibles à corriger pour une partie des utilisateurs.

### Preuve

- [Capture Playwright après survol](screenshots/BUG-JIR-007-hover-only-remove-actions.png)
- Observation Playwright : après focus sur `CASS-58`, `Tab` cible `Type de relation`, pas `Supprimer le lien vers CASS-58`.

### Cause probable

Les deux composants utilisent `hidden ... group-hover:flex` sans équivalent `group-focus-within:flex` ni menu d'actions toujours focusable.

### Correction proposée

Utiliser `invisible/opacity-0` plutôt que `display:none` pour préserver l'accès au focus, afficher avec `group-focus-within`, ou proposer un menu `…` explicitement focusable sur chaque ligne.

### Critères de vérification

- la tabulation atteint les actions de retrait ;
- un focus visible les révèle ;
- `Entrée` et `Espace` exécutent l'action avec confirmation/annulation appropriée ;
- le nom accessible reste contextualisé.

## BUG-JIR-008 — Le renommage du titre est utilisable uniquement à la souris

- **Gravité :** majeure (accessibilité et découvrabilité)
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** renommage d'un item

### Étapes de reproduction

1. Ouvrir `CASS-57` avec un rôle admin.
2. Chercher une action `Modifier/Renommer` dans le panneau et le menu `Actions`.
3. Parcourir les contrôles au clavier avec `Tab`.
4. Survoler puis cliquer le titre avec la souris.

### Résultat obtenu

Le renommage existe, mais est attaché à un `<h2>` avec `tabIndex = -1`, sans rôle bouton et sans contrôle visible. Seuls le curseur texte, un fond au survol et l'attribut `title="Cliquer pour renommer"` donnent un indice à la souris. Le menu `Actions` ne propose que la suppression. Un clic transforme bien le titre en champ texte.

### Résultat attendu

Le titre éditable doit être focusable et annoncer son action, avec un affordance visible ou un bouton `Renommer`. `Entrée`/`Espace` doivent activer l'édition, `Échap` annuler et l'aide ne doit pas dépendre d'un tooltip de survol.

### Impacts

- **Utilisateur :** fonctionnalité difficile à découvrir et inaccessible au clavier ; risque de croire le titre immuable.
- **Métier :** tickets mal nommés et support inutile pour une action de base.

### Preuve

- [Capture Playwright au survol](screenshots/BUG-JIR-008-title-edit-mouse-only.png)
- Observation Playwright : `tag=H2`, `role=null`, `tabIndex=-1`, `title=Cliquer pour renommer`.

### Cause probable

`editable-title.tsx` applique directement `onClick={start}` au heading sans sémantique interactive ni gestion clavier dans l'état lecture.

### Correction proposée

Rendre le titre via un bouton de style heading, ou ajouter un bouton crayon toujours visible au focus/survol, avec libellé `Renommer CASS-57` et gestion clavier complète.

### Critères de vérification

- action visible sans survol exclusif ;
- atteignable dans l'ordre de tabulation ;
- activation `Entrée`/`Espace`, annulation `Échap` ;
- lecteur conserve un heading non interactif.

## BUG-JIR-009 — Le panneau de détail ne se ferme pas avec `Échap` et ne gère pas le focus

- **Gravité :** moyenne à majeure (accessibilité)
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 4 août 2026
- **Fonctionnalité :** panneau de détail / navigation clavier

### Étapes de reproduction

1. Ouvrir `CASS-57`.
2. Terminer ou annuler toute édition en cours.
3. Appuyer sur `Échap`.

### Résultat obtenu

Le panneau reste ouvert et l'URL conserve `?item=CASS-57`. Le panneau est rendu comme un `aside` sans nom accessible ni sémantique de dialogue ; aucun focus initial ni piège de focus n'a été observé. Le clic sur `Fermer` fonctionne et retire correctement le paramètre d'URL.

### Résultat attendu

Un panneau superposé avec backdrop doit fermer sur `Échap`, annoncer son contexte, déplacer le focus à l'ouverture puis le restituer au déclencheur à la fermeture. Le choix modal/non modal doit être cohérent avec l'interception des clics sur le fond.

### Impacts

- **Utilisateur :** sortie clavier non standard, navigation plus lente et confusion pour les lecteurs d'écran.
- **Métier :** dette d'accessibilité sur la surface la plus utilisée du produit.

### Preuve

- [Capture Playwright après pression sur Échap](screenshots/BUG-JIR-009-escape-does-not-close-detail-panel.png)

### Cause probable

`item-detail-panel.tsx` implémente un backdrop et un `<aside>` maison, sans handler `keydown`, primitive Dialog/Sheet, `aria-labelledby` ni gestion du focus.

### Correction proposée

Utiliser une primitive Sheet/Dialog accessible ou implémenter explicitement `Escape`, focus initial, restauration du focus, nom accessible et comportement modal documenté.

### Critères de vérification

- `Échap` ferme et retire `item` de l'URL ;
- focus initial dans le panneau et retour au déclencheur ;
- lecteur d'écran annonce type et titre du panneau ;
- aucun focus ne reste derrière le backdrop si le panneau est modal.

## BUG-JIR-010 — `Échap` annule le drag clavier mais laisse la carte dans une autre colonne

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** board / drag & drop clavier

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS` avec un rôle administrateur.
2. Donner le focus à `Déplacer CASS-58`.
3. Appuyer sur `Espace`, puis trois fois sur `Flèche droite`.
4. Appuyer sur `Échap` pour annuler.

### Résultat obtenu

La région live annonce que le déplacement est annulé, aucune requête `POST` n'est envoyée, mais `CASS-58` apparaît dans `En revue`. Un rechargement replace la carte dans `À faire`, ce qui prouve que l'état affiché était un déplacement fantôme non persisté.

### Résultat attendu

`Échap` doit restaurer immédiatement et exactement la colonne et la position d'origine, sans mutation serveur ni divergence visuelle.

### Impacts

- **Utilisateur :** le board affiche un état faux jusqu'au prochain rafraîchissement ; l'utilisateur ne sait plus si l'annulation a fonctionné.
- **Métier :** perte de confiance dans le board et risque de décisions prises sur un statut qui n'existe pas en base.

### Preuve

- [Capture Playwright après annulation](screenshots/BUG-JIR-010-dnd-clavier-echap-deplacement-fantome.png)
- Observation Playwright : `avant=À faire`, `après Échap=En revue`, `POST=0`, puis `après reload=À faire`.

### Cause probable

La projection locale utilisée pendant le drag réordonne ou re-parente déjà la carte. Le handler d'annulation arrête le capteur et annonce l'annulation, mais ne restaure pas le snapshot d'origine du board.

### Correction proposée

Conserver `{statusId, beforeId, afterId}` au démarrage du drag et restaurer ce snapshot sur `onDragCancel`. Aucun état canonique ne doit être dérivé de la position de l'overlay après annulation.

### Critères de vérification

- `Échap` restaure colonne et ordre à l'identique ;
- aucune requête de mutation n'est envoyée ;
- aucune carte dupliquée ou déplacée ne subsiste ;
- résultat identique avec clavier, souris et tactile après annulation.

### Vérification du correctif

Playwright a repris `CASS-58` dans `À faire`, déclenché le drag clavier, déplacé
la projection puis envoyé `Échap`. La région live a annoncé
`Déplacement de CASS-58 … annulé. Position d’origine restaurée.` ; la carte est
restée dans `À faire` immédiatement puis après rechargement. Aucun `POST` de
mutation n'a été émis. La restauration tactile native reste hors de ce verdict.

## BUG-JIR-011 — L'auto-défilement horizontal enregistre une colonne différente de celle visée

- **Gravité :** critique
- **Priorité :** P0
- **Statut :** corrigé, non-régression partielle vérifiée le 5 août 2026
- **Fonctionnalité :** board / drag & drop horizontal

### Étapes de reproduction — desktop

1. Ouvrir le board à 1200 × 943 avec `CASS-58` dans `À faire`.
2. Saisir sa poignée et déplacer le pointeur au centre de la zone vide `En revue`.
3. Relâcher.

### Étapes de reproduction — mobile

1. Ouvrir le board à 390 × 844, scroller horizontal à zéro.
2. Saisir `CASS-58` dans `À faire`.
3. Déplacer le pointeur vers la partie visible de `En cours`, autour de `x=350`.
4. Relâcher.

### Résultat obtenu

- Desktop : la cible calculée avant le geste était `En revue`, mais la carte est persistée dans `Terminé`.
- Mobile : le pointeur visait `En cours`, le scroller passe automatiquement de `0` à environ `224,5 px`, puis la carte est persistée dans `En revue`.
- Les requêtes répondent 200 : il ne s'agit pas d'un simple artefact visuel, la mauvaise valeur de statut est enregistrée.

### Résultat attendu

La colonne mise en évidence au moment du dépôt doit être la colonne persistée. L'auto-scroll ne doit jamais déplacer silencieusement une autre cible sous un pointeur immobile.

### Impacts

- **Utilisateur :** une tâche peut être déclarée en revue ou terminée sans intention ; le résultat paraît légitime et peut passer inaperçu.
- **Métier :** corruption sémantique du workflow, reporting faux, notifications/automatisations déclenchées sur le mauvais statut et risque d'incident opérationnel.

### Preuve

- [Capture desktop — cible En revue, résultat Terminé](screenshots/BUG-JIR-011-dnd-cible-en-revue-resultat-termine.png)
- [Capture mobile — cible En cours, résultat En revue](screenshots/BUG-JIR-011-mobile-dnd-en-cours-resultat-en-revue.png)
- [Requêtes observées](network/BUG-JIR-011-wrong-drop-destination.txt)

### Cause probable

Le capteur d'auto-scroll continue à faire défiler le conteneur pendant que le pointeur reste près du bord. La détection de collision est recalculée sur la nouvelle géométrie et valide la colonne désormais sous le pointeur, sans verrouillage ni feedback assez visible sur ce changement de cible.

### Correction proposée

Limiter l'auto-scroll à une zone de bord étroite avec accélération progressive, recalculer les coordonnées dans le repère du scroller et afficher un surlignage/label de destination impossible à confondre. Au dépôt, valider la destination annoncée lors de la dernière frame stable ; proposer une alternative `Changer le statut` sans drag sur mobile.

### Critères de vérification

- 50 dépôts Playwright consécutifs vers chaque colonne, à 390 et 1200 px, produisent exactement le statut visé ;
- le statut envoyé correspond au label de la cible visuellement active ;
- aucun changement de cible après immobilisation du pointeur sans feedback visible ;
- tests avec colonnes vides, remplies, partiellement visibles et scroll horizontal non nul.

### Vérification du correctif

La collision donne désormais priorité à la position réelle du pointeur et
l'auto-scroll utilise une zone plus étroite avec accélération réduite. Dans le
scénario Playwright rejoué à 1800 × 987, un dépôt souris de `CASS-58` depuis
`À faire` vers la zone vide `En revue` a positionné la carte sous `En revue` et
le rechargement a confirmé la même destination persistée. La matrice de 50
dépôts par colonne et le contexte tactile natif ne sont pas encore exécutés :
ce bug ne doit donc pas être considéré définitivement clos sous charge ou sur
tactile.

## BUG-JIR-012 — Les annonces du drag clavier exposent des UUID internes en anglais

- **Gravité :** majeure (accessibilité)
- **Priorité :** P1
- **Statut :** corrigé, validation lecteur d'écran réel restante
- **Fonctionnalité :** board / lecteur d'écran

### Étapes de reproduction

1. Donner le focus à `Déplacer CASS-58`.
2. Appuyer sur `Espace`, puis utiliser les flèches et déposer ou annuler.
3. Lire le contenu de la région `role=status`.

### Résultat obtenu

Les annonces ressemblent à `Draggable item ad1a… was moved over droppable area 7890…` et `Dragging was cancelled…`. Elles sont en anglais et identifient carte et destination avec des UUID internes. Le lecteur d'écran n'entend ni `CASS-58`, ni le titre, ni `En cours`/`En revue`.

### Résultat attendu

Des annonces métier en français, par exemple : `CASS-58, Audit — création clavier user story, déplacé vers En cours, position 2 sur 3` puis `Déplacement annulé, retour dans À faire`.

### Impacts

- **Utilisateur :** une personne utilisant un lecteur d'écran ne peut pas connaître la destination ni confirmer le résultat du geste.
- **Métier :** la fonctionnalité clavier existe techniquement mais n'est pas exploitable de façon autonome ; risque de non-conformité accessibilité.

### Preuve

- [Transcription de la région live](console/BUG-JIR-012-dnd-live-region.txt)
- La poignée expose pourtant une instruction clavier correcte via `aria-describedby`, ce qui confirme que le défaut se situe dans le feedback, pas dans l'absence totale de parcours clavier.

### Cause probable

Les annonces par défaut du moteur de drag & drop utilisent les identifiants techniques comme labels accessibles ; aucune fonction d'annonce localisée ne les remplace avec les clés et noms métier.

### Correction proposée

Fournir des annonces personnalisées et localisées pour prise, déplacement, dépôt et annulation. Utiliser la clé/titre de l'item, le nom de colonne et la position. Ajouter des tests de région live sans UUID ni chaîne anglaise.

### Critères de vérification

- toutes les annonces sont en français et sans UUID ;
- la carte, la colonne, la position et le résultat sont identifiables ;
- annulation et erreur réseau sont annoncées distinctement ;
- parcours complet validé avec NVDA ou VoiceOver en plus du test Playwright.

### Vérification du correctif

La région live observée par Playwright annonce désormais en français la clé,
le titre et le nom métier du statut. L'annulation de `CASS-58` a produit
`Déplacement de CASS-58 — Audit — création clavier user story annulé. Position
d’origine restaurée.` sans UUID ni chaîne anglaise. La validation manuelle avec
NVDA ou VoiceOver reste nécessaire avant clôture accessibilité.

- [Transcription Playwright après correction](console/FIXED-BUG-JIR-012-dnd-live-region-fr.txt)

## BUG-JIR-013 — Impossible de créer ou configurer une colonne de workflow

- **Gravité :** critique produit
- **Priorité :** P0
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** board / administration du workflow

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS` avec un rôle administrateur.
2. Examiner la barre d'actions, les quatre en-têtes de colonne et l'espace situé après `Terminé`.
3. Ouvrir `Administration`, puis `Backlogs`.
4. Ouvrir successivement `Nouveau backlog` et `Modifier` pour le backlog `CASS`.

### Résultat obtenu

Le board expose uniquement la création d'un item dans les quatre colonnes fixes
`À faire`, `En cours`, `En revue` et `Terminé`. Il n'existe aucune action pour
ajouter, renommer, réordonner ou supprimer une colonne. Dans l'administration,
les formulaires de backlog ne proposent que clé, nom et couleur ; aucune section
de statuts ou workflow n'est disponible.

### Résultat attendu

Un administrateur doit pouvoir adapter le flux de chaque backlog : créer et
nommer un statut/une colonne, choisir sa catégorie métier et sa couleur,
réordonner le board, puis supprimer une colonne avec migration sûre des items.
Cette capacité doit être découvrable directement depuis le board.

### Impacts

- **Utilisateur :** une équipe ne peut pas représenter son vrai processus
  (`À valider`, `Bloqué`, `Prêt pour livraison`, etc.) et doit détourner les
  quatre statuts imposés.
- **Métier :** Jiroo ne peut pas remplacer Jira pour piloter un produit de bout
  en bout ; adoption B2B, migration et segmentation par équipe sont bloquées.

### Preuves

- [Board sans action d'ajout](screenshots/BUG-JIR-013-board-sans-action-ajouter-colonne.png)
- [Création de backlog sans workflow](screenshots/BUG-JIR-013-creation-backlog-sans-configuration-workflow.png)
- [Console Playwright](console/2026-08-05-session-04-workflow-columns-console-final.log)
- [Réseau Playwright](network/2026-08-05-session-04-workflow-columns-requests-final.log)

### Cause probable

Le produit crée automatiquement quatre statuts lors de la création d'un backlog
et les affiche dans leur ordre persistant, mais aucune mutation de statut ni
interface de configuration n'est exposée. Le stockage est donc partiellement
préparé, tandis que le service et l'UX restent figés.

### Correction proposée

Faire du statut persistant la source d'une colonne configurable par backlog.
Ajouter des mutations transactionnelles de création, édition, ordre et
suppression avec remplacement obligatoire pour une colonne occupée, puis une
action `Colonnes` visible sur le board et réservée aux administrateurs.

### Critères de vérification

- cycle complet créer → renommer → réordonner → recharger réellement persisté ;
- nouvelle colonne disponible dans Board, Liste, Arbre, filtres et formulaires ;
- suppression occupée impossible sans destination, puis migration sans perte ;
- au moins un statut initial et un statut terminé restent garantis ;
- contributeur et lecteur sans action de configuration ni mutation forgée ;
- aucune erreur JavaScript ou HTTP inattendue pendant le scénario Playwright.

### Vérification du correctif

Le cycle Playwright a créé `Prêt audit`, rechargé le board, renommé la colonne
en `Prêt livraison`, changé sa couleur et son ordre, puis créé `CASS-59` dans
cette colonne. La suppression a exigé une destination, migré l'item vers
`En cours` et retiré la colonne sans perte. Un doublon `En cours` a été refusé
avec un message explicite ; les derniers statuts `todo` et `done` sont protégés.
Un compte réel `Audit Workflow Lecteur`, enrôlé en 2FA dans un contexte isolé,
voit 0 bouton `Colonnes`, 0 création et 0 poignée ; `/admin` le redirige vers le
board. Console, avertissements et réponses HTTP en échec : 0 sur ce parcours.

Preuves après correction :

- [Gestion des colonnes côté administrateur](screenshots/FIXED-BUG-JIR-013-gestion-colonnes-admin.png)
- [Board lecteur sans administration du workflow](screenshots/FIXED-BUG-JIR-013-lecteur-sans-gestion-colonnes.png)
- [Console finale](console/2026-08-05-session-04-remediation-final-console.log)
- [Réseau final](network/2026-08-05-session-04-remediation-final-requests.log)

## BUG-JIR-014 — La suppression d'une colonne expose son UUID dans l'activité

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** workflow / migration / journal d'activité

### Étapes de reproduction

1. Créer une colonne `Prêt livraison`.
2. Créer ou déplacer un item dans cette colonne.
3. Supprimer la colonne en choisissant `En cours` comme destination.
4. Ouvrir l'item, onglet `Activité`.

### Résultat obtenu

L'événement affiche initialement `Administrateur a changé le statut de
<UUID> à En cours`. Après une première correction limitée au nouvel événement
de migration, l'événement antérieur `En cours → <UUID>` restait lui aussi
illisible dès que le statut référencé avait été supprimé.

### Résultat attendu

Le journal doit rester intelligible après suppression : les deux événements
doivent conserver les libellés métier, par exemple `En cours → Audit preuve`
puis `Audit preuve → En cours`, sans dépendre d'une ligne de statut encore
présente.

### Impacts

- **Utilisateur :** l'historique ne permet plus de comprendre le chemin réel de
  l'item ni de mener une investigation.
- **Métier :** la piste d'audit devient ambiguë précisément lors d'une mutation
  administrative à fort impact ; support, conformité et analyse des incidents
  perdent une preuve exploitable.

### Preuve

- [Avant correction — UUID dans l'activité](screenshots/BUG-JIR-014-activite-migration-colonne-affiche-uuid.png)
- [Après correction — libellés métier conservés](screenshots/FIXED-BUG-JIR-014-activite-migration-libelles-metier.png)
- [Console du scénario initial](console/2026-08-05-session-04-workflow-columns-runtime-console.log)
- [Réseau du scénario initial](network/2026-08-05-session-04-workflow-columns-runtime-requests.log)

### Cause probable

Les événements de changement de statut stockaient les UUID comme anciennes et
nouvelles valeurs, puis l'interface résolvait leur libellé à partir des statuts
encore existants. La suppression rendait cette résolution impossible.

### Correction appliquée

La migration enregistre désormais directement les noms stables. Avant de
supprimer un statut, la transaction remplace aussi ses UUID déjà référencés dans
les activités historiques par son nom, puis migre les items et compacte l'ordre.

### Vérification du correctif

Playwright a créé `CASS-60` dans `En cours`, l'a déplacé vers `Audit preuve`, a
supprimé cette colonne avec remplacement par `En cours`, puis a relu l'activité.
Les trois lignes observées sont création, `En cours à Audit preuve` et
`Audit preuve à En cours`. Aucun UUID n'est visible.

## BUG-JIR-015 — La vue Liste ne permet pas de planifier un backlog produit

- **Gravité :** critique produit
- **Priorité :** P0
- **Statut :** ouvert
- **Fonctionnalité :** backlog produit / triage / planification

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS?view=list` en administrateur.
2. Examiner les colonnes, les lignes et les contrôles de la liste.
3. Tenter de sélectionner plusieurs items ou de les classer manuellement.
4. Ouvrir `Nouvel item`, puis le détail de `CASS-58`.
5. Ouvrir la vue `Arbre`, glisser `CASS-58` sur son frère `CASS-57` et observer
   le résultat.
6. Ouvrir `/admin`, puis `Modifier` le backlog `CASS`.

### Résultat obtenu

- Le tableau expose `Clé`, `Titre`, `Statut`, `Prio`, `Labels`, `Échéance` et
  `Assigné`, mais aucun rang, estimation, cycle/sprint ou release/version.
- Le DOM interactif contient 0 checkbox, 0 sélection de ligne et 0 poignée de
  classement dans la Liste : aucune modification en masse n'est possible.
- Le tri par titre et le groupement par priorité fonctionnent, mais trier n'est
  pas prioriser : aucune position métier persistante n'est manipulable.
- L'Arbre est déplaçable, mais le dépôt sur un frère tente de modifier le parent,
  affiche `Parent invalide pour ce type.` et conserve exactement le même ordre.
- Les formulaires de création, détail et administration n'exposent ni
  estimation, ni cycle, ni release, ni capacité.
- La navigation ne propose que Tous les items, Mes items, vues, corbeille et
  administration ; aucun backlog séparé, sprint/cycle ou release n'est
  découvrable.

### Résultat attendu

Une équipe produit doit pouvoir conserver un backlog distinct du travail en
cours, classer les items selon leur ordre métier, les estimer, sélectionner un
ensemble pour le modifier, les affecter à un cycle/sprint et à une release, puis
visualiser la capacité et ce qui entre réellement en exécution.

### Impacts

- **Utilisateur :** le PM peut enregistrer des tickets, mais doit revenir à un
  tableur ou à un autre outil pour prioriser et préparer un sprint.
- **Métier :** Jiroo ne peut pas remplacer Jira/Linear sur la gestion de produit
  de bout en bout ; adoption équipe et migration sont bloquées.
- **Données :** la priorité à cinq niveaux ne remplace pas un rang relatif ; deux
  items `Haute` restent impossibles à ordonner de façon autoritaire.

### Preuves

- [Liste sans champs de planification](screenshots/BUG-JIR-015-liste-sans-planification-backlog.png)
- [Création sans estimation, cycle ou release](screenshots/BUG-JIR-015-creation-sans-estimation-cycle-release.png)
- [Arbre de parentage sans rang de backlog](screenshots/BUG-JIR-015-arbre-hierarchie-sans-rang-backlog.png)
- [Administration sans planification](screenshots/BUG-JIR-015-administration-sans-planification.png)
- [Console Playwright](console/2026-08-05-session-05-backlog-triage-console.log)
- [Réseau Playwright](network/2026-08-05-session-05-backlog-triage-requests.log)

### Gravité, performance et observabilité

La mutation unitaire de priorité fonctionne et a été restaurée en environ
110 ms avec un POST 200. Le tri titre a été observé autour de 271 ms. La session
cumule 0 erreur et 0 avertissement console ; les requêtes nominales observées
répondent 200. Il s'agit donc d'une lacune de modèle produit, pas d'une panne
technique du tableau actuel.

### Cause probable

Le modèle visible est centré sur les propriétés d'un item et son statut de
workflow. Aucun concept de rang relatif, estimation, itération, release ou
opération sur une sélection n'est exposé à l'interface. Le DnD de l'Arbre est
spécialisé dans la relation parent/enfant et ne peut pas être réutilisé comme
preuve de priorisation.

### Correction proposée

1. Ajouter un rang persistant par backlog avec réordonnancement souris et
   clavier, indépendant des tris temporaires.
2. Ajouter sélection multiple et bulk edit pour statut, priorité, assigné,
   estimation, cycle et release.
3. Introduire une estimation configurable, puis cycles/sprints avec capacité et
   une séparation explicite backlog / cycle actif.
4. Introduire releases/versions avec date cible, état et progression.
5. Conserver l'Arbre pour la hiérarchie et ne jamais présenter son parentage
   comme un classement de backlog.

## Diagnostics non classés comme bugs

- Deux `POST /api/auth/two-factor/verify-totp` ont répondu `401 UNAUTHORIZED` lors de codes TOTP invalides générés par l'audit. Le troisième code, validé dans l'application d'authentification, a répondu 200. Le blocage et le message `Code invalide. Réessayez.` sont attendus.
- La capture locale `BUG-JIR-001-2fa-activation-failure.png`, produite avant la validation humaine, est conservée hors Git car elle contient un QR TOTP, une clé manuelle et des codes de récupération. Elle **n'est pas un bug indexé** et ne doit jamais être publiée.
- Chromium a émis un diagnostic DOM : le formulaire de confirmation du mot de passe 2FA ne contient pas de champ username associé. Impact probable : autofill et gestionnaires de mots de passe moins fiables. Correction : fournir un champ e-mail/username associé, éventuellement visuellement masqué, avec les bons attributs `autocomplete`.
- Aucune exception JavaScript et aucun échec HTTP inattendu n'ont été observés pendant le parcours nominal de création.
- L'URL de développement invalide `https://example.com/not-github` a bien produit `{ ok:false, error:"URL GitHub invalide." }` et un toast visible pendant environ quatre secondes. Les artefacts [requête](network/BUG-JIR-004-invalid-development-link-request.txt), [réponse](network/BUG-JIR-004-invalid-development-link-response.txt) et [capture tardive](screenshots/BUG-JIR-004-invalid-github-url-no-feedback.png) sont conservés, mais **BUG-JIR-004 n'est pas classé comme bug**.
- Aucun échec HTTP inattendu ni exception JavaScript n'a été observé pendant l'édition nominale. Les `401` TOTP visibles dans le journal cumulé proviennent des essais invalides de l'incrément 01, pas de l'édition d'item.

Journaux : incrément 01 [console](console/2026-08-04-session-01-console.log) / [réseau](network/2026-08-04-session-01-requests.log) ; incrément 02 [console](console/2026-08-04-session-02-console.log) / [réseau](network/2026-08-04-session-02-requests.log).

Incrément 03 : [console complète](console/2026-08-05-session-03-dnd-transitions-console.log) / [réseau complet](network/2026-08-05-session-03-dnd-transitions-requests.log) ; session finale propre [console](console/2026-08-05-session-03-dnd-transitions-clean-console.log) / [réseau](network/2026-08-05-session-03-dnd-transitions-clean-requests.log). Les `net::ERR_FAILED` du journal complet sont les deux échecs volontairement injectés pour vérifier le rollback ; le parcours nominal final contient 0 erreur et 0 avertissement.

Incrément 04 : constat initial [console](console/2026-08-05-session-04-workflow-columns-console-final.log) / [réseau](network/2026-08-05-session-04-workflow-columns-requests-final.log) ; scénario de migration [console](console/2026-08-05-session-04-workflow-columns-runtime-console.log) / [réseau](network/2026-08-05-session-04-workflow-columns-runtime-requests.log) ; remédiation finale [console](console/2026-08-05-session-04-remediation-final-console.log) / [réseau](network/2026-08-05-session-04-remediation-final-requests.log).

Incrément 05 : backlog/triage [console](console/2026-08-05-session-05-backlog-triage-console.log) / [réseau](network/2026-08-05-session-05-backlog-triage-requests.log). La collecte contient 0 erreur et 0 avertissement ; les deux POST de mutation de priorité et leurs rafraîchissements GET répondent 200.

## Journal de résolution — 4 août 2026

| Bug | Correctif vérifié | Niveau de preuve |
|---|---|---|
| BUG-JIR-001 | `keydown` consommé avant ouverture ; titre vide et focus actif | Vitest + Chromium ; [capture](screenshots/FIXED-BUG-JIR-001-create-shortcut-empty-title.png) |
| BUG-JIR-002 | limite 200, compteur, erreur Zod structurée, `aria-invalid` et retour du focus | Vitest action/composant + Chromium (`maxLength=200`) |
| BUG-JIR-003 | shell monocolonne mobile, drawer 248 px, toolbar repliable et création entièrement visible | Vitest + Chromium 390 × 844 ; [capture](screenshots/FIXED-BUG-JIR-003-mobile-navigation-drawer.png) |
| BUG-JIR-005 | limite 20 000, compteur et erreur serveur liée à la description | Vitest action/composant + Chromium (`maxLength=20000`) |
| BUG-JIR-006 | détail plein écran 390 px, grille mobile une colonne et propriétés sous le contenu | Vitest + Chromium ; [capture](screenshots/FIXED-BUG-JIR-006-detail-panel-mobile.png) |
| BUG-JIR-007 | boutons de retrait conservés dans l'ordre de tabulation et révélés par `focus-within` | Vitest relations/références + Chromium ; [capture](screenshots/FIXED-BUG-JIR-007-keyboard-remove-action.png) |
| BUG-JIR-008 | heading préservé et bouton `Renommer CASS-57` focusable ; saisie autofocus | Vitest + Chromium |
| BUG-JIR-009 | dialogue Radix nommé, fermeture immédiate par `Escape`, URL nettoyée et focus restauré au déclencheur | Vitest + Chromium desktop/mobile |

La première collecte de remédiation contient les deux 401 TOTP historiques de la session déjà ouverte. Une seconde session Playwright isolée confirme **0 erreur, 0 avertissement et uniquement des réponses 200** : [console propre](console/2026-08-04-remediation-clean-console.log), [réseau propre](network/2026-08-04-remediation-clean-requests.log). La relation temporaire `CASS-57` → `CASS-58` créée pour vérifier BUG-JIR-007 a été retirée après la capture.

## Journal de résolution — 5 août 2026

| Bug | Correctif vérifié | Niveau de preuve |
|---|---|---|
| BUG-JIR-010 | snapshot restauré sur `onDragCancel`, DOM et base restent dans `À faire` | Vitest + Playwright clavier + reload |
| BUG-JIR-011 | collision pointeur prioritaire et auto-scroll réduit ; cible vide `En revue` réellement persistée | Vitest + Playwright souris + reload ; matrice longue restante |
| BUG-JIR-012 | annonces françaises avec clé/titre/statut, sans UUID | Vitest + inspection Playwright de `aria-live` ; NVDA/VoiceOver restant |
| BUG-JIR-013 | CRUD/ordre/couleur, invariants, migration occupée et permissions lecteur | Vitest + Playwright admin/lecteur ; [capture admin](screenshots/FIXED-BUG-JIR-013-gestion-colonnes-admin.png) |
| BUG-JIR-014 | références historiques remplacées par le nom avant suppression | Vitest + Playwright sur `CASS-60` ; [capture](screenshots/FIXED-BUG-JIR-014-activite-migration-libelles-metier.png) |
