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

## Top bugs

1. [BUG-JIR-003](bugs.md#bug-jir-003--action-de-création-hors-écran-sur-mobile) — création inaccessible à 390 px, **P0**.
2. [BUG-JIR-006](bugs.md#bug-jir-006--le-panneau-de-détail-devient-illisible-sur-mobile) — détail écrasé en colonne de ~98 px, **P0 mobile**.
3. [BUG-JIR-007](bugs.md#bug-jir-007--les-actions-de-suppression-de-liens-sont-inaccessibles-au-clavier) — données impossibles à corriger au clavier, **P1**.
4. [BUG-JIR-005](bugs.md#bug-jir-005--une-description-trop-longue-est-rejetée-avec-une-erreur-générique) — limite de description invisible et erreur inexploitable, **P1**.
5. [BUG-JIR-001](bugs.md#bug-jir-001--le-raccourci-c-injecte-c-dans-le-titre) — raccourci `C` corrompt le titre, **P1**.

## Top problèmes UX

1. Le responsive est cassé sur les deux surfaces auditées : shell hors écran et panneau détail illisible.
2. Plusieurs actions critiques sont cachées au survol ou attachées à des éléments non interactifs.
3. Les erreurs de longueur sont génériques à la création comme à l'édition.
4. Le feedback des mutations n'est pas assez instantané ni stable pour inspirer confiance.
5. Le composeur minimal impose un enrichissement immédiat dans une surface détail elle-même peu accessible.

## Top améliorations produit

1. Construire un composeur adaptatif : titre et description au centre, propriétés configurables en chips, préremplissage depuis vue/colonne/parent.
2. Faire de la création clavier un avantage distinctif : raccourci fiable, palette de commandes, navigation sans souris, brouillons.
3. Permettre aux équipes de configurer modèles, champs visibles, champs requis et valeurs par défaut.
4. Ajouter une création continue (« créer un autre ») et une détection de doublons.
5. Concevoir un véritable shell mobile, pas seulement une version desktop débordante.
6. Repenser le détail autour des propriétés fréquentes, sections repliables, historique/diff et clavier complet.

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
