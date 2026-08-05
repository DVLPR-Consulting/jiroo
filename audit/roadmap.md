# Roadmap priorisée issue de l'audit

## État après remédiations des 4 et 5 août 2026

| Chantier | État | Preuve |
|---|---|---|
| Shell et détail mobile P0 | Terminé à 390 × 844 | Drawer 248 px, contenu 390 px, détail plein écran monocolonne |
| Raccourci de création P1 | Terminé | `C` consommé, titre vide et focus correct dans Chromium |
| Validation client/serveur P1 | Terminé sur titre/description | Constantes partagées, compteurs, erreurs Zod structurées et associées |
| Accessibilité du détail P1 | Terminé sur le périmètre observé | Dialogue Radix, `Escape`, focus restauré, renommage et retraits clavier |
| Feedback des propriétés P1 | Terminé sur les propriétés du détail | Optimisme immédiat, `aria-busy`, confirmation, rollback et protection contre prop périmée |
| Composeur enrichi P1 | Non commencé | Description, assigné, labels et échéance manquent toujours à la création |
| Fiabilité drag horizontal P0 | Corrigé, matrice longue restante | Dépôt desktop vers colonne vide correctement persisté après reload |
| Drag clavier accessible P1 | Corrigé dans Playwright | Snapshot restauré sur `Échap`, annonces françaises sans UUID ; NVDA/VoiceOver restant |
| Colonnes configurables P0 produit | Terminé sur le périmètre backlog-local | CRUD, ordre, couleur, invariants, migration occupée, activité stable et rôle lecteur prouvés |

Les sections ci-dessous conservent la roadmap issue de l'audit initial. Les cinq premiers chantiers corrigés ne doivent pas être confondus avec une validation globale du shell à tous les breakpoints ni avec une parité concurrentielle.

## P0 — Rendre le shell utilisable sur mobile

**Pourquoi :** la création et plusieurs contrôles critiques sont hors écran à 390 px.

**Livrable :** sidebar en drawer sous 768 px, toolbar adaptative, action primaire de création toujours visible, board contenu dans un scroller dédié ; panneau détail plein écran et monocolonne sur mobile.

**Acceptation :** Playwright à 320/390/768/1024 px ; aucune action critique hors viewport ; création réalisable en un geste ; panneau détail lisible/éditable ; pas de débordement global horizontal.

## P1 — Fiabiliser le raccourci de création

**Pourquoi :** chaque création au clavier commence avec un caractère parasite.

**Livrable :** consommation de l'événement, couverture Playwright réelle, raccourci documenté dans une palette.

**Acceptation :** `C` ouvre un titre vide ; aucune activation dans une zone éditable ; aucun effet avec modificateur ou dialogue ouvert.

## P1 — Unifier validation client et serveur

**Pourquoi :** les limites de 200 caractères pour le titre et 20 000 pour la description sont invisibles ; les erreurs serveur sont génériques.

**Livrable :** constantes partagées, compteurs, erreurs par champ, mapping Zod structuré, focus sur première erreur.

**Acceptation :** même message précis côté client et serveur ; `aria-invalid` et `aria-describedby` ; requêtes forgées couvertes.

## P1 — Rendre le panneau détail entièrement clavier et accessible

**Pourquoi :** le titre et les suppressions de liens sont inaccessibles au clavier ; `Échap` ne ferme pas ; le focus n'est pas géré.

**Livrable :** primitive Sheet/Dialog accessible, focus initial/restauration, fermeture `Échap`, titre éditable sémantique, actions de ligne accessibles au focus.

**Acceptation :** parcours complet titre → propriétés → relation → suppression → fermeture sans souris ; annonce lecteur d'écran ; aucune action `display:none` requise pour modifier les données.

## P1 — Stabiliser le feedback des mutations

**Pourquoi :** une mutation prend environ une seconde et une rafale peut sembler revenir à l'ancienne valeur pendant près de trois secondes.

**Livrable :** mise à jour optimiste cohérente, état `Enregistrement…`, file/annulation des mutations concurrentes, restauration en erreur et toast non détruit par refresh.

**Acceptation :** feedback visuel < 100 ms ; résultat serveur confirmé sans clignotement ; ordre final déterministe lors de changements rapides ; tests Playwright avec latence simulée.

## P1 — Enrichir le composeur sans l'alourdir

**Pourquoi :** description, assigné, labels et échéance exigent une seconde étape immédiate.

**Livrable :** description visible ; propriétés sous forme de chips ; configuration des champs visibles par backlog ; préremplissage depuis colonne, filtre et parent.

**Acceptation :** une tâche complète se crée sans rouvrir le panneau ; temps médian cible < 15 s au clavier.

## P2 — Faire des modèles un vrai système de formulaires

**Pourquoi :** les deux modèles sont utiles mais opaques avant soumission et non configurables dans le flux observé.

**Livrable :** prévisualisation/édition, modèles personnalisés, valeurs par défaut, champs requis, modèle par défaut par type/backlog.

**Acceptation :** l'utilisateur voit exactement le contenu créé ; validation des champs requis avant requête.

## P2 — Ajouter brouillons et création continue

**Pourquoi :** l'annulation efface le travail et les saisies en série sont lentes.

**Livrable :** brouillon local/persistant, confirmation à la fermeture, `Créer et continuer`, conservation du contexte pertinent.

**Acceptation :** interruption/navigation sans perte ; création de cinq items consécutifs sans rouvrir manuellement le modal.

## P2 — Renforcer la QA navigateur

**Pourquoi :** le test unitaire existant n'a pas détecté le caractère injecté ni le responsive cassé.

**Livrable :** suite Playwright desktop/mobile, collecte automatique console/réseau/captures en échec, matrices admin/contributeur/lecteur.

**Acceptation :** échec CI sur exception console, requête 4xx/5xx inattendue, débordement du shell ou divergence de permission.

## P2 — Repenser l'architecture du panneau détail

**Pourquoi :** la liste plate de propriétés ne passera pas à l'échelle avec champs personnalisés, cycles, estimations et intégrations.

**Livrable :** propriétés fréquentes près du titre, sections secondaires repliables, métadonnées statiques au footer, personnalisation par type/rôle et historique avec anciennes/nouvelles valeurs.

**Acceptation :** cinq propriétés principales atteignables sans scroll ; section adaptée à 30+ champs ; activité filtrable par commentaires, changements et transitions ; restauration de description.

## P3 — Différenciation produit

- détection de doublons/similarités avant création ;
- création via URL préremplie, API et intégrations ;
- création inline ultra-rapide depuis Liste/Arbre ;
- télémétrie anonyme du temps et des abandons de création pour décider du type/champs par défaut.

## Ordre recommandé

1. Mobile P0.
2. Accessibilité du panneau, raccourci et validation P1.
3. Feedback des mutations et composeur enrichi P1.
4. Architecture détail, modèles et brouillons P2.
5. QA navigateur P2 en parallèle de chaque livraison.

## Mise à jour prioritaire — incrément 03 du 5 août 2026

### P0 — Garantir que la colonne déposée est la colonne persistée

**Pourquoi :** le drag horizontal a enregistré `Terminé` alors que `En revue` était visée sur desktop, puis `En revue` alors que `En cours` était visée à 390 px. C'est une atteinte à l'intégrité métier, pas un défaut cosmétique.

**Livrable :** coordonnées corrigées par rapport au scroller, auto-scroll borné, cible stable et explicitement nommée, validation de cohérence avant mutation, alternative mobile par menu de statut.

**Acceptation :** matrice Playwright 390/768/1200 px, scroll nul/non nul, colonnes vides/remplies ; 50 dépôts consécutifs par cible sans divergence entre cible active, `statusId` envoyé et résultat après reload.

### P1 — Rendre annulation et annonces clavier fiables

**Pourquoi :** `Échap` peut laisser un faux statut local et le lecteur d'écran n'entend que des UUID en anglais.

**Livrable :** snapshot restauré sur annulation, annonces françaises métier, position dans la colonne, feedback distinct pour succès/annulation/rollback.

**Acceptation :** aucune requête sur annulation, DOM identique avant/après, aucune chaîne anglaise ou UUID dans `role=status`, validation VoiceOver/NVDA.

### P1 — Ajouter une voie sûre hors drag

**Pourquoi :** le drag est coûteux et fragile sur petit écran, et ne doit pas être l'unique geste rapide depuis le board.

**Livrable :** menu `Changer le statut` sur chaque carte, clavier et tactile, avec destinations autorisées et raisons de blocage.

**Acceptation :** changement en deux gestes maximum sur mobile, focus restauré, feedback optimiste/rollback identique au détail.

### P2 — Gouverner le flux

**Livrable :** limites WIP configurables, transitions/règles, undo après succès, historique et time-in-state.

**Acceptation :** dépassement WIP signalé avant dépôt, transition interdite expliquée, undo fiable, audit de chaque changement avec ancienne/nouvelle valeur.

## Ordre actualisé

1. Backlog produit et triage : priorisation, estimation, bulk edit et passage vers l'exécution.
2. Cycles/sprints, capacité et releases.
3. Hiérarchie, dépendances et progression d'epic.
4. Filtres/groupements/vues enregistrées et reporting.
5. WIP, règles de workflow, undo et time-in-state.

## Mise à jour prioritaire — incrément 04 du 5 août 2026

### P0 — Rendre les colonnes configurables par backlog

**État : terminé et vérifié par Playwright le 5 août 2026.**

**Pourquoi :** les quatre statuts sont imposés et aucune équipe ne peut adapter
Jiroo à son processus réel. La gestion de produit de bout en bout est bloquée.

**Livrable :** création, édition, catégorie, couleur, ordre et suppression sûre
d'un statut/colonne ; migration transactionnelle des items ; action `Colonnes`
directement sur le board ; administration réservée au rôle admin.

**Acceptation :** cycle complet vérifié par Playwright et après rechargement,
propagation à toutes les vues, aucune perte d'item, permissions UI et serveur,
console/réseau propres.

### P1 — Ajouter la gouvernance de workflow

**Livrable :** transitions permises, conditions simples, raison visible d'un
refus, WIP et Definition of Done.

**Acceptation :** le board explique avant le dépôt pourquoi une transition est
interdite et ne permet aucune divergence entre UI, serveur et reporting.

### Ordre fonctionnel révisé

1. ~~Colonnes/statuts configurables et sécurité des migrations~~ — terminé.
2. Backlog, cycles/sprints, estimations et releases — prochaine priorité.
3. Hiérarchie, dépendances et exécution multi-utilisateur.
4. Reporting, recherche, notifications et intégrations.
5. Responsive et performance transverses en fin d'audit.

## Mise à jour prioritaire — incrément 05 du 5 août 2026

### P0 — Transformer la Liste en backlog planifiable

**État : fondation PR1 terminée et vérifiée ; `BUG-JIR-015` reste partiellement
corrigé jusqu’aux sprints/releases.** La vue dédiée, le rang persistant,
l’estimation nullable, la sélection multiple et les actions groupées sont
validés dans Chromium.

**Pourquoi :** une priorité catégorielle ne détermine pas l'ordre relatif du
travail. Sans rang et sans sélection multiple, le PM ne peut ni ordonner le
prochain sprint ni traiter efficacement un lot d'items.

**Livrable :** champ de rang persistant par backlog, vue `Backlog` dédiée,
réordonnancement souris/clavier, sélection par checkbox/plage/tout le résultat
filtré et bulk edit de statut, priorité, assigné, estimation, cycle et release.

**Acceptation :** ordre identique après reload et pour deux utilisateurs ; tris
temporaires sans destruction du rang ; déplacement clavier annoncé ; 100 items
sélectionnés et modifiés en une opération transactionnelle avec résumé d'impact
et rollback d'erreur.

### P0 — Ajouter estimation et cycles/sprints

**Livrable :** estimation activable par backlog avec échelle configurable,
cycles nommés et datés, backlog vs cycle actif, objectif, capacité, items non
estimés, démarrage/clôture et report explicite des items incomplets.

**Acceptation :** préparer un cycle, voir somme/capacité, démarrer, exécuter sur
le board, terminer et reporter/refuser chaque item restant ; activité et
historique cohérents après reload et concurrence.

### P0 — Ajouter releases/versions

**Livrable :** version avec nom, date cible et état ; affectation unitaire ou en
masse ; progression calculée ; vue des éléments prêts, terminés et bloqués ;
notes de release manuelles avant automatisation CI/CD.

**Acceptation :** créer une version, y planifier des items, visualiser sa
progression, la publier puis retrouver exactement ce qui a été livré.

### Quick wins avant le modèle complet

1. Afficher une colonne `Estimation` nullable et le filtre `Non estimé`.
2. Ajouter les checkboxes et une barre bulk limitée à priorité, statut et
   assigné sur les Server Actions existantes.
3. Nommer explicitement le DnD de l'Arbre `Déplacer sous…` pour éviter de le
   confondre avec un classement.
4. Renommer la vue actuelle `Liste des items` lorsque la future vue `Backlog`
   sera ajoutée.

### Ordre de réalisation recommandé

1. Rang persistant et réordonnancement accessible.
2. Sélection multiple et bulk edit.
3. Estimation et agrégats.
4. Cycles/sprints et capacité.
5. Releases/versions.
6. Reporting de vélocité, burndown et prévision après accumulation de données
   fiables.

### État de livraison après incrément 06

1. ~~Rang persistant et réordonnancement souris/clavier~~ — validé avec reload
   et rollback réseau.
2. ~~Sélection multiple et bulk edit~~ — statut, priorité, assigné et
   estimation validés, y compris sélection conservée en échec.
3. ~~Estimation nullable et agrégats de Backlog~~ — `5`, `0` et `null` validés
   dans le navigateur.
4. Cycles/sprints et capacité — non commencé.
5. Releases/versions — non commencé.

### Prochain incrément P0 — sprints et capacité (PR2)

**Ordre impératif :** modèle de sprint → planification → démarrage → board actif
→ clôture/report. Aucun sprint parallèle en V1.

**Livrable :** nom, objectif, dates, capacité, état planifié/actif/terminé,
affectation unitaire et bulk, somme des points, items non estimés, confirmation
de démarrage et choix explicite pour chaque item incomplet à la clôture.

**Acceptation Playwright :** créer un sprint, y placer des tâches du Backlog,
vérifier capacité et dépassement, démarrer, constater que le board n’affiche que
le sprint actif, terminer, reporter/refuser les incomplets, puis retrouver le
même état après reload avec activité, console et réseau propres.

### Note produit pour un incrément ultérieur — dépôts et pull requests

Ajouter une intégration de dépôt GitHub/GitLab permettant de connecter un ou
plusieurs repositories au backlog, de lier automatiquement une PR à un item via
sa clé (`CASS-123`) ou manuellement, puis d'afficher branche, auteur, état de la
PR, reviews, checks CI, merge et déploiement. Cette intégration devra alimenter
l'activité de l'item et les releases sans considérer `Done` comme synonyme de
« livré ».
