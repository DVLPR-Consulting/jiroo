# Matrice navigateurs et accessibilité — run du 28 octobre 2026 (JIR-40)

Première exécution de la matrice définie par la stratégie JIR-40 (document
Linear « JIR-40 — Stratégie : matrice navigateurs et accessibilité »). Produit
mesuré : `282463d` (M2b), identique à `main` `025e1b3` pour le code applicatif.
Preuves : `runs/` (JUnit et manifestes inventoriés), `a11y/` (JSON axe),
`screenshots/` (zoom et échecs), `console/` et `network/` ; scan des secrets sur
494 fichiers sans signalement, 1 608 artefacts vérifiés par SHA-256.

## Environnement

| Élément | Valeur |
| -- | -- |
| Machine | macOS 27.0.1 (26A434), arm64, 18 cœurs, 64 Gio |
| Outils | Node 24.18.1, pnpm 10.34.5, Playwright 1.62.1 |
| Moteurs | Chromium 151.0.7922.34 ; WebKit 26.5 ; Firefox 153.0 installé mais **ne démarre pas** (JIR-133) |
| Base et serveur | PostgreSQL 17 jetable en tmpfs (port 5459), `next dev` Turbopack sur 3100, `JIROO_E2E_PERSIST_AUDIT=1` |
| Commande | `corepack pnpm test:e2e:matrix`, dix projets séquentiels, inventaire après chacun ; 48 min |

## Résultat par projet

| Projet | Fenêtre | Contenu | Verts | Rouges | Ignorés | Verdict |
| -- | -- | -- | --: | --: | --: | -- |
| matrix-chromium | 1440 × 900 | 36 specs + a11y + zoom | 94 | 76 | 20 | rouge, voir la lecture par spec |
| matrix-webkit | 1440 × 900 | idem | 98 | 66 | 26 | rouge, voir la lecture par spec |
| matrix-firefox | 1440 × 900 | idem | 0 | 0 | 0 | **non exécuté** (JIR-133) |
| matrix-chromium-1024 | 1024 × 768 | sous-ensemble P2, P3, P4, P6 | 67 | 14 | 0 | rouge, mêmes familles qu'à 1440 |
| matrix-chromium-768 | 768 × 1024 | idem | 67 | 14 | 0 | rouge, mêmes familles qu'à 1440 |
| matrix-webkit-768 | 768 × 1024 | idem | 71 | 9 | 1 | rouge, mêmes familles qu'à 1440 |
| matrix-zoom-chromium | 720 × 450, police 200 % | 7 pages clés | 3 | 4 | 0 | rouge : JIR-131, JIR-132 |
| matrix-zoom-webkit | 720 × 450, police 200 % | 7 pages clés | 2 | 5 | 0 | rouge : JIR-131, JIR-132 |
| matrix-zoom-firefox | 720 × 450, police 200 % | 7 pages clés | 0 | 0 | 0 | **non exécuté** (JIR-133) |
| matrix-drops | 390, 768 et 1200 px | 50 dépôts par largeur | 3 | 0 | 1 | **vert**, BUG-JIR-011 clos |

Les ignorés comptent les tests non exécutés après un échec dans un groupe en
série et les sept cas zoom ignorés hors des projets zoom.

## Lecture par spécification (36 specs existantes)

Ligne de base : le projet d'acceptation `chromium` (1280 × 720, 172 tests)
rejoué sur le même commit, run `baseline-chromium-20261028-233452` : **100
verts, 69 rouges, 3 ignorés**. Les rouges de la matrice se répartissent en
« B », déjà rouges en ligne de base (dérive de la spécification par rapport au
produit, ou défaut du produit déjà présent à 1280 px), et « M », rouges dans la
matrice seulement (largeur ou moteur). Dédupliqués : **67 B** et **18 M**, dont
les 7 audits axe absents de la ligne de base par construction et **11 cas
propres à WebKit ou à 1440 px**. Les 14 rouges de chaque projet de largeur
Chromium sont tous B.

| Spécification | Base 1280 | C 1440 | C 1024 | C 768 | W 1440 | W 768 |
| -- | --: | --: | --: | --: | --: | --: |
| account-recovery | 0 | 0 | 0 | 0 | 1 | 0 |
| backlog-foundation | 4 | 5 | 0 | 0 | 4 | 0 |
| backlog-onboarding | 2 | 2 | 0 | 0 | 2 | 0 |
| backlog-ranking | 1 | 1 | 1 | 1 | 1 | 1 |
| backlog-redesign | 3 | 2 | 2 | 2 | 0 | 0 |
| browse-users | 1 | 1 | 0 | 0 | 1 | 0 |
| create-everywhere | 4 | 4 | 4 | 4 | 1 | 1 |
| item-detail-drawer | 1 | 1 | 1 | 1 | 1 | 1 |
| item-templates | 1 | 1 | 1 | 1 | 1 | 1 |
| keyboard-shortcuts | 0 | 0 | 0 | 0 | 1 | 1 |
| le-point | 2 | 2 | 0 | 0 | 2 | 0 |
| matrix/a11y | hors base | 7 | 0 | 0 | 7 | 0 |
| permission-schemes | 8 | 7 | 0 | 0 | 7 | 0 |
| realtime | 3 | 3 | 3 | 3 | 0 | 0 |
| releases | 26 | 25 | 0 | 0 | 21 | 0 |
| roadmap | 4 | 5 | 0 | 0 | 5 | 0 |
| sprint-lifecycle | 7 | 7 | 0 | 0 | 6 | 0 |
| sprint-reports | 0 | 1 | 0 | 0 | 1 | 0 |
| ticket-drawer | 2 | 2 | 2 | 2 | 3 | 3 |

Les 16 autres specs sont vertes partout où elles ont tourné (les projets de
largeur n'exécutent que le sous-ensemble P2, P3, P4, P6).

**Ce que ça dit.** La matrice n'a pas révélé de défaut de moteur ou de largeur
massif : l'essentiel des rouges est la **dérive de la suite d'acceptation
elle-même** (69 sur 172, hors CI, non rejouée depuis les lots d'octobre), à
trier spec par spec entre dérive de test, harnais et régression possible du
produit : **JIR-134** (priorité haute ; en tête, les trois familles qui peuvent
cacher une régression : item-templates « Server Action returned no
discriminated result », realtime, create-everywhere). Les 11 cas propres à
WebKit ou à 1440 px sont dans **JIR-135** : permission `clipboard-write`
inconnue de WebKit (account-recovery, ticket-drawer), focus et timing WebKit
(sprint-reports 01, loading-skeletons, backlog-foundation, permission-schemes
9), raccourcis j / k / o en WebKit (défaut produit possible), et quatre cas à
1440 px (backlog-foundation 390, permission-schemes 1, roadmap zoom,
sprint-reports 06).

## Ligne de base Chromium du 29 octobre 2026 (JIR-134, lots 1 à 3)

Run de référence : **`baseline-chromium-20261029-123133`**, sur **`4a2a41cfee19746a26f687778489e93bf662ffa9`** (`origin/main` au lancement, JIR-136 et JIR-137 fusionnés).
Une seule invocation complète `corepack pnpm test:e2e`, sans filtre de spec et sans retry : **171 verts, 1 rouge, 0 ignoré**, 172 tests dans 36 specs, 7 min 54 s. Le projet d'acceptation `chromium` garde son défaut 1280 × 720 ; les specs qui imposent une autre largeur gardent leurs propres fenêtres, dont Le point à 390 px.

Environnement local : Node 24.18.1, pnpm 10.34.5 via Corepack, PostgreSQL 17 tmpfs dédié sur 5459, base `jiroo_e2e` et identité physique vérifiées ; `next dev` Turbopack sur 3100. Secrets générés en mémoire, aucun `.env`. Budget de 60 minutes non atteint, aucune relance de la suite.

Preuves : [JUnit](runs/baseline-chromium-20261029-123133-junit.xml), [manifeste scellé](runs/baseline-chromium-20261029-123133-manifest.json) et captures/journaux préfixés par ce run. **209 fichiers sous `audit/`, 8 247 354 octets (8,25 Mo)** : 2 fichiers de run, 77 journaux console, 77 journaux réseau, 53 PNG. Le répertoire de captures du backlog est lui aussi préfixé par le run. L'inventaire contient **290 artefacts**, tous revérifiés par taille et SHA-256 après scellement : 208 sous `audit/` et 82 sorties locales `.playwright/` ; le manifeste ne peut inclure son propre digest. Les traces, vidéos et autres sorties `.playwright/` restent hors Git.

Contrôle avant commit : aucun signalement dans les **156 fichiers texte** contrôlés contre les secrets générés et les motifs de credentials ; contrôle OCR local des **53 PNG**, aucun écran d'activation 2FA, clé manuelle ou codes de récupération repéré, aucune image illisible. La capture de l'échec a aussi été examinée. **Aucune capture sensible retirée**. Ces contrôles des preuves destinées à Git sont distincts de l'inventaire cryptographique ; ils ne certifient pas les contenus privés des traces locales non publiées.

### Comparaison avec le 28 octobre

La base du 28 octobre reste **100 verts, 69 rouges, 3 ignorés**, run `baseline-chromium-20261028-233452`. Sur les mêmes 172 tests : **+71 verts, −68 rouges, −3 ignorés**. Parmi les anciens rouges, **68 passent** (7 S et 61 H selon la classification du lot 0) ; **un ancien H reste rouge mais s'arrête maintenant sur une dérive S**. Aucun test auparavant vert ou ignoré ne devient rouge. La comparaison mesure l'ensemble des changements intégrés jusqu'à `4a2a41c` ; elle n'isole pas la contribution de chaque lot.

| Spécification | Rouges : base 28 oct → base 29 oct | Verts 29 oct | Ignorés 29 oct |
| -- | --: | --: | --: |
| account-recovery | 0 → 0 | 3 | 0 |
| all-items | 0 → 0 | 1 | 0 |
| backlog-access | 0 → 0 | 2 | 0 |
| backlog-foundation | 4 → 0 | 7 | 0 |
| backlog-onboarding | 2 → 0 | 2 | 0 |
| backlog-ranking | 1 → 0 | 1 | 0 |
| backlog-redesign | 3 → 0 | 5 | 0 |
| backlogs-home | 0 → 0 | 3 | 0 |
| board-added-column | 0 → 0 | 5 | 0 |
| board-empty-columns | 0 → 0 | 1 | 0 |
| browse-users | 1 → 0 | 4 | 0 |
| create-everywhere | 4 → 0 | 4 | 0 |
| create-under-version-filter | 0 → 0 | 1 | 0 |
| help-guide | 0 → 0 | 3 | 0 |
| item-detail-drawer | 1 → 0 | 15 | 0 |
| item-templates | 1 → 0 | 1 | 0 |
| keyboard-shortcuts | 0 → 0 | 4 | 0 |
| le-point | 2 → 0 | 2 | 0 |
| list-rows | 0 → 0 | 5 | 0 |
| loading-skeletons | 0 → 0 | 1 | 0 |
| markdown-editor | 0 → 0 | 6 | 0 |
| mobile-shell | 0 → 0 | 5 | 0 |
| new-item-missing-parent | 0 → 0 | 1 | 0 |
| new-item-required-parent | 0 → 0 | 1 | 0 |
| overlay-animations | 0 → 0 | 2 | 0 |
| permission-schemes | 8 → 0 | 10 | 0 |
| realtime | 3 → 0 | 3 | 0 |
| releases | 26 → 0 | 27 | 0 |
| repo-connections | 0 → 0 | 1 | 0 |
| roadmap | 4 → 0 | 6 | 0 |
| shell-redesign | 0 → 0 | 8 | 0 |
| sprint-dates | 0 → 0 | 3 | 0 |
| sprint-filter | 0 → 0 | 1 | 0 |
| sprint-lifecycle | 7 → 1 | 7 | 0 |
| sprint-reports | 0 → 0 | 12 | 0 |
| ticket-drawer | 2 → 0 | 8 | 0 |
| **Total** | **69 → 1** | **171** | **0** |

Les trois ignorés du 28 octobre appartenaient au groupe en série `browse-users` après son premier échec. Les quatre tests de ce groupe ont cette fois été exécutés et sont verts. Aucun scénario n'est ignoré dans cette ligne de base. Les deux parcours de Le point, dont le texte complet à 390 px, sont verts après JIR-137.

### Reclassement du rouge restant

Codes : **S** dérive de spec, **H** harnais, **P** produit, **I** infrastructure. Ils désignent le point d'arrêt observé, pas la garantie que les assertions suivantes du scénario passeraient.

| Test | Point d'arrêt et preuve assainie | Code et comparaison | Suivi proposé |
| -- | -- | -- | -- |
| `sprint-lifecycle.spec.ts:250` — « planifie, exécute et clôture un sprint sans exposer le backlog sur le Board » | `e2e/sprint-lifecycle.spec.ts:275` exige 0 bouton « Créer » sur toute la page `/b/CASS?view=board&q=audit`, reçoit 1 après 5 s. « Aucun sprint actif » et le lien Backlog sont présents. Le bouton trouvé est la commande globale de la barre du haut, visible sur la [capture d'échec](screenshots/baseline-chromium-20261029-123133-sprint-lifecycle-no-active-global-create-failure.png) et consignée dans le [JUnit](runs/baseline-chromium-20261029-123133-junit.xml). | **S**, ancien rouge **H #61** (attente `response.finished()` pendant 120 s dans la classification du lot 0). Même test toujours rouge, nouveau point d'arrêt ; aucune régression produit démontrée par ce constat. | **Ticket à créer — « Sprint lifecycle : distinguer Créer global et création locale du Board sans sprint »**. Reproduire ce seul scénario après setup jetable. Limiter l'interdiction à la surface de création locale du Board et préserver explicitement la commande globale ; piste seulement, aucune correction ici. |

La spec `e2e/create-everywhere.spec.ts:74–138` exige justement la création depuis la barre du haut sur le Board sans sprint, sans appartenance de sprint ; son parcours est vert dans ce run. L'assertion globale du cycle de sprint contredit ce contrat. Le scénario en échec **n'atteint pas** les étapes de planification/démarrage/clôture après la ligne 275 : leur exécution complète n'est pas déduite de ce résultat. Les sept autres tests de `sprint-lifecycle` sont verts.

Bilan des points d'arrêt de la suite : **S=1, H=0, P=0, I=0**. Aucun produit, helper ou spec corrigé dans ce lot ; le rouge est conservé dans les preuves.

### Observation auxiliaire hors des 172 tests

Le contrôle préalable `corepack pnpm test:e2e --list` a bien annoncé 172 tests / 36 fichiers, puis a terminé avec une erreur du reporter : « La réservation Playwright est absente ou illisible ». `e2e/exclusive-junit-reporter.ts:11` publie sans condition ; `scripts/e2e-junit-report.ts:39–44` exige le verrou que `e2e/global.setup.ts:309` réserve seulement lors d'une vraie exécution. **H**, ticket à créer : « Reporter Playwright : permettre --list sans réservation de run ». Ce diagnostic n'est ni une seconde invocation de tests ni un rouge supplémentaire de la ligne de base. Aucune correction appliquée.

Cette passe ne rejoue ni WebKit, ni Firefox, ni la matrice de zoom/accessibilité du 28 octobre : leurs résultats et tickets restent historiques et distincts. Elle ne vaut pas validation de déploiement ni de préparation générale à la production ; les limites de JIR-136 restent dans ses livrables.

## Zoom 200 %

Fenêtre 720 × 450 et police racine à 200 %, soit 1440 × 900 à 200 % ; critère :
aucun débordement horizontal du document ni de `<main>` (seuil 1 px), action
principale visible, entièrement dans la fenêtre et activable, capture conservée.

| Page | Chromium | WebKit | Lecture |
| -- | -- | -- | -- |
| P1 accueil | rouge | rouge | nom des backlogs masqué, clé collée au compteur, lien du nom invisible : **JIR-132** |
| P2 board | rouge | rouge | « Créer » jugé pas entièrement dans la fenêtre ; recherche tronquée : **JIR-132**, mesure à vérifier |
| P3 liste | rouge | rouge | idem P2 |
| P4 tiroir | vert | rouge | tiroir non visible à 200 % en WebKit seulement : **JIR-132**, à investiguer |
| P5 Le point | vert | vert | |
| P6 aide | vert | vert | |
| P7 réglages, accès | rouge | rouge | `<main>` déborde de 52 px (Chromium) et 22 px (WebKit) : **JIR-131** |

Relances uniques des deux projets zoom : résultats identiques.

## Accessibilité automatisée (axe-core, WCAG 2.1 A et AA)

Deux à trois violations « serious » par page, **identiques en Chromium et en
WebKit**, aucune « critical », aucune « moderate » ni « minor ». Trois familles :

| Règle | Pages | Ce que c'est | Ticket |
| -- | -- | -- | -- |
| `color-contrast` | les sept | initiales d'avatar en blanc sur la couleur de l'utilisateur, avatar de la barre du haut | **JIR-128** (BUG-JIR-030) |
| `label-content-name-mismatch` | les sept | compteurs de la barre latérale dans l'`aria-label`, déclencheurs Radix, bouton de titre du tiroir, personnes de Le point | **JIR-129** (BUG-JIR-031) |
| `scrollable-region-focusable` | board | conteneur des colonnes non focalisable | **JIR-130** (BUG-JIR-032) |

JSON par page et par moteur dans `a11y/` (règle, impact, cibles, résumé ;
jamais le HTML des nœuds).

## Dépôts (BUG-JIR-011)

150 dépôts consécutifs vérifiés, 50 par largeur vers la colonne entièrement
hors écran la plus proche, avec auto-défilement strictement positif avant le
relâchement ; à chaque dépôt, cible annoncée, `statusId` envoyé et statut après
rechargement identiques, aucune divergence. Durées : 125 s à 1200 px, 121 s à
390 px, 100 s à 768 px. La série vers la colonne la plus éloignée à 1200 px a
été ignorée par budget (estimation 271 s après 351 s écoulées) : à jouer lors
d'une passe dédiée. **BUG-JIR-011 est clos.**

## Lecteurs d'écran

Script livré (`a11y/script-lecteurs-ecran.md`) ; exécutions VoiceOver + Safari
et NVDA + Firefox non faites, en attente des décisions du § 6 de la stratégie
(poste Windows, JAWS, mobile, cadence).

## Défauts produit ouverts par cette passe

| Registre | Ticket | Défaut | Gravité |
| -- | -- | -- | -- |
| BUG-JIR-030 | JIR-128 | Contraste des initiales d'avatar | majeure |
| BUG-JIR-031 | JIR-129 | Noms accessibles sans le texte visible | majeure |
| BUG-JIR-032 | JIR-130 | Conteneur des colonnes du board non focalisable | majeure |
| BUG-JIR-033 | JIR-131 | Réglages d'accès : débordement à 200 % | mineure |
| BUG-JIR-034 | JIR-132 | Accueil et barre du haut à 200 % | mineure |

## Limites de cette passe

- **Firefox** : aucun test exécuté, la build Playwright ne démarre pas sur
  macOS 27 (sandbox et compositeur) ; JIR-133 pour l'exécuter ailleurs.
- **Ligne de base** : les projets pleins et de largeur ne sont lisibles qu'avec
  la passe `chromium` 1280 px du même commit (section « Lecture par
  spécification »).
- **WebKit** : trois tests demandent la permission `clipboard-write`, inconnue
  de WebKit ; cinq tests des releases échouent sur une navigation interrompue
  par une autre ; un test attend un focus que WebKit ne donne pas. Ce sont des
  incompatibilités de harnais à corriger dans les specs, pas des défauts
  constatés du produit.
- **Requêtes annulées** : seuls les marqueurs bornés `[aborted-action]` et
  `[aborted-rsc]` (JIR-49) apparaissent, dans la seule spec des rapports.
- **Zoom** : simulé par fenêtre réduite et police racine, pas le zoom natif ;
  les mesures exactes ne sont consignées qu'en échec.
