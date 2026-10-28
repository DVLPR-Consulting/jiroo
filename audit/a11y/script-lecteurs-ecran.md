# Script de validation avec un lecteur d'écran (JIR-40, lot M4)

Ce script sert à valider Jiroo avec un vrai lecteur d'écran, sur les quatre
scénarios retenus par la stratégie JIR-40 (§ 5). Il complète les preuves
automatisées (Playwright, axe-core) : ici, on écoute ce qui est réellement
annoncé, et on note les écarts. Ce n'est pas un audit RGAA.

## Environnements

| Environnement | Lecteur d'écran | Navigateur | Qui |
| -- | -- | -- | -- |
| macOS | VoiceOver, dernière version | Safari, dernière version | Nicolas |
| Windows | NVDA, dernière version en français | Firefox, dernière version | À désigner (décision § 6 de la stratégie) |

Ces couples sont ceux de la base de référence du RGAA 4.1.2 pour un ordinateur.

## Préparation

1. Site : `https://jiroo-dev.vercel.app` (suit `main`), ou un serveur local.
2. Compte : un utilisateur qui peut déplacer les cartes du board (droit de
   planification) ; un backlog avec un sprint actif et au moins une carte par
   colonne « À faire », « En cours », « En revue ».
3. Enregistrer ce qui est annoncé :
   - VoiceOver : Utilitaire VoiceOver → Visuels → activer le panneau de
     sous-titres (ce que VoiceOver dit s'affiche à l'écran) ; capture d'écran
     du panneau aux étapes marquées **capture**.
   - NVDA : NVDA → Outils → Visualiseur de parole ; copier le texte du
     visualiseur aux étapes marquées **capture**.
4. Copier ce fichier en `audit/a11y/<AAAAMMJJ>-voiceover.md` ou
   `audit/a11y/<AAAAMMJJ>-nvda.md`, remplir la fiche et les colonnes
   « Entendu » et « Verdict ». Les captures vont dans
   `audit/a11y/<AAAAMMJJ>-<lecteur>-<scénario>-<étape>.png`.
5. Aucune donnée personnelle ni secret dans les captures : préférer le backlog
   de démonstration, masquer un nom réel s'il apparaît.

Verdicts : **OK** (annonce conforme à l'attendu), **Partiel** (annonce
présente mais incomplète ou ambiguë), **KO** (rien d'annoncé, ou annonce
trompeuse), **Non testé** (préciser pourquoi).

## Fiche

| Champ | Valeur |
| -- | -- |
| Date | |
| Personne | |
| Système et version | |
| Navigateur et version | |
| Lecteur d'écran et version | |
| Site testé (URL, commit `main`) | |
| Backlog et sprint utilisés | |

## S1 — Navigation (parcours P6)

Point de départ : la page d'accueil des backlogs, connecté.

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 1.1 | Charger la page, écouter l'annonce du titre | Le titre nomme la page et le produit (« … — Jiroo »). Aujourd'hui seules les pages Le point et Aide ont un titre propre : noter ce que dit chaque page visitée dans ce script | | |
| 1.2 | Lister les régions (VoiceOver : rotor, « Points de repère » ; NVDA : `D` / `Maj+D`) | Une région de navigation « Vues du projet » et la région principale ; le lien « Jiroo — accueil » en tête de la barre latérale | | |
| 1.3 | Dans la barre latérale, parcourir les vues du projet avec `Tab` | Chaque vue est un lien nommé (Board, Liste, Arbre, Roadmap, Le point…) ; la vue courante est signalée (lien courant) | | |
| 1.4 | Activer « Board » | La page change ; le focus ou l'annonce signale la nouvelle vue (titre ou en-tête) | | |
| 1.5 | Appuyer sur `?` | Une boîte de dialogue « Raccourcis clavier » s'ouvre, annoncée comme telle ; le focus est dedans | | **capture** |
| 1.6 | `Échap` | La boîte se ferme ; le focus revient où il était | | |
| 1.7 | Appuyer sur `/` | La boîte « Rechercher un item » s'ouvre ; le champ « Rechercher » a le focus, vide | | |
| 1.8 | `Échap`, puis `g` suivi de `i` | La Liste du backlog s'affiche (URL `?view=list`) ; `g` puis `a` ramène au Board | | |
| 1.9 | Aller au lien « Aide » (libellé « Aide ») et l'activer | La page du guide s'ouvre ; son titre est annoncé | | |

## S2 — Board au clavier (parcours P2, reste de BUG-JIR-012)

Point de départ : le Board d'un backlog avec un sprint actif.

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 2.1 | Parcourir les colonnes | Chaque colonne est un groupe nommé « <Statut>, N items » ; dans chaque colonne, un bouton « Créer dans <Statut> » | | |
| 2.2 | Aller sur une carte avec `Tab` | La carte est annoncée « <CLÉ> — <titre> » ; juste à côté, une poignée « Déplacer <CLÉ> » | | |
| 2.3 | Mettre le focus sur la poignée « Déplacer <CLÉ> » | Les instructions sont lues ou disponibles : « Pour sélectionner une carte, appuyez sur Espace. Utilisez ensuite les flèches pour la déplacer. Appuyez de nouveau sur Espace pour la déposer, ou sur Échap pour annuler. » | | |
| 2.4 | `Espace` | « <CLÉ> — <titre> sélectionné. Utilisez les flèches pour le déplacer. » (jamais un identifiant technique) | | **capture** |
| 2.5 | `Flèche droite` une fois | « <CLÉ> — <titre> déplacé vers <Statut suivant>. » | | **capture** |
| 2.6 | `Flèche droite` encore, jusqu'à la dernière colonne | Une annonce par colonne traversée, dans l'ordre des colonnes ; aucun UUID, aucun texte en anglais | | |
| 2.7 | `Échap` | « Déplacement de <CLÉ> — <titre> annulé. Position d'origine restaurée. » ; la carte est visuellement revenue dans sa colonne de départ | | **capture** |
| 2.8 | Recharger la page, retrouver la carte | Elle est toujours dans sa colonne de départ (rien n'a été enregistré) | | |
| 2.9 | Reprendre la carte (`Espace`), `Flèche droite` une fois, `Espace` | « <CLÉ> — <titre> déposé dans <Statut>. » ; la carte est dans cette colonne (un dépôt sans cible dit « déposé à sa position d'origine ») | | **capture** |
| 2.10 | Recharger la page | La carte est bien dans la colonne annoncée en 2.9 (statut enregistré = statut annoncé) | | |
| 2.11 | Remettre la carte dans sa colonne d'origine (clavier) | Même qualité d'annonces dans l'autre sens | | |

## S3 — Tiroir d'un ticket (parcours P4)

Point de départ : le Board ou la Liste.

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 3.1 | Activer une carte (`Entrée`) | Le tiroir s'ouvre comme une boîte de dialogue ; son nom est le titre du ticket ; le focus entre dans le tiroir | | **capture** |
| 3.2 | Parcourir le tiroir avec `Tab` | Le champ « Titre de l'item », les champs en ligne (statut, assigné, estimation, échéance…) sont nommés ; les boutons ont un libellé | | |
| 3.3 | Modifier le statut depuis le tiroir | Le nouveau statut est annoncé après validation ; aucune annonce technique | | |
| 3.4 | Ouvrir l'éditeur de description, taper un mot, enregistrer | Le rôle de l'éditeur est annoncé ; la sauvegarde est signalée (message d'état ou texte mis à jour) | | |
| 3.5 | Activer « Fermer » (ou `Échap`) | Le tiroir se ferme ; le focus revient sur la carte d'origine (ou sur le titre si c'est lui qui avait ouvert le tiroir) | | **capture** |

## S4 — Le point (parcours P5)

Point de départ : « Le point » du backlog, portée « Toute l'équipe ».

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 4.1 | Charger la page | Titre « Le point (pilote) — Jiroo » ; un en-tête « Santé du sprint » (lecteur d'écran seulement) | | |
| 4.2 | Lire le verdict de la santé du sprint | Le verdict (En bonne voie, En avance, À surveiller, En retard) suivi du résumé et des raisons (retard sur la date, périmètre ajouté, bloqués, non estimés) | | **capture** |
| 4.3 | Lire la barre de progression | Une image nommée « N % terminé, N % en cours, N % à faire ; N % du temps écoulé » | | |
| 4.4 | Activer « Comment est-ce calculé ? » | Une boîte de dialogue avec les règles ; `Échap` la ferme et rend le focus au bouton | | |
| 4.5 | Parcourir le groupe Perspective / Portée | Un groupe de boutons radio nommé, l'option sélectionnée annoncée | | |
| 4.6 | Section « Tickets par personne » : parcourir les personnes | Chaque personne est un bouton « <Nom>, <verdict>, N tickets ouverts, P points » | | **capture** |
| 4.7 | Activer une personne | Ses tickets se déplient ; chaque ticket est annoncé avec sa raison (bloqué, sans activité, en retard, hors sprint) | | |
| 4.8 | Activer « Voir dans la Liste » | La Liste filtrée sur cette personne s'ouvre | | |

## Synthèse

| Scénario | OK | Partiel | KO | Non testé | Remarques |
| -- | -- | -- | -- | -- | -- |
| S1 Navigation | | | | | |
| S2 Board au clavier | | | | | |
| S3 Tiroir | | | | | |
| S4 Le point | | | | | |

Chaque KO ou Partiel devient une entrée `BUG-JIR-0xx` dans `audit/bugs.md`
(avec la capture) et un ticket Linear ; la grille finale est reportée dans
`audit/matrix.md`.
