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
- **Statut :** clos le 28 octobre 2026 : 150 dépôts consécutifs vérifiés par la matrice (JIR-40), voir le journal du 28 octobre
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
- **Statut :** partiellement corrigé — backlog et cycle sprint principal livrés ; releases restantes
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

### Correction partielle vérifiée — incrément 06

Une vue `Backlog` distincte expose désormais uniquement les tâches non
terminées, leur statut, priorité, estimation et assigné. Le classement manuel
clavier est persistant et est désactivé avec une explication quand un tri ou un
groupement est actif. Chromium a déplacé une tâche, observé un POST 200 en
141 ms, rechargé la page et retrouvé le même ordre. La console ne contient
aucune erreur et toutes les réponses observées sont nominales.

`BUG-JIR-015` reste partiellement ouvert : la sélection multiple et les actions
groupées sont désormais validées dans Chromium. Le cycle sprint principal est
également livré à l'incrément 08 ; les releases ne sont pas encore livrées.

### Correction partielle complémentaire vérifiée — incrément 06 final

Deux tâches adjacentes ont été sélectionnées par `Shift`, puis modifiées en
masse sur statut, priorité, assigné et estimation. Les quatre POST ont répondu
200 en 141 à 256 ms et les valeurs ont été observées sur chaque ligne. Un échec
réseau injecté conserve les deux sélections et affiche
`Modification groupée impossible.` ; le service transactionnel refuse tout lot
partiellement invalide. Le rôle lecteur réel expose zéro checkbox et zéro barre
bulk. Le classement a également été rejoué à la souris, restauré au clavier et
vérifié après chaque rechargement.

Preuves : [bulk](screenshots/FIXED-PARTIAL-BUG-JIR-015-bulk-edit.png),
[points](screenshots/FIXED-PARTIAL-BUG-JIR-015-story-points.png),
[rollback bulk](screenshots/EXPECTED-backlog-bulk-network-selection-retained.png)
et [rollback classement](screenshots/EXPECTED-backlog-rank-network-rollback.png).

### Correction partielle complémentaire vérifiée — incrément 08 sprints

Chromium crée et planifie par drag ou bulk, calcule la capacité, démarre un
sprint unique, limite le Board au périmètre actif, crée et déplace une tâche,
puis clôture vers Backlog, sprint existant ou nouveau sprint. Une sous-tâche
ouverte bloque atomiquement la clôture avec sa clé. Les rejets réseau de bulk,
drag, démarrage et clôture conservent l'état utile. Le lecteur ne possède aucun
contrôle de mutation. La matrice finale PR1 + PR2 compte 14 scénarios passés en
42,8 s, dont 7 pour le cycle sprint.

`BUG-JIR-015` reste ouvert uniquement sur la partie releases/versions et sur le
reporting de livraison associé. Les rapports de sprint sont une lacune P0
distincte de pilotage, désormais inscrite à la roadmap.

Preuves : [planification](screenshots/FIXED-PARTIAL-BUG-JIR-015-planification-sprint-bulk.png),
[capacité](screenshots/FIXED-PARTIAL-BUG-JIR-015-capacite-depassee.png),
[Board actif](screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sprint-actif.png) et
[variantes de clôture](screenshots/FIXED-PARTIAL-BUG-JIR-015-cloture-variantes.png).

## BUG-JIR-016 — Le classement Backlog provoque une divergence d’hydratation React

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié
- **Fonctionnalité :** backlog / classement accessible / SSR

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS?view=backlog` dans un nouveau contexte
   Chromium authentifié.
2. Attendre l’hydratation de la vue et surveiller la console.
3. Examiner `aria-describedby` sur les poignées `Déplacer CASS-*`.

### Résultat obtenu

React signale une divergence : le serveur rend `DndDescribedBy-1` et le client
`DndDescribedBy-0`. React précise que l’attribut ne sera pas corrigé.

### Résultat attendu

Le HTML serveur et le premier rendu client doivent être identiques ; chaque
poignée doit référencer les instructions DnD réellement présentes.

### Impacts

- **Utilisateur :** une technologie d’assistance peut recevoir une référence
  d’instructions incohérente ou absente.
- **Métier :** bruit console et baisse de confiance dans la stabilité SSR de la
  fonctionnalité de planification.

### Capture et cause probable

Playwright a enregistré la divergence dans son artefact d’échec automatique.
La preuve après correction est la [capture du Backlog classé](screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png).
Le `DndContext` utilisait un identifiant automatique dont la séquence différait
entre serveur et client.

### Correction appliquée et vérification

Le contexte reçoit maintenant un identifiant stable dérivé du backlog.
Playwright rejoue l’hydratation, le clavier et le rechargement avec 0 erreur
console. [Console finale](console/2026-08-05-session-06-backlog-ranking-smoke-console.log).

## BUG-JIR-017 — Le tri local des rangs fractionnels contredit l’ordre persistant

- **Gravité :** critique
- **Priorité :** P0
- **Statut :** corrigé et vérifié
- **Fonctionnalité :** backlog / classement manuel

### Étapes de reproduction

1. Ouvrir la vue Backlog avec des rangs fractionnels contenant majuscules et
   minuscules, par exemple `aBV` et `aBl`.
2. Déplacer la première tâche d’une position au clavier.
3. Observer l’ordre optimiste, le POST 200, puis recharger la page.

### Résultat obtenu

La base persiste bien le nouveau rang et l’activité `move/rank`, mais la vue
revient visuellement à l’ordre précédent. `localeCompare` classe `aBl` avant
`aBV`, contrairement à l’ordre binaire requis par les rangs fractionnels.

### Résultat attendu

L’ordre affiché, l’ordre optimiste, l’ordre stocké et l’ordre après rechargement
doivent être strictement identiques.

### Impacts

- **Utilisateur :** le PM croit qu’une priorité a été perdue ou ne peut pas
  faire confiance au backlog.
- **Métier :** défaut bloquant pour planifier un sprint ; les décisions
  d’ordre semblent non persistantes malgré une mutation réussie.

### Capture, cause et correction

La preuve finale est la [capture après rechargement](screenshots/FIXED-PARTIAL-BUG-JIR-015-backlog-ranked.png), avec [console](console/2026-08-05-session-06-backlog-ranking-smoke-console.log) et [réseau](network/2026-08-05-session-06-backlog-ranking-smoke-requests.log).
La cause était une collation linguistique appliquée à une clé technique. Le tri
utilise désormais les comparaisons binaires `<` et `>` déjà employées par le
Board. Un test de régression couvre explicitement `aBV < aBl`, et Playwright
confirme la persistance après rechargement.

## BUG-JIR-018 — Le menu d’estimation reste ouvert après un enregistrement réussi

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** corrigé et vérifié
- **Fonctionnalité :** Backlog / estimation inline

### Étapes de reproduction

1. Ouvrir `http://localhost:3000/b/CASS?view=backlog` comme contributeur.
2. Ouvrir `Estimation : Non estimé` sur une tâche.
3. Saisir `5`, puis cliquer sur `Enregistrer`.

### Résultat obtenu

La valeur de la ligne et les agrégats sont rafraîchis, mais le menu reste ouvert
au-dessus du tableau. Aucun feedback ne distingue l’état encore éditable d’une
mutation déjà terminée ; un clic supplémentaire hors du menu est nécessaire.

### Résultat attendu

Après confirmation serveur, le menu doit se fermer, rendre le tableau à nouveau
accessible et replacer la valeur enregistrée sur le déclencheur. En cas
d’erreur, il doit au contraire rester ouvert avec le message.

### Impacts

- **Utilisateur :** geste supplémentaire et doute sur la prise en compte de la
  valeur.
- **Métier :** faible isolément, mais répété pendant l’estimation d’un backlog.
- **Accessibilité :** le contenu principal reste masqué par la modalité Radix
  jusqu’à fermeture manuelle.

### Cause, correction et preuve

`InlineEstimate` ne contrôlait pas l’état `open` et la fonction de mutation ne
permettait aucune action après succès. Un callback de succès ferme désormais le
menu avant `router.refresh()` ; les erreurs n’appellent pas ce callback. Le test
unitaire échouait avec le `spinbutton` encore présent, puis passe après
correction. Playwright valide `5 → 0 → null` et exige la disparition du champ
après chaque succès.

Preuve : [état final sans menu](screenshots/FIXED-BUG-JIR-018-estimate-menu-closes.png).

## BUG-JIR-019 — Un sprint créé après le rendu paraît ouvert mais masque ses tâches

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** Backlog / sections de sprint

### Étapes de reproduction

1. Ouvrir `/b/CASS?view=backlog` sans section `Sprint 1` déjà rendue.
2. Cliquer sur `Créer un sprint`.
3. Créer une tâche dans ce sprint depuis l'action contextuelle.
4. Observer l'icône de section et chercher la nouvelle ligne.

### Résultat obtenu et attendu

L'en-tête affiche le chevron ouvert et le compteur augmente, mais le corps de
la section reste absent. La tâche doit apparaître immédiatement dans une
section dont l'état visuel et le contenu sont cohérents.

### Impacts

- **Utilisateur :** la création semble avoir échoué ou la tâche semble perdue.
- **Métier :** perte de confiance au moment de préparer le sprint ; risque de
  doublons créés pour compenser.
- **Accessibilité :** l'état développé annoncé ne correspond pas au contenu.

### Cause, correction et preuve

L'en-tête calculait l'état initial avec `expanded[id] ?? true`, tandis que le
corps testait directement `expanded[id]`. Un identifiant apparu après le rendu
était donc visuellement ouvert mais logiquement fermé. La visibilité utilise
maintenant le même défaut `true` partout, avec un test de régression. Le
scénario Playwright de planification crée, replie, rouvre puis recharge la
section avec les deux lignes visibles.

Preuve : [section persistée](screenshots/FIXED-PARTIAL-BUG-JIR-015-planification-sprint-bulk.png),
[console](console/2026-08-05-session-08-sprint-planning-console.log) et
[réseau](network/2026-08-05-session-08-sprint-planning-requests.log).

## BUG-JIR-020 — Un rejet réseau ferme le flux de démarrage sans explication exploitable

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** sprint / démarrage et clôture

### Étapes de reproduction

1. Ouvrir un sprint planifié dans le Backlog.
2. Cliquer sur `Démarrer`, compléter le dialogue et confirmer.
3. Interrompre le POST de la Server Action.

### Résultat obtenu et attendu

La promesse rejetée n'était pas interceptée par le dialogue : le composant
perdait son flux contrôlé au lieu d'offrir une reprise. Le dialogue doit rester
ouvert, expliquer l'échec, conserver les valeurs et ne modifier ni l'URL ni
l'état du sprint.

### Impacts

- **Utilisateur :** doute sur le démarrage réel et ressaisie potentielle.
- **Métier :** un responsable peut croire le sprint engagé alors qu'il reste
  planifié ; support et risque d'exécution hors cycle.
- **Données :** la transaction serveur reste sûre, mais l'UI ne le rendait pas
  vérifiable.

### Cause, correction et preuve

Les composants traitaient les réponses `{ ok: false }`, mais pas les rejets de
transport. Les deux Server Actions de cycle sont maintenant protégées par
`try/catch` ; les messages `Démarrage impossible.` et `Clôture impossible.`
restent dans leur dialogue. Playwright interrompt le POST de démarrage, vérifie
le message et confirme directement que `state=planned` et `startedAt=null`.
La clôture partage le correctif et son POST a également été interrompu dans
Chromium : dialogue visible, message français et sprint toujours actif.

Preuve : [capture](screenshots/EXPECTED-sprint-start-network-error.png),
[console](console/2026-08-05-session-08-sprint-lifecycle-failure-console.log)
et [requête interrompue](network/2026-08-05-session-08-sprint-lifecycle-failure-requests.log).

## BUG-JIR-021 — L'icône du type pollue le nom accessible du bouton Créer

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** création contextuelle / accessibilité

### Étapes de reproduction

1. Depuis une section de sprint, ouvrir `Créer dans <sprint>`.
2. Choisir le type `Tâche` ou `Composant`.
3. Inspecter le nom accessible du bouton de soumission.

### Résultat obtenu et attendu

Le bouton était nommé `Tâche Créer` ou `Composant Créer`, car l'icône exposait
son propre libellé. L'action doit être annoncée simplement `Créer`, le type
étant déjà identifié par son champ.

### Impacts

- **Utilisateur :** commandes vocales et recherche par rôle/nom moins
  prévisibles.
- **Métier :** dette d'accessibilité sur une action fréquente.

### Cause, correction et preuve

Le composant `TypeIcon` participait au calcul du nom du bouton. Un
`aria-label="Créer"` fixe désormais le nom public, couvert par un matcher
strict et par le scénario Playwright de création contextuelle.

Preuve fonctionnelle : [Board actif après création](screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sprint-actif.png).

## BUG-JIR-022 — Une section sprint vide n'est pas une cible DnD fiable

- **Gravité :** critique
- **Priorité :** P0
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** Backlog / planification par drag

### Étapes de reproduction

1. Créer un sprint vide puis stabiliser la vue Backlog.
2. Saisir une tâche par sa poignée et viser l'en-tête du sprint vide.
3. Relâcher et répéter le scénario cinq fois en surveillant POST, DOM et base.

### Résultat obtenu et attendu

Avant correction, seulement deux répétitions sur cinq plaçaient la tâche visée
dans le sprint. La collision pouvait conserver la ligne dans le Backlog ou
choisir une ligne traversée, malgré un POST 200. La section réellement pointée
doit être la destination autoritaire et la bonne tâche doit être persistée.

### Impacts

- **Utilisateur :** mauvaise tâche planifiée ou geste apparemment ignoré.
- **Métier :** engagement de sprint incorrect et métriques de capacité fausses.
- **Données :** une mutation nominale peut écrire un classement différent de
  l'intention visible sans erreur HTTP.

### Cause, correction et preuve

La détection par recouvrement comparait le rectangle déplacé aux lignes
traversées. Une stratégie dédiée utilise maintenant la position du pointeur :
elle préfère une ligne précise lorsqu'elle est réellement pointée, sinon la
section vide sous le pointeur ; le clavier conserve un fallback géométrique.
Trois tests unitaires couvrent les priorités et Playwright obtient **5/5**
placements corrects, puis reload et membership cohérents. Un échec réseau
injecté restaure aussi DOM et base.

Preuves : [état final](screenshots/FIXED-PARTIAL-BUG-JIR-015-planification-sprint-bulk.png),
[rollback](screenshots/EXPECTED-sprint-planning-network-rollback.png),
[console](console/2026-08-05-session-08-sprint-planning-console.log) et
[réseau](network/2026-08-05-session-08-sprint-planning-requests.log).

## BUG-JIR-023 — La collation SQL peut générer un rang déjà occupé et bloquer la création

- **Gravité :** critique
- **Priorité :** P0
- **Statut :** corrigé et vérifié le 5 août 2026
- **Fonctionnalité :** création / classement / persistance

### Étapes de reproduction

1. Obtenir dans un backlog des rangs fractionnels `aZ` et `aa` après plusieurs
   replanifications.
2. Créer une nouvelle tâche depuis le Board ou le Backlog.
3. Observer le dialogue, la requête et l'index `items_backlog_rank_idx`.

### Résultat obtenu et attendu

PostgreSQL sélectionnait `aZ` comme dernier rang selon sa collation locale ; le
générateur binaire produisait alors `aa`, déjà occupé. L'insert échouait sur
l'index unique et l'UI affichait seulement `Création impossible.`. Le même ordre
binaire doit être utilisé dans le navigateur, les services et toutes les
requêtes SQL de rang.

### Impacts

- **Utilisateur :** création impossible après un historique de classement
  pourtant valide.
- **Métier :** blocage P0 du cycle de planification et risque de support
  difficile à reproduire sur un backlog neuf.
- **Données :** aucune corruption grâce à l'index, mais disponibilité perdue.

### Cause, correction et preuve

Les comparaisons JavaScript utilisaient déjà `<`/`>`, mais les `ORDER BY` et
bounds SQL héritaient de la locale de la base. Un helper applique désormais
`COLLATE "C"` à toutes les lectures, recherches de voisins et queues de rang
items/sprints. Le test d'intégration reproduit exactement le conflit `aZ`/`aa` :
RED avec contrainte `23505`, puis GREEN avec un rang strictement après `aa`.
La matrice Playwright complète recrée ensuite toutes les tâches sans erreur.

Preuve navigateur : [cycle nominal](screenshots/FIXED-PARTIAL-BUG-JIR-015-board-sprint-actif.png)
et [console propre](console/2026-08-05-session-08-sprint-lifecycle-console.log).

## BUG-JIR-024 — Un gestionnaire de groupes pouvait modifier un groupe privilégié

- **Gravité :** critique
- **Priorité :** P0
- **Statut :** corrigé et vérifié le 6 août 2026
- **Fonctionnalité :** administration / permissions globales

### Étapes de reproduction

1. Accorder `manage_users_groups`, sans `administer_jiroo`, à un utilisateur.
2. Ouvrir `/admin?tab=groups` avec cet utilisateur.
3. Cibler le groupe protégé des administrateurs, ou un groupe non protégé qui
   reçoit `administer_jiroo`, puis tenter d’ajouter ou retirer un membre.

### Résultat obtenu et attendu

Les contrôles de membres étaient exposés et la Server Action ne demandait que
`manage_users_groups`. Un gestionnaire de groupes pouvait donc s’accorder
indirectement `administer_jiroo`. Ces groupes privilégiés doivent exiger
`administer_jiroo` côté serveur et ne présenter aucun contrôle de mutation aux
autres gestionnaires.

### Impacts

- **Utilisateur :** élévation de privilège jusqu’à l’administration globale.
- **Métier :** rupture de séparation des responsabilités sur toute l’instance.
- **Données :** possibilité de contourner ensuite tous les schémas de backlog.

### Cause, correction et preuve

L’autorisation portait sur la fonction de gestion des groupes, sans considérer
les permissions transitives du groupe ciblé. Le service détecte désormais tout
groupe protégé ou titulaire de `administer_jiroo`; les Server Actions exigent
alors cette permission supplémentaire et l’UI masque ajout/retrait. Les tests
d’action, composant et intégration couvrent le refus et la propagation des
backlogs concernés.

Preuves navigateur : [AVANT — contrôles d’ajout/retrait exposés](screenshots/BUG-JIR-024-protected-admin-group-membership-controls.png)
et [APRÈS — mêmes contrôles absents sous le compte limité `manage_users_groups`](screenshots/20260806-review-r1-permissions-01-FIXED-BUG-JIR-024-protected-admin-group-membership-controls.png).

## BUG-JIR-025 — Les usages d’un rôle produisent des clés React dupliquées

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** corrigé et vérifié le 6 août 2026
- **Fonctionnalité :** administration / rôles de projet

### Étapes de reproduction

1. Affecter un même rôle de projet à un groupe et à un utilisateur dans CASS.
2. Ouvrir `/admin?tab=roles` avec l’administrateur de plateforme.
3. Surveiller la console Chromium pendant le rendu et les rafraîchissements.

### Résultat obtenu

React émet six erreurs `Encountered two children with the same key` pour le
libellé identique `Affectation dans Cour de cassation`.

### Résultat attendu

Chaque blocker de suppression possède une identité React stable et unique ; le
parcours nominal d’administration ne produit aucune erreur console.

### Impacts

- **Utilisateur :** risque de blocker dupliqué ou omis lors d’un rafraîchissement.
- **Métier :** signal d’intégrité UI bruité dans une surface de sécurité.
- **Audit :** empêche la validation « console propre » de la matrice permissions.

### Cause, correction et preuve

- [Capture initiale du parcours, sur l’onglet Schémas — contexte seulement](screenshots/BUG-JIR-025-duplicate-project-role-blocker-keys.png)
- [APRÈS — écran Rôles et blockers du rôle Spécialiste](screenshots/20260806-review-r1-permissions-01-FIXED-BUG-JIR-025-project-role-blockers-clean-console.png)
- [Console propre du scénario Rôles](console/20260806-review-r1-permissions-01-permission-schemes-01-create-group-role-scheme-console.log)

`ProjectRoleAdmin` utilisait le texte du blocker comme clé React. Le service
retourne légitimement deux dépendances de même libellé lorsque le rôle est
occupé par deux principaux dans le même backlog. La clé combine désormais
l’index et le libellé dans la liste principale comme dans le dialogue de
suppression. Le test composant reproduit le doublon et le scénario Chromium est
repassé sans erreur console.

## BUG-JIR-026 — La page Accès imbrique deux landmarks `main`

- **Gravité :** majeure (accessibilité)
- **Priorité :** P1
- **Statut :** corrigé et vérifié le 6 août 2026
- **Fonctionnalité :** administration des accès d’un backlog

### Étapes de reproduction

1. Ouvrir `/b/CASS/settings/access` dans Chromium avec l’administrateur E2E.
2. Interroger l’arbre d’accessibilité par le rôle `main`.
3. Compter les landmarks exposés.

### Résultat obtenu et attendu

Playwright trouve deux landmarks `main` : celui du shell applicatif et un
second créé par la page Accès. Une page doit exposer un seul contenu principal ;
la page enfant doit utiliser un conteneur neutre sous le `main` du shell.

### Impacts

- **Utilisateur :** navigation par landmarks ambiguë pour les lecteurs d’écran.
- **Métier :** non-conformité de structure sur une surface de sécurité critique.
- **Audit :** les sélecteurs de région ne désignent plus un contenu principal unique.

### Cause, correction et preuve

- [Capture Playwright](screenshots/BUG-JIR-026-nested-main-access-settings.png)
- [Console du scénario](console/20260806-review-r1-permissions-01-permission-schemes-03-permission-helper-console.log)

`AppShell` rend déjà le landmark principal. `AccessPage` ajoutait un second
élément `<main>` sans tenir compte de ce parent structurel. La page utilise
désormais un conteneur neutre ; un test de page et Chromium garantissent un seul
landmark `main`.

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
| BUG-JIR-015 (partiel) | backlog et cycle sprint principal livrés ; releases restent ouvertes | Vitest services/composants + 14 scénarios Chromium PR1/PR2 |
| BUG-JIR-016 | identifiant DnD stable entre SSR et client | Vitest + console Chromium sans erreur d’hydratation |
| BUG-JIR-017 | comparaison binaire des rangs fractionnels | Vitest de régression + classement souris/clavier et reload |
| BUG-JIR-018 | menu d’estimation fermé uniquement après succès | Vitest RED/GREEN + Playwright `5 → 0 → null` |
| BUG-JIR-019 | état développé cohérent pour les sections apparues après rendu | Vitest + Playwright création/repli/reload |
| BUG-JIR-020 | rejets transport interceptés, dialogue et données conservés | Vitest + Playwright POST interrompu + contrôle DB |
| BUG-JIR-021 | nom accessible strict `Créer` malgré l'icône de type | Vitest + création contextuelle Playwright |
| BUG-JIR-022 | collision pointeur priorisant ligne exacte ou section vide | Vitest + Playwright souris 5/5 + rollback |
| BUG-JIR-023 | collation SQL binaire sur tous les rangs items/sprints | intégration PostgreSQL RED/GREEN + 7 scénarios Chromium |

## BUG-JIR-027 — Releases/Versions totalement absentes malgré la permission dédiée

- **Gravité initiale :** bloquante
- **Priorité initiale :** P0
- **Statut :** fermé le 7 août 2026 — noyau Releases livré et accepté
- **Fonctionnalité :** releases / versions / planification produit

### Correctif vérifié

- modèle Version backlog-scoped et relation many-to-many `Fix versions` ;
- routes liste et détail Releases, création et édition ;
- affectation multivaluée à la création, au détail et en bulk ;
- filtre Version persistant dans l’URL et les vues enregistrées sur Liste,
  Backlog, Board et Arbre ;
- progression explicable par statut, points et drilldowns d’items ;
- publication avec choix explicite pour les incomplets, dépublication,
  archivage et restauration ;
- snapshots de publication append-only, historique corrélé et refus serveur ;
- `manage_releases` consommé par le cycle de vie, `edit_items` par les
  affectations, sans révélation d’IDs étrangers ou supprimés.

### Niveau de preuve

La matrice Chromium persistante autoritative
[`20260807-releases-core-delivery-03`](runs/20260807-releases-core-delivery-03-junit.xml)
passe **40/40**, dont 16 scénarios Releases, sur le SHA source
`8eef265f971ca8244e67299926223046a3529cda`. La matrice PostgreSQL passe
**19/19 fichiers et 184/184 tests** ; le manifeste de provenance est
[conservé ici](runs/20260807-releases-core-delivery-03-manifest.json).

Les scénarios prouvent notamment deux versions par item, ajout/remplacement/
retrait bulk, filtres et reload, calculs de progression, publication et move
des incomplets, snapshots après dépublication/republication, version archivée,
éditeur sans cycle de vie, lecteur forgé sans mutation ni historique, conflit
stale, rollback réseau, second utilisateur et isolation CASS/LABS.

### Dette restante — PR Release 2

Le bug d’absence est fermé, mais la profondeur Jira complète ne l’est pas :
fusion de versions, suppression avec transfert/retrait, ordre manuel, notes de
release et travail connexe Git/PR/déploiement restent explicitement hors du
noyau livré. Ces éléments sont suivis comme portée PR2, pas comme réouverture
de BUG-JIR-027.

## BUG-JIR-028 — Rapports de sprint et vélocité absents

- **Gravité initiale :** majeure
- **Priorité initiale :** P0
- **Statut :** fermé le 8 août 2026
- **Fonctionnalité :** reporting sprint / vélocité

### Correctif vérifié

- snapshot append-only atomique à la clôture, participants et destinations
  conservés même après mutation ou purge des items sources ;
- rapport actif avec engagement, scope, non-estimés, sections et journal ;
- rapport terminé figé, legacy explicitement indisponible sans reconstruction ;
- vélocité 7/12 avec moyenne, valeurs exactes et raisons d’exclusion ;
- route accessible au lecteur, ressources étrangères/malformées dissimulées et
  erreur temporaire générique récupérable ;
- UI desktop/mobile et libellés accessibles du graphe alignés sur le tableau.

### Niveau de preuve

Le run [`sprint-reports-final`](runs/sprint-reports-final-junit.xml) passe 6/6
en 34,640 s. Il prouve R1 8/5, ajout 3, 5 → 8, R2 13/0, R3 exclu, mutations
single/bulk/Board, deux destinations, immutabilité après six mutations de source,
lecteur/second contexte, défaut mixte actif, clavier, 390 × 844 et retry.

Aucun nouveau bug ouvert n’est classé dans ce périmètre. Les absences de
burndown, prévision, test lecteur d’écran réel, cross-browser et volumétrie
supérieure aux pages bornées sont des risques de portée suivis dans la roadmap,
pas des comportements livrés défaillants.

## Incrément 12 — burndown et prévisibilité de planification (1er octobre 2026)

Le burndown de sprint et la comparaison à la vélocité récente sont livrés et
prouvés par [`sprint-burndown-final-2`](runs/sprint-burndown-final-2-junit.xml)
(12/12, 41,638 s, 0 erreur inattendue). L’absence de burndown signalée comme
risque de portée sous BUG-JIR-028 est levée sur ce périmètre. Aucune prévision
de date de release ni prévision statistique n’est livrée ; ce n’est pas un
défaut mais une limite de portée.

### Défaut de test corrigé — oracle d’ordre du journal (scénario 06)

- **Symptôme :** `06 — relie bulk, Board et clôture UI au rapport` échouait sur
  `main` et sur la branche avec `Événement absent ou désordonné : a modifié
  CASS-<n>`.
- **Cause :** depuis `b724c3e`, conformément au contrat du plan burndown, le
  journal est rendu `occurredAt DESC, sequence DESC` (le plus récent d’abord),
  alors que `expectJournalOrder` cherchait les fragments dans l’ordre croissant
  des lignes. Aucun défaut produit : pagination (50) et égalités d’horodatage
  ne sont pas en cause.
- **Correction :** l’assistant inverse les lignes avant de vérifier l’ordre
  chronologique (`09ebc1d`) ; S06 passe dans les deux runs persistants.

### BUG-JIR-029 — Les onglets de rapport perdent le sprint sélectionné

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** ouvert
- **Fonctionnalité :** navigation des rapports

Les liens `Rapport de sprint` et `Burndown` pointent vers `?report=sprint` et
`?report=burndown` sans le paramètre `sprint`. Après avoir choisi un sprint
terminé, changer d’onglet revient au sprint par défaut (actif ou dernier
terminé) ; l’utilisateur doit resélectionner le sprint. Constaté à la lecture de
`components/reports/report-navigation.tsx` et lors de l’écriture de S07 ; aucun
calcul n’est faux.

### Décisions produit ouvertes (non classées comme bugs)

- **Engagement de l’en-tête Backlog d’un sprint actif :** il utilise le
  périmètre estimé courant (mesuré à 25 pts en S08) alors que le burndown
  compare l’engagement figé au démarrage (10 pts). Jira définit l’engagement
  comme le périmètre au démarrage du sprint ; alignement en attente de décision.
- **Moyenne récente d’un sprint terminé :** la population des sept derniers
  sprints inclut le sprint consulté lui-même (moyenne 6,25 en S09).

## Journal de résolution — 1er octobre 2026 (revue burndown)

| Défaut | Correctif | Preuve |
|---|---|---|
| BUG-JIR-029 — les onglets de rapport perdaient le sprint sélectionné | `08dd118` : liens `?report=<r>&sprint=<id>` quand un sprint est sélectionné | test composant + S09 de `sprint-burndown-final-3` (sprint terminé ancien conservé dans les deux sens) |
| Lien mort dans le tableau exact pour un item supprimé logiquement (trouvé en revue) | `2703868` : l’identifiant d’item vient de l’événement de journal aligné | tests ciblés/intégration + run `sprint-burndown-final-3` |

**BUG-JIR-029 : statut fermé le 1er octobre 2026.** L’écart d’« Engagement »
d’un sprint actif dans le Backlog reste une décision produit ouverte, et
l’inclusion du sprint consulté dans la « moyenne récente » d’un sprint terminé
est acceptée comme contexte courant du backlog ; ni l’un ni l’autre n’est classé
comme bug.

## Releases PR2 — 2 octobre 2026 (JIR-39)

Aucun nouveau `BUG-JIR` : le run `20261002-releases-depth-delivery-02` ne
contient aucun défaut. Les problèmes trouvés en revue avant acceptation ont été
corrigés dans la branche :

| Constat de revue | Correctif |
|---|---|
| Échappement Markdown limité à l’inline (titres de setext, listes `1)`, code indenté, `\r` isolé) | `cf6399c` |
| Réordonnancements rapides envoyant une révision périmée ; rollback vers un ordre plus ancien ; aperçu fusion/suppression figé au montage | `3e1e063` |
| Révocation synchrone de l’URL de téléchargement ; changement d’option effaçant les modifications sans avertissement | `ef73ecd` |

Observations ouvertes (mineures, non classées comme bugs) : au-delà de
5 000 éléments, la coupe des notes suit l’ordre texte des clés ; les URL nues
dans un titre deviennent des liens dans l’aperçu (URL `javascript:` neutralisées) ;
après suppression depuis la liste, le focus revient au document ; l’aperçu des
notes contient un second `<h1>`.

## Matrice navigateurs et accessibilité — 28 octobre 2026 (JIR-40)

Run `matrix-*-20261028-223754` sur `282463d` (Chromium 151, WebKit 26.5 ; Firefox
indisponible sur macOS 27, ticket JIR-133), grille et triage dans
[matrix.md](matrix.md). Les défauts produit ci-dessous ont chacun un ticket
Linear ; les échecs propres aux spécifications sont traités dans la grille.

**BUG-JIR-011 : clos le 28 octobre 2026.** Spécification
`e2e/matrix/drops.spec.ts` (projet `matrix-drops`) : 50 dépôts consécutifs vers
la colonne entièrement hors écran la plus proche, avec auto-défilement, à 390,
768 et 1200 px ; à chaque dépôt, cible annoncée, `statusId` envoyé et statut
après rechargement identiques ; 150/150, aucune divergence
(`console/matrix-drops-20261028-223754-drops-{390,768,1200}-nearest.log`). La
série vers la colonne la plus éloignée à 1200 px a été ignorée par budget
(estimation 271 s après 351 s écoulées) ; elle reste à jouer.

### BUG-JIR-030 — Les initiales d'avatar en blanc n'atteignent pas le contraste 4,5:1

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** ouvert, ticket JIR-128
- **Fonctionnalité :** avatars (barre du haut, filtres par assigné, tiroir, Le point)

axe-core, règle `color-contrast`, impact serious, sur les sept pages clés, en
Chromium et en WebKit : initiales en blanc sur la couleur de l'utilisateur
(« Administrateur E2E ») et avatar `.flex-none` de la barre du haut. Preuves :
`a11y/matrix-chromium-20261028-223754-axe-p1-accueil.json` à `p7-reglages.json`,
idem `matrix-webkit-…`.

### BUG-JIR-031 — Des noms accessibles ne reprennent pas le texte visible

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** ouvert, ticket JIR-129
- **Fonctionnalité :** barre latérale (compteurs), déclencheurs Radix, tiroir, Le point (personnes)

axe-core, règle `label-content-name-mismatch` (WCAG 2.5.3), impact serious,
sept pages, Chromium et WebKit : « Tous les items 32 » pour un lien dont le
texte visible est « Tous les items » suivi d'un badge, menus de la barre
latérale et de la barre du haut, bouton de titre du tiroir, bouton d'une
personne de Le point (nom et puce visibles, `aria-label` différent). Mêmes
preuves que BUG-JIR-030.

### BUG-JIR-032 — Le conteneur des colonnes du board n'est pas atteignable au clavier

- **Gravité :** majeure
- **Priorité :** P1
- **Statut :** ouvert, ticket JIR-130
- **Fonctionnalité :** board

axe-core, règle `scrollable-region-focusable` (WCAG 2.1.1), impact serious :
`.overflow-x-auto` défile horizontalement sans être focalisable. Preuve :
`a11y/matrix-chromium-20261028-223754-axe-p2-board.json`, idem WebKit.

### BUG-JIR-033 — À 200 %, la page Accès des réglages déborde horizontalement

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** ouvert, ticket JIR-131
- **Fonctionnalité :** réglages du backlog, onglet Accès

`e2e/matrix/zoom.spec.ts`, fenêtre 720 × 450 et police racine à 200 % :
`<main>` déborde de 52 px en Chromium et de 22 px en WebKit, reproduit à la
relance. Preuves : `screenshots/matrix-zoom-chromium-20261028-223754-zoom-p7-reglages.png`,
`runs/matrix-zoom-chromium-20261028-223754-junit.xml`, idem WebKit.

### BUG-JIR-034 — À 200 %, l'accueil des backlogs et la barre du haut deviennent illisibles

- **Gravité :** mineure
- **Priorité :** P2
- **Statut :** ouvert, ticket JIR-132
- **Fonctionnalité :** accueil des backlogs, barre du haut

Même mesure : la colonne du nom des backlogs disparaît et la clé se colle au
compteur (« CASS5 »), les en-têtes se touchent ; le champ de recherche de la
barre du haut est tronqué à une lettre. Le bouton « Créer » est jugé pas
entièrement dans la fenêtre sur le board et la liste (à vérifier), et le tiroir
ne s'ouvre pas à 200 % en WebKit (à investiguer). Preuves :
`screenshots/matrix-zoom-chromium-20261028-223754-zoom-p1-accueil.png`,
`…-zoom-p2-board.png`, `…-zoom-p3-liste.png`, JUnit des projets zoom.
