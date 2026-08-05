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

## Diagnostics non classés comme bugs

- Deux `POST /api/auth/two-factor/verify-totp` ont répondu `401 UNAUTHORIZED` lors de codes TOTP invalides générés par l'audit. Le troisième code, validé dans l'application d'authentification, a répondu 200. Le blocage et le message `Code invalide. Réessayez.` sont attendus.
- La capture locale `BUG-JIR-001-2fa-activation-failure.png`, produite avant la validation humaine, est conservée hors Git car elle contient un QR TOTP, une clé manuelle et des codes de récupération. Elle **n'est pas un bug indexé** et ne doit jamais être publiée.
- Chromium a émis un diagnostic DOM : le formulaire de confirmation du mot de passe 2FA ne contient pas de champ username associé. Impact probable : autofill et gestionnaires de mots de passe moins fiables. Correction : fournir un champ e-mail/username associé, éventuellement visuellement masqué, avec les bons attributs `autocomplete`.
- Aucune exception JavaScript et aucun échec HTTP inattendu n'ont été observés pendant le parcours nominal de création.
- L'URL de développement invalide `https://example.com/not-github` a bien produit `{ ok:false, error:"URL GitHub invalide." }` et un toast visible pendant environ quatre secondes. Les artefacts [requête](network/BUG-JIR-004-invalid-development-link-request.txt), [réponse](network/BUG-JIR-004-invalid-development-link-response.txt) et [capture tardive](screenshots/BUG-JIR-004-invalid-github-url-no-feedback.png) sont conservés, mais **BUG-JIR-004 n'est pas classé comme bug**.
- Aucun échec HTTP inattendu ni exception JavaScript n'a été observé pendant l'édition nominale. Les `401` TOTP visibles dans le journal cumulé proviennent des essais invalides de l'incrément 01, pas de l'édition d'item.

Journaux : incrément 01 [console](console/2026-08-04-session-01-console.log) / [réseau](network/2026-08-04-session-01-requests.log) ; incrément 02 [console](console/2026-08-04-session-02-console.log) / [réseau](network/2026-08-04-session-02-requests.log).

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
