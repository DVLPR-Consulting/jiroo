# Jiroo — dossier de préparation Linear

**RÉCONCILIATION DOCUMENTAIRE ATTESTÉE — compléments de suivi encore à vérifier.**

État observé le **2 octobre 2026**. Ce fichier est une file de synchronisation
temporaire, pas une seconde base de pilotage. Les règles durables sont dans
[project-governance.md](project-governance.md). Les contenus préparatoires sont
conservés comme trace de l'état initial ; ils ne sont plus une demande de création
ou de réimport des éléments publiés. Les documents Linear liés ci-dessous portent
le pilotage courant. Ne pas maintenir ces préparations comme une version parallèle.

## Réconciliation du 2 octobre 2026

Source : identifiants et demande vérifiés par Claude (note de travail non versionnée, reprise dans `project-governance.md`).
Claude indique avoir écrit puis relu les éléments via le MCP Linear officiel.
Codex réconcilie les deux fichiers locaux sur instruction du propriétaire, sans
revendiquer une vérification distante indépendante ni effectuer d'écriture Linear.

| Entrée | État de réconciliation | Référence |
| --- | --- | --- |
| Identité workspace / équipe / cinq projets | **Réconciliée**, selon vérification de Claude | DVLPR, équipe Jiroo `JIR`, projets P-JIR-33 à P-JIR-37 ; identifiants et liens dans [les règles communes](project-governance.md#identité-et-points-dentrée) |
| Vue d'ensemble du projet | **Réconciliée**, publication et relecture attestées par Claude | [Document Linear](https://linear.app/dvlpr/document/vue-densemble-du-projet-661ca1241419) |
| Plans et décisions du projet | **Réconciliée**, publication et relecture attestées par Claude | [Index Linear](https://linear.app/dvlpr/document/plans-et-decisions-du-projet-0cfa00e87cc8) |
| Plans et spécifications historiques | **Réconciliés**, 48 documents importés intégralement et relus selon Claude | Liste, liens et métadonnées dans l'index Linear ; l'inventaire initial de 46 fichiers est conservé plus bas |
| Fonctionnement de l'équipe Jiroo | **Réconcilié** pour les identifiants, statuts et définition de Done rapportés | [Document Linear](https://linear.app/dvlpr/document/fonctionnement-de-lequipe-jiroo-19b2eac24447) ; comparaison exhaustive du contenu distant non effectuée par Codex |
| Intégration native GitHub ↔ Linear | **Non vérifiée**, non vérifiable via le MCP selon Claude | Ne pas supposer de liaison ou de transition automatique |

Le relevé rapporte **48 documents importés** ; l'inventaire préparatoire ci-dessous
porte sur **46 fichiers locaux**. Ces deux décomptes ne sont pas assimilés : le
relevé ne détaille pas ici la correspondance des deux entrées supplémentaires.
La liste distante fait référence ; ne pas inventer deux fichiers ou deux liens,
ni réimporter les 46 sources pour résoudre cette différence de comptage.

Les plans importés portent source, dates, état, livraison, décisions, questions
et versions liées. **La spécification burndown versionnée reste autoritative
jusqu'à clôture du chantier**, conformément à la hiérarchie conservée par Claude.
Les originaux et l'inventaire sont conservés ; aucune suppression ni archive.

## Accès, identité et limites

- Dépôt vérifié par Git et GitHub : <https://github.com/DVLPR-Consulting/jiroo>.
- Le nom du produit est **Jiroo**. `CASS` et `LABS` sont des backlogs de
  l'application/des fixtures ; ils ne prouvent pas l'identité d'une équipe Linear.
- Workspace vérifié par Claude : **DVLPR**, ID
  `f920de06-af47-4dd9-9118-b53ad1fe4f8f`. Équipe **Jiroo**, préfixe `JIR`, ID
  `42c9ba62-dfea-48ef-affc-296c093cd6d5`, créée par le propriétaire le 2 octobre.
  L'équipe porte cinq projets, et non un projet unique pour tout le dépôt.
- Linear est accessible côté Claude via le MCP officiel
  `https://mcp.linear.app/mcp` ; les créations et relectures documentaires sont
  attestées. Cela ne rend pas automatiquement les mêmes outils accessibles dans
  cette session Codex, dont cette intervention reste strictement locale.
- Workflow réel : **Backlog, Todo, In Progress, In Review, Done, Canceled,
  Duplicate**, non modifié. **Done = PR fusionnée + vérifications** ; déploiement
  et validation suivis séparément. Groupe workspace **Type** (`Feature`, `Bug`,
  `Improvement`, `Chore`, `Tests`, `Décision produit`) partagé et non modifié ;
  label d'équipe **Idée**.
- Les capacités nécessaires aux documents sont attestées côté Claude. Ne pas en
  déduire des permissions sur les accès, paramètres partagés ou automatisations.
- GitHub est accessible en lecture par `gh`. La liste des webhooks propres au
  dépôt est vide ; cela **n'exclut pas** une GitHub App installée au niveau de
  l'organisation. L'intégration native Linear, ses règles de liaison et les
  transitions automatiques restent **non vérifiées**.
- Codex n'a effectué aucune mutation distante dans cette réconciliation. Les
  publications de Claude sont distinguées dans le tableau ci-dessus ; les liens
  ticket/PR et jalons non détaillés dans son relevé ne sont pas déclarés vérifiés.

**Blocage initial levé côté Claude :** identité et publications sont désormais
connues. Pour une future écriture depuis Codex, vérifier son accès et relire
l'élément distant dans le bon projet. Ne pas redemander au propriétaire d'identifier
une équipe ou des documents déjà vérifiés dans le relevé.

## Plan de cette mise en place

**Objectif :** rendre la reprise possible depuis Linear et Git, avec une autorité
explicite pour chaque information et des règles identiques pour tous les agents.
**Périmètre :** organisation documentaire, recensement et transfert fidèle des
plans pertinents, rapprochement tickets/PR et instructions persistantes.
**Exclusions :** fonctionnalités, changements de périmètre produit, engagements,
droits, paramètres globaux, suppressions/archives, fusion, déploiement et messages
à des tiers.

**État : documentation réconciliée ; compléments de suivi ci-dessous à vérifier.** L'autorisation
vient de la demande explicite du propriétaire du 2 octobre 2026 dans la session
Codex. Elle valide cette mise en place, pas les idées produit recensées.

1. Inspecter instructions, docs, plans, Git et PR — effectué dans le périmètre
   recensé ci-dessous. Ne pas confondre inventaire et revue de chaque ancien plan.
2. Identifier workspace/équipe/projets et conventions — effectué par Claude,
   reporté dans les règles communes. Le détail des tickets et jalons n'est pas
   fourni dans le relevé ; le consulter dans Linear avant toute modification.
3. Réutiliser ou compléter « Vue d'ensemble du projet » et « Plans et décisions
   du projet » — **réconciliés**, publiés et relus par Claude ; préparations
   ci-dessous conservées comme historique.
4. Transférer les plans complets pertinents, avec leurs preuves de validation et
   leur hiérarchie — **réconciliés**, 48 documents importés intégralement selon
   Claude. Rapprochement ticket/PR à consulter dans l'état distant, sans supposer
   qu'il manque ni créer de tâches historiques en doublon.
5. Persister les règles communes et leurs références depuis les deux fichiers
   d'instructions — effectué localement ; identifiants, points d'entrée et
   workflow reportés dans `project-governance.md` depuis le relevé de Claude.
6. Relire les éléments distants et vérifier contenu, relations et sources ;
   actualiser ce dossier et laisser une prochaine action — relecture documentaire
   attestée par Claude ; Codex marque les entrées correspondantes réconciliées.
   Les relations non détaillées restent à vérifier, sans revendiquer une nouvelle
   relecture distante par Codex.

**Critères de validation :** identité distante vérifiée ; deux points d'entrée
réutilisables ; plans complets et états justifiés ; liens tickets/PR sans
doublons ; absence de transfert implicite d'autorité ou de changements de
périmètre ; instructions lues par les deux agents ; limites et suite explicites.

## Vue d'ensemble du projet

**Réconciliée le 2 octobre 2026 selon Claude.** Référence courante :
[Vue d'ensemble dans Linear](https://linear.app/dvlpr/document/vue-densemble-du-projet-661ca1241419).
Le contenu ci-dessous conserve les observations de la préparation initiale ; les
états GitHub qu'il rapporte n'ont pas été réinterrogés lors de cette mise à jour.

### But et utilisateurs

Jiroo est un gestionnaire de tickets en français, inspiré des usages importants
de Jira, destiné à une équipe de la Cour de cassation. Il vise un suivi du travail
hiérarchisé, traçable et lisible, sans ajouter une configuration générale
inutile. Le dépôt et les spécifications décrivent un hébergement de test
Vercel/Neon et une cible interne souveraine ; l'environnement réellement déployé
reste à vérifier, sans l'inférer d'un document ou d'un badge de CI.

### Périmètre observé et exclusions

Les PR fusionnées et `main` contiennent le socle authentification/2FA,
administration, backlogs et items hiérarchiques, vues Board/liste/arbre, filtres
et vues sauvegardées, commentaires/mentions/notifications, recherche, corbeille,
liens, modèles, colonnes configurables, sprints, schémas de permissions et noyau
Releases. Le rapport de sprint et la vélocité sont également présents dans
l'historique de `main`. Cela décrit le code intégré, **pas une recette ou un
déploiement actuellement vérifiés**.

Le burndown complet est implémenté sur la branche locale et dispose de preuves
de revue et d'acceptation ; aucune PR correspondante n'est recensée sur GitHub.
`main` ne contient que son checkpoint partiel du 17 août. Les notes qui le
qualifient de « livré » ne doivent pas être interprétées comme une preuve de
fusion ou de mise en production.

Exclusions explicites de l'incrément burndown : prévision probabiliste ou date de
release, time tracking/calendrier de jours ouvrés, reconstruction fiable des
historiques incomplets, remplacement de la capacité manuelle, Releases PR2 et
intégration de readiness dépôt/PR/déploiement.

### Références techniques

- [Dépôt GitHub](https://github.com/DVLPR-Consulting/jiroo) ;
  [PR du dépôt](https://github.com/DVLPR-Consulting/jiroo/pulls).
- [README technique](../README.md), [schéma et migrations](../lib/db),
  [code applicatif](../app), [services](../lib/services).
- [Spécifications historiques](superpowers/specs),
  [plans d'implémentation historiques](superpowers/plans),
  [preuves et audits](../audit/README.md).
- Pour publication Linear, convertir les liens techniques relatifs en liens
  GitHub vers la version pertinente réellement accessible. Un fichier non poussé
  ne reçoit pas un lien GitHub supposé exister. Les anciens plans ignorés par Git
  ont été importés intégralement selon le relevé de Claude.

### Travaux en cours et prochaines priorités

| Chantier | État vérifié / connu | Prochaine action, sans autorisation implicite |
| --- | --- | --- |
| Mise en place Git/Linear | Identité et publications documentaires réconciliées sur le relevé de Claude ; règles locales complétées | Préparer la PR séparée décidée par le propriétaire lors d'une intervention autorisée ; consulter les relations distantes restantes |
| Burndown et prévisibilité | HEAD local `ccbbe092b26befec54e8237f3f573322cdfd4759`, branche `feat/burndown-planning-predictability`, sans upstream ; aucune PR trouvée ; revue locale du 1er octobre « PR-ready », réserve mineure R4 | Rattacher au ticket existant, conserver les preuves, décider de la suite d'intégration dans une intervention autorisée |
| Dépendances et inscription publique | [PR #32](https://github.com/DVLPR-Consulting/jiroo/pull/32) ouverte, head `0232e51d34672b84c9c8cf622cafef80ef1d4098`, aucune décision d'approbation renvoyée | Rapprocher du ticket et lire les reviews/contrôles avant toute décision ; pas de fusion autorisée |
| Releases PR2 | Prévu par le design Releases ; pas de PR correspondante dans les 32 PR recensées | Vérifier plan, validation et tickets avant d'engager l'exécution |
| Validation complémentaire | Priorités citées dans le dernier addendum d'audit : Firefox/WebKit, breakpoints, zoom 200 %, VoiceOver/NVDA, volumétrie et concurrence | Préciser les résultats attendus avec les tickets existants ; aucune échéance ou urgence inventée |

La PR #32 annonce tests et build dans son corps et expose deux contrôles Vercel
réussis ; ce sont des **preuves rapportées par GitHub**, non réexécutées ici.
Son corps dit que les Git builds Vercel restent suspendus et qu'aucun déploiement
staging/production n'est inclus. Ne pas déduire une livraison du seul statut vert.
Les assertions de vulnérabilité de cette PR ne constituent pas une nouvelle
évaluation de sécurité dans cette intervention.

### Décisions établies et questions ouvertes

- Instruction explicite du propriétaire : Linear pour le pilotage et les plans,
  Git pour le code/docs techniques, GitHub pour les PR/reviews/CI ; règles communes
  persistantes pour les agents.
- Décision burndown explicitement validée dans la session de revue et le handoff :
  `sprint_started` et `sprint_completed` sont des événements exacts à delta nul,
  avec leur propre cause et validation des bornes ; ni alias `start` ni filtrage
  des pages alignées.
- Le label « Engagement » d'un sprint actif affiche actuellement le périmètre
  estimé courant. La proposition de distinguer engagement initial et périmètre
  actuel reste une **question produit ouverte**, pas une modification approuvée.
- La moyenne récente d'un sprint terminé peut inclure ce sprint selon le contrat
  actuel accepté en revue ; la clarification du libellé reste possible. Ne pas
  transformer cette clarification en changement de calcul sans décision.
- R4 de la revue du 1er octobre : le filtre des erreurs E2E attendues peut masquer
  un en-tête de cookie. Réserve mineure non bloquante du harnais ; aucun nouveau
  défaut produit démontré. À rapprocher d'un ticket existant, sans déclarer un
  incident de sécurité.
- Des instructions générales anciennes disent « statuts/RBAC non configurables »
  alors que des spécifications ultérieures et les PR #26/#30 ajoutent des colonnes
  et schémas de permissions. Ne pas importer la phrase historique comme exclusion
  absolue actuelle ; conserver les décisions spécifiques et signaler les zones
  qui demandent encore arbitrage.

## Plans et décisions du projet

**Réconciliés le 2 octobre 2026 selon Claude.** Référence courante :
[Plans et décisions dans Linear](https://linear.app/dvlpr/document/plans-et-decisions-du-projet-0cfa00e87cc8),
avec liste et liens des 48 documents importés intégralement. La table ci-dessous
est l'inventaire préparatoire conservé, pas une seconde version de cet index.

Les états ci-dessous séparent **validation déclarée dans une source**, **preuve
d'intégration** et **validation opérationnelle à confirmer**. Une PR fusionnée ne
certifie pas que toutes les étapes d'un ancien plan ont été exécutées. Les tickets
Linear associés sont à consulter dans l'index courant ; leurs identifiants ne sont
pas fournis dans ce relevé. Les mentions « à rechercher » de l'inventaire initial
ne prouvent pas leur absence actuelle.

| Chantier | Plan/spec de référence locale | État et preuve | Tickets / versions |
| --- | --- | --- | --- |
| Vision et socle, lots 0–11 | `.claude/output/plans/2026-06-02-jiroo-design.md` et plans détaillés inventoriés plus bas | Source déclare une validation au 2 juin ; PR #1–18 fusionnées (dont cleanup #4), sans revalidation de chaque clause ici | Documents réconciliés dans Linear ; originaux locaux conservés et ignorés par Git ; tickets à consulter dans l'index |
| Modèles et liens GitHub futurs | `.claude/output/plans/2026-06-05-jiroo-future-features-notes.md` | Notes d'idées, pas un engagement global ; MVP liens manuels [#19](https://github.com/DVLPR-Consulting/jiroo/pull/19) et modèles [#20](https://github.com/DVLPR-Consulting/jiroo/pull/20) fusionnés ; automatisation complète non déduite | Distinguer MVP exécuté et idées restantes |
| Finalisation D2–D5 | `docs/superpowers/specs/2026-08-03-jiroo-completion-design.md` + quatre plans D2–D5 | Spec déclare « validé » ; D2 [#22](https://github.com/DVLPR-Consulting/jiroo/pull/22), D3 [#23](https://github.com/DVLPR-Consulting/jiroo/pull/23), D4 [#24](https://github.com/DVLPR-Consulting/jiroo/pull/24) fusionnées ; clôture D5/audit global à rapprocher des preuves, pas déduite | Fidélité D1 [#21](https://github.com/DVLPR-Consulting/jiroo/pull/21) distincte |
| Sidebar et autorité URL | Specs/plans du 4 août `sidebar-collapse`, `url-authority-reactivity` | Sidebar déclare « Approved for implementation » ; commits référencés à vérifier pour l'état complet ; pas de PR distincte affirmée | Conserver les liens aux chantiers shell/vues |
| Remédiation audit P0/P1 | Spec/plan du 4 août `audit-p0-p1-remediation` | Revue de spec déclarée ; [PR #25](https://github.com/DVLPR-Consulting/jiroo/pull/25) fusionnée | Audit technique reste dans Git |
| Colonnes configurables et DnD | Spec/plan du 5 août `configurable-columns-and-dnd` | Validation en conversation déclarée dans la source ; [PR #26](https://github.com/DVLPR-Consulting/jiroo/pull/26) fusionnée | Remplace une partie du périmètre statique initial |
| Backlog et bulk | Spec `2026-08-05-jiroo-jira-like-backlog-sprints-design.md`, plan `backlog-foundation`, handoff du 5 août | Spec : orientation produit approuvée, revue écrite encore brouillon ; [#27](https://github.com/DVLPR-Consulting/jiroo/pull/27) et [#28](https://github.com/DVLPR-Consulting/jiroo/pull/28) fusionnées | Ne pas transformer « orientation approuvée » en approbation de chaque détail |
| Sprints et capacité | Spec/plan du 5 août `sprints-capacity` | Source déclare approbation le 5 août ; [PR #29](https://github.com/DVLPR-Consulting/jiroo/pull/29) fusionnée | Dépend du Backlog |
| Schémas de permissions | Spec/plan du 6 août `unified-permission-schemes` | Validation en conversation déclarée ; [PR #30](https://github.com/DVLPR-Consulting/jiroo/pull/30) fusionnée | Plan de sûreté E2E `2026-08-06-task9-round3-e2e-safety.md` lié, pas nouveau chantier produit |
| Releases noyau / PR2 | Spec du 7 août `jira-like-releases-versions`, plan `jira-like-releases-core` | Design déclare validation en deux PR avec revue écrite en attente ; noyau [#31](https://github.com/DVLPR-Consulting/jiroo/pull/31) fusionné ; PR2 non exécutée d'après le dernier audit, à confirmer dans Linear | PR2 : fusion, suppression/transfert, ordre, notes et travail connexe ; ne pas étendre depuis une simple priorité d'audit |
| Rapports et vélocité | Spec/plan du 7 août `sprint-report-velocity` | Spec approuvée pour planification selon la source ; commits `1acd42f` à `a55d9df` présents dans `main` ; pas de PR dédiée recensée | Run `sprint-reports-final` référencé dans Git ; déploiement non vérifié |
| Burndown et prévisibilité | Spec du 8 août, plan du 9 août, handoff du 17 août | Spec explicitement donnée comme approuvée par le propriétaire lors de la revue ; plan exécuté localement selon code et preuves ; revue locale favorable, pas de PR ni fusion vérifiées | Handoff partiel dépassé pour l'avancement ; `final-3` est la preuve d'acceptation courante, `final`/`final-2` conservés et supplantés |

### Versions et contradictions à conserver

- Pour le burndown, le handoff du 17 août dit encore « Task 4 review pending » et
  « Tasks 5–8 not started ». Ce sont des faits de checkpoint ; les commits de la
  branche jusqu'à `ccbbe09` et l'audit final-3 constituent les preuves plus récentes.
- `main` distant vérifié : `451f632b6a3ed29726b8e2a9d28b4f3500b03e8e`, checkpoint du
  17 août 2026. La branche burndown locale ne doit pas être confondue avec `main`.
- `audit/roadmap.md` emploie « livré » pour le burndown. Conserver le document
  historique et qualifier dans le suivi : implémenté/vérifié localement, PR non
  ouverte ; déploiement et validation métier non vérifiés.
- `README.md` mentionne encore « Lot 1a » et le port local 5433. Le handoff du
  17 août utilise aussi 5433. La session de revue a explicitement interdit ce port
  occupé par un autre projet ; les tests ultérieurs rapportent 5434. Ne lancer
  aucune DB/reset depuis ces anciennes instructions sans vérifier cible et
  autorisation. Aucun test DB n'a été lancé pour cette mise en place.
- Ne pas modifier le périmètre des anciens plans pour les faire correspondre
  artificiellement au code actuel. Conserver version et divergence explicites.

## Reprise de la synchronisation

1. Utiliser l'équipe Jiroo et les projets déjà identifiés ; vérifier les capacités
   de la session courante et relire les documents liés avant toute écriture.
2. **Ne pas réimporter les entrées réconciliées.** Consulter l'index Linear pour
   les 48 documents, leurs sources et leurs versions ; rapprocher si nécessaire
   la correspondance avec les 46 fichiers de l'inventaire initial.
3. Pour un nouveau plan ou un écart réellement constaté, conserver le **contenu
   complet**, distinguer validation et exécution, préserver les décisions et les
   contributions récentes. Vérifier l'absence de données sensibles avant transfert ;
   garder les docs techniques versionnées dans Git et les référencer.
4. Vérifier les liens tickets/plans/PR existants avant de les compléter. Décomposer
   seulement les plans validés restant à exécuter ; les idées vont en clarification,
   sans inventer priorité, estimation, date ou responsable. Rechercher le ticket
   de cette mise en place avant toute création.
5. Vérifier les opérations natives de liaison et les transitions avant d'employer
   leurs conventions. Ne modifier aucun paramètre partagé ou accès.
6. Relire les documents/tickets après chaque nouvelle écriture et vérifier leurs
   liens. Le relevé ne fournit pas les URL/UUID de P-JIR-33 et P-JIR-34 : les
   relever dans Linear si nécessaires, sans les inventer. Rapprocher les en-têtes
   des copies locales des métadonnées distantes avant de les marquer comme exports ;
   cette intervention ne modifie pas les sources originales. Préserver l'autorité
   de la spec burndown versionnée jusqu'à clôture du chantier.
7. Préparer **une PR séparée** pour la gouvernance, conformément à la décision du
   propriétaire rapportée par Claude. Les fichiers sont actuellement non committés
   sur `feat/burndown-planning-predictability` ; cette intervention n'autorise ni
   commit ni push, ni ouverture de PR. Aucun changement produit n'est inclus.

## Vérification et passage de relais de cette intervention

La première préparation a modifié les instructions racine et ajouté ces deux
documents ; la présente réconciliation ne modifie **que**
`docs/project-governance.md` et `docs/linear-pending.md`.

- Fichiers modifiés : `AGENTS.md`, `CLAUDE.md`. Fichiers ajoutés :
  `docs/project-governance.md`, `docs/linear-pending.md`. Changements uniquement
  locaux, **non committés et non publiés**.
- Références locales vérifiées ; 46/46 empreintes d'inventaire recalculées et
  conformes ; `git diff --check` sans erreur ; aucune modification des sources
  historiques sous `docs/superpowers/` ou `.claude/output/plans/`.
- Modification préexistante de `package.json` conservée, sans l'inclure dans ce
  chantier. Aucun code produit, test, migration ou environnement modifié ; aucun
  test applicatif ou build exécuté pour cette modification documentaire.
- Aucune mutation Linear par Codex ; publications et relectures de Claude prises
  en compte explicitement. Les liens PR historiques sont conservés ; le relevé
  n'atteste pas leurs relations ticket par ticket, qui restent à consulter.
- Aucun écart identifié entre la définition de Done rapportée par Claude et les
  règles communes : fusion + vérifications, livraison et validation distinctes.
  Le texte distant intégral n'a pas été comparé par Codex ; signaler toute autre
  divergence à sa relecture au lieu de la résoudre silencieusement.
- Prochaine action : suivre les compléments de reprise ci-dessus et préparer la
  PR documentaire séparée lorsque cette action sera autorisée. Ne pas relancer la
  création des points d'entrée ou l'import des plans déjà réconciliés.

## Inventaire des sources complètes à réconcilier

**28 fichiers suivis dans Git, 18 fichiers historiques locaux ignorés par Git.**
Les entrées sont **RÉCONCILIÉES sur l'attestation de Claude du 2 octobre 2026** :
les plans de ces deux répertoires ont été copiés intégralement et relus dans Linear.
Le paquet de 48 documents et ses liens sont détaillés dans l'index distant. Codex
ne prétend pas avoir comparé individuellement chaque corps distant à son empreinte
locale. L'inventaire de 46 fichiers est conservé sans suppression ni ajout inventé.

Les empreintes identifient les entrées locales de la préparation du 2 octobre 2026 ;
elles ne sont pas des empreintes des documents Linear. Le contenu intégral des
originaux locaux reste conservé ; consulter la version distante avant de résoudre
un nouvel écart. Aucun contenu n'a été déplacé, supprimé ou archivé.

| Source complète | SHA-256 | Réconciliation |
| --- | --- | --- |
| [docs/superpowers/handoffs/2026-08-05-backlog-pr1-handoff.md](superpowers/handoffs/2026-08-05-backlog-pr1-handoff.md) | `02eeba02328928f7c696c55cfb0c9713c182a2ebde9fe47921a6c21c4304eb54` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-03-jiroo-d2-admin-implementation.md](superpowers/plans/2026-08-03-jiroo-d2-admin-implementation.md) | `973dd14444c7abfcd503c5d22dae9d3dd70237aad38036ca4e7e6e89cde62818` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-03-jiroo-d3-shell-implementation.md](superpowers/plans/2026-08-03-jiroo-d3-shell-implementation.md) | `db5bbc13b2991e1bdea227c1eca9772719d6bcf4b2d2d9a9d4445eb6bde9b5e2` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-03-jiroo-d4-views-implementation.md](superpowers/plans/2026-08-03-jiroo-d4-views-implementation.md) | `aa8f1b07f427c4ba5eb24ceba916302e148fd67879a129bc0988503e4941008e` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-03-jiroo-d5-finish-implementation.md](superpowers/plans/2026-08-03-jiroo-d5-finish-implementation.md) | `2ad24573f8f6bdf5e46e8d6b5ef7b4242d8d59ca7cd73a30d58997bf20baf0f3` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-04-jiroo-audit-p0-p1-remediation-implementation.md](superpowers/plans/2026-08-04-jiroo-audit-p0-p1-remediation-implementation.md) | `ad6b221d3893c931d82da66d5eb8e2dc99ef6e74cde8b0a0b0b8d13252a5743a` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-04-jiroo-sidebar-collapse-implementation.md](superpowers/plans/2026-08-04-jiroo-sidebar-collapse-implementation.md) | `5bbeeb7a0e69899d18c02605892ce87c7bc19ab19ba3116f2313f6f9ca3c323f` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-04-jiroo-url-authority-reactivity-implementation.md](superpowers/plans/2026-08-04-jiroo-url-authority-reactivity-implementation.md) | `e319c734e7563bb6e1c62b372e06eca148cf6d891b3ef8f4d3952fd9ccc80453` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-05-jiroo-backlog-foundation-implementation.md](superpowers/plans/2026-08-05-jiroo-backlog-foundation-implementation.md) | `6f2099b748c19efdd86c0c88752e102e0981ddeb77923ee2e46bff8c97c61687` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-05-jiroo-configurable-columns-and-dnd-implementation.md](superpowers/plans/2026-08-05-jiroo-configurable-columns-and-dnd-implementation.md) | `049805e8a40cbe6591980e218efd42b36a943873ae9bcacded35a1e3342265b6` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-05-jiroo-sprints-capacity-implementation.md](superpowers/plans/2026-08-05-jiroo-sprints-capacity-implementation.md) | `70b84816198291b52c16c88d94fb93a1c335de6a813ccc93dae773e850491b8c` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-06-jiroo-unified-permission-schemes-implementation.md](superpowers/plans/2026-08-06-jiroo-unified-permission-schemes-implementation.md) | `9e0957a18f411e9e318b118972c83a4147182c6248bf44b02efa9357c9e95ccc` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-06-task9-round3-e2e-safety.md](superpowers/plans/2026-08-06-task9-round3-e2e-safety.md) | `a9845a2172420cb5a166b2a66eaf67268f9563e16bdef260c25dba32f0f7be4d` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-07-jiroo-jira-like-releases-core-implementation.md](superpowers/plans/2026-08-07-jiroo-jira-like-releases-core-implementation.md) | `48d65e4e6c0a8b56915201f17063f0e7544d0eeb8c9e8a67b1ceaf7b7a8b9d4d` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-07-jiroo-sprint-report-velocity-implementation.md](superpowers/plans/2026-08-07-jiroo-sprint-report-velocity-implementation.md) | `bf98650159c5281bccd989950539f8df04c79d854f77eecaedc046ebab4474f4` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-09-jiroo-burndown-planning-predictability-implementation.md](superpowers/plans/2026-08-09-jiroo-burndown-planning-predictability-implementation.md) | `058cffc23b14f139611801615e08ea1a2cc94650af592d93dba0f6a83bdc7d96` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/plans/2026-08-17-jiroo-burndown-planning-predictability-handoff.md](superpowers/plans/2026-08-17-jiroo-burndown-planning-predictability-handoff.md) | `074578545fef26e42067a4362ec286033f135e2471da4765cb46ac166de56010` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-03-jiroo-completion-design.md](superpowers/specs/2026-08-03-jiroo-completion-design.md) | `b8ed000e55622e057a4c8d12e1add35773185304423a3fc9c77578de4005ca72` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-04-jiroo-audit-p0-p1-remediation-design.md](superpowers/specs/2026-08-04-jiroo-audit-p0-p1-remediation-design.md) | `3ed48412bc202be604143917bb87490b21aba8ec04a308feb1317d40e07042d5` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-04-jiroo-sidebar-collapse-design.md](superpowers/specs/2026-08-04-jiroo-sidebar-collapse-design.md) | `37a38bb42610b37fa662ca7de4ad3aecaa57eb6a60437387b05be3ea3dbe806a` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-04-jiroo-url-authority-reactivity-design.md](superpowers/specs/2026-08-04-jiroo-url-authority-reactivity-design.md) | `4d47e45cfab7318e096c7c8364aefd90ccf20c9d241f6df66fa60e16dd6933ce` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-05-jiroo-configurable-columns-and-dnd-design.md](superpowers/specs/2026-08-05-jiroo-configurable-columns-and-dnd-design.md) | `c400a2676ab715bed80e7f6338fd954c8487ccd4fb6feb844f77baa4ec8f7089` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-05-jiroo-jira-like-backlog-sprints-design.md](superpowers/specs/2026-08-05-jiroo-jira-like-backlog-sprints-design.md) | `32c76fb4fb027c6068b98c0d37ec43151995cd05634e31af42aed9d63c2457e2` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-05-jiroo-sprints-capacity-design.md](superpowers/specs/2026-08-05-jiroo-sprints-capacity-design.md) | `bd28d75aea648e924d374828a9621e398e19d908123a01764665da0d64588fce` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-06-jiroo-unified-permission-schemes-design.md](superpowers/specs/2026-08-06-jiroo-unified-permission-schemes-design.md) | `25c43805bae86dfe0094c7c91f8271d85920f541f1db0125b4a0cb716aeac6f2` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-07-jiroo-jira-like-releases-versions-design.md](superpowers/specs/2026-08-07-jiroo-jira-like-releases-versions-design.md) | `5203fe26bc85a4a848d903d01cb37ca9765eb496e3d151969387a9f88c76e506` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-07-jiroo-sprint-report-velocity-design.md](superpowers/specs/2026-08-07-jiroo-sprint-report-velocity-design.md) | `7ef0e58efa405c2213e66a1bb527b411f2f969305257e57cde247a4c7b98055a` | Réconciliée — attestation Claude, 2026-10-02 |
| [docs/superpowers/specs/2026-08-08-jiroo-burndown-planning-predictability-design.md](superpowers/specs/2026-08-08-jiroo-burndown-planning-predictability-design.md) | `1a5255e5f890a1696fb2ce73918bffcba678d1af8e2a76f73fa25f4a7357933a` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-02-jiroo-design.md](../.claude/output/plans/2026-06-02-jiroo-design.md) | `7876d6c2319aecf3cf3c62381ed2cdce637c2974389a16b41e59b5fcf7659ae2` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-02-jiroo-lot0-foundation-design-system.md](../.claude/output/plans/2026-06-02-jiroo-lot0-foundation-design-system.md) | `e020183da66e2b7e38943edc1b86bec12e6d1d64569cb86d9e14add77bd7fa4c` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-02-jiroo-lot1a-db-auth-core.md](../.claude/output/plans/2026-06-02-jiroo-lot1a-db-auth-core.md) | `3855339cfba06687458489db13028c0da76256cd0184e9e2c04f8c29b6e83551` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-02-jiroo-lot1b-2fa-auth-screens.md](../.claude/output/plans/2026-06-02-jiroo-lot1b-2fa-auth-screens.md) | `5d313f7ebb4346787603ac03028685cc2a0da9dad5fe9b6cae538efe19292b16` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot2-shell-backlogs.md](../.claude/output/plans/2026-06-03-jiroo-lot2-shell-backlogs.md) | `a0484736b0c391845bd26e39af36f176c8acc8844a058ff3bd0f436b91657cc8` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot3a-items-create.md](../.claude/output/plans/2026-06-03-jiroo-lot3a-items-create.md) | `ab889ee6bc85d45f11a2d8f59fdaaad2cd4586bdecb53573e16104ea1068826a` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot3b-detail-panel.md](../.claude/output/plans/2026-06-03-jiroo-lot3b-detail-panel.md) | `1810f1cd56ad77a7262bd24a6afaeceea7b23aa1cc2a09ef4d2f4d5d2f63f269` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot4-board-dnd.md](../.claude/output/plans/2026-06-03-jiroo-lot4-board-dnd.md) | `e3550bffb7e223e92273b776bfb891a7417c9c73314ccc1aa4171f6fd330b945` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot5a-filters-design.md](../.claude/output/plans/2026-06-03-jiroo-lot5a-filters-design.md) | `437692b34e0450dd50f432f9bdc690cd167feb9d40adc1985cce2fbc584ec2b7` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-03-jiroo-lot5a-filters-plan.md](../.claude/output/plans/2026-06-03-jiroo-lot5a-filters-plan.md) | `19c0ae1f84aa44ccee285a910b31f9ad45030fa9c87856759a4387b8aa7b71c2` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-04-jiroo-lot5b-views-design.md](../.claude/output/plans/2026-06-04-jiroo-lot5b-views-design.md) | `d4f727b2b3ccd166c31b68c8dafd21f30446bf54e516741f339f48d8d2fa1dac` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-04-jiroo-lot6-labels-mine-design.md](../.claude/output/plans/2026-06-04-jiroo-lot6-labels-mine-design.md) | `5ca4847c48c0099ba1c51cd40304ed7694f22c157c9a56cc7f9af3a15b6e7dd6` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-04-jiroo-lot7-comments-mentions-design.md](../.claude/output/plans/2026-06-04-jiroo-lot7-comments-mentions-design.md) | `14ab56a8db4115135f2c7400d669a345e4c57df596caa9274f2c493b261dfecf` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-04-jiroo-lot8-search-design.md](../.claude/output/plans/2026-06-04-jiroo-lot8-search-design.md) | `87114c9f482df603f0bd997fa5ef37dcc5a31117f28c36772992afa220b2a11f` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-04-jiroo-lot9-trash-toasts-design.md](../.claude/output/plans/2026-06-04-jiroo-lot9-trash-toasts-design.md) | `ab1034df6819a8c149a619f15a74cc3b2347ed5afa722c8e18071b54bc9470f6` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-05-jiroo-future-features-notes.md](../.claude/output/plans/2026-06-05-jiroo-future-features-notes.md) | `273fd72dc9702cd4246194955414a5d42380a68d8b3b95e5b4f194af13be2f4e` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-05-jiroo-lot10-relational-links-design.md](../.claude/output/plans/2026-06-05-jiroo-lot10-relational-links-design.md) | `d171a13663d8d57bafdc74f212591920f31bb829b25dd0a2c1f8f8bc1fc4ee90` | Réconciliée — attestation Claude, 2026-10-02 |
| [.claude/output/plans/2026-06-05-jiroo-lot11-item-kind-design.md](../.claude/output/plans/2026-06-05-jiroo-lot11-item-kind-design.md) | `d1b16af41f9c84f482ce2584875c03113e39f09ea853545c1c9cae9a82c5b792` | Réconciliée — attestation Claude, 2026-10-02 |
