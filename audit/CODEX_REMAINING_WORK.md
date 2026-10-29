# JIR-136 — Travail restant après contre-audit

Date : 29 octobre 2026. État du code : `188f93c`. Les correctifs sont uniquement locaux ; la revue Claude, la PR, la CI, la fusion et le déploiement ne sont pas réalisés par Codex.

## Priorité 1 — JIR-138 : identité historique stable

**Constats CA-10 et CA-11, importants, non corrigés.** JIR-138 a été créé par Claude et lié à JIR-136 ; son périmètre comprend le renommage de clé et la tolérance aux participants purgés. Décision explicite de Claude : aucun changement de schéma, garde de renommage ou garde de purge dans ce lot.

### Ce qui bloque

- Changer la clé d'un backlog réécrit `items.key` mais pas les événements immuables ; la clôture vérifie une égalité de clé modifiable et les rapports groupent par cette clé.
- Purger un participant actif détruit son appartenance (`sprint_items.item_id ON DELETE CASCADE`) et annule les références UUID du registre. Les informations de départ nécessaires ne sont pas garanties récupérables. La clôture échoue après une opération pourtant autorisée.
- Une normalisation seulement fondée sur les UUID actuels ne survit pas à leur mise à NULL après purge. Une correction partielle rétablirait le cas courant tout en rompant la stabilité promise des rapports terminés.

### Conception recommandée, à faire valider

1. Porter une identité historique UUID indépendante des FK dans `sprint_events` et `sprint_report_items` ; séparer cette identité de la clé/titre affichés.
2. Préparer une migration et une reprise pour les lignes dont les sources existent encore. Respecter les triggers d'immutabilité par une procédure de migration explicite, sans réécriture ordinaire de l'historique.
3. Définir avec le propriétaire le comportement des sources déjà purgées : cas récupérables sans ambiguïté, indisponibilité historique ou erreur explicite ; aucune invention d'estimation ou d'état done.
4. Revoir l'unicité `sprint_report_items_snapshot_key_idx`, les contrôles de clôture, groupements des rapports et adaptateurs de replay. Conserver les libellés figés, mais construire les liens navigables avec l'identité courante lorsqu'elle existe.
5. Décider si les anciennes clés deviennent des alias, conformément à la piste Jira retenue, et préciser le contrat documentaire.
6. Amender la spécification validée avant implémentation ; aucune approbation de conception n'est inférée de la création du ticket.

Tests attendus : événement avant/après renommage ; renommages successifs ; retrait/réajout ; ajout après démarrage ; deux items distincts sans fusion ; clôture après renommage ; suppression douce puis purge avant clôture donnant un instantané avec retrait `deleted` et aucun lien ; rapport terminé stable après renommage, mutation et purge ; données historiques manquantes ; immutabilité des lignes et exactitude des pages d'événements. Les causes lifecycle à delta nul restent distinctes et présentes.

**Déblocage :** plan et contrat de reprise validés par le propriétaire dans Linear. **Travaux indépendants :** revue et intégration des neuf correctifs d'audit.

## Priorité 1 — Suppression d'une tâche planifiée : règle à arbitrer

**CA-12, important, comportement DB confirmé.** Une appartenance planifiée reste après suppression douce ; `startSprint` exclut la tâche mais compare sa cardinalité à toutes les appartenances, puis échoue. La restauration est une issue actuelle, mais elle ne tranche pas le contrat fonctionnel voulu.

Proposition transmise par Claude : retirer aussi les tâches supprimées des sprints planifiés, sans réadhésion automatique à la restauration, comme pour les actifs. Cette règle n'est pas implémentée dans ce lot ; elle doit être validée et suivie dans un ticket proportionné, sans identifiant inventé ici.

Tests attendus après arbitrage : tâche seule supprimée ; suppression d'un ancêtre ; restauration sans réadhésion implicite ; affectation explicite ultérieure ; démarrage d'un sprint ne contenant plus que des tâches supprimées ; transaction et journal cohérents.

## Priorité 2 — Validations restant distinctes

- Relire le diff local et les trois livrables, ouvrir une PR, vérifier la CI avant intégration. Les mesures locales ne prouvent ni fusion, ni déploiement, ni validation fonctionnelle par un utilisateur.
- Conserver le suivi des limites d'accessibilité/matrice déjà reconnues (JIR-128 à JIR-135, Firefox indisponible sur le poste utilisé précédemment, lecteur d'écran manuel, parcours de zoom) ; les dix E2E de permissions ne remplacent pas cette matrice.
- Le titre long mobile de Le point reste un défaut produit déjà documenté lors de JIR-134 ; il n'est pas corrigé dans ce contre-audit.
- Mesurer au besoin la charge DB combinant 1 000 participants et 10 000 événements. Le benchmark pur combiné est rapide sur ce poste ; les tests DB séparés de volume ne constituent pas une mesure de cette charge combinée en production.
- Les lecteurs de détail chargent encore des appartenances de sprint et des associations de versions à l'échelle du backlog. Piste lue statiquement, sans lenteur reproduite : ne pas annoncer un défaut de performance confirmé sans mesure.
- Les lecteurs administratifs de hints, dont `readBacklogAccess`, restent des lectures de plusieurs requêtes hors snapshot répété ; les mutations recontrôlent dans leur transaction. Les entrelacements de révocation et de mutation, ainsi que restauration/reparentage, ne sont pas exhaustivement prouvés par cet audit.
- Sauvegarde/restauration, rotation des secrets, charge soutenue et environnement déployé n'ont pas été évalués.

## Discipline des essais et limites des preuves

La première suite DB sans seed a échoué sur les prérequis : ce n'est pas une preuve de défaut produit. Le garde E2E exige une base nommée `jiroo_e2e` et un consentement explicite ; il a été testé sur cette base dédiée, sans assouplissement du garde. Des passages intermédiaires ont ensuite révélé les fragilités de fixtures CA-08/CA-09, corrigées et rejouées.

La sonde de renommage a été arrêtée après deux erreurs de préparation des options du lecteur : CA-10 repose sur la chaîne statique précise et la confirmation métier de Claude, pas sur une exécution DB prétendument réussie. Les sondes suppression planifiée et purge active ont, elles, exécuté les services et confirmé leurs erreurs. Aucun test rouge temporaire n'est laissé dans le dépôt.

Les scores anciens du premier audit et les passages historiques de `audit/README.md` ne sont pas recalculés. La présente contre-expertise ne prétend pas que tout le code ou toutes les fonctionnalités de Jiroo sont désormais sans défaut.
