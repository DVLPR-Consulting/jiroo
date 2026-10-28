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

À compléter avec la ligne de base `chromium` (1280 × 720) sur le même commit :
pour chaque test rouge de la matrice, « B » s'il échoue aussi en ligne de base
(dérive de la spécification par rapport au produit, ou défaut du produit déjà
présent à 1280 px), « M » s'il n'échoue que dans la matrice (largeur ou moteur).

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
