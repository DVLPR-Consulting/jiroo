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
2. Compte : un utilisateur qui peut déplacer les cartes du board, créer et
   modifier des tickets et changer leur statut (droits de planification, de
   création, d'édition et de transition) ; le backlog de démonstration, avec
   un sprint actif non vide et au moins une carte par colonne « À faire »,
   « En cours », « En revue ». Commencer chaque scénario sur ce backlog.
3. Enregistrer ce qui est annoncé :
   - VoiceOver : Utilitaire VoiceOver → Effets visuels → Panneaux et menus →
     « Afficher le panneau Légende » (ce que VoiceOver dit s'affiche à
     l'écran) ; capture d'écran du panneau aux étapes marquées **capture**.
   - NVDA : menu NVDA → Outils → Visionneuse de parole ; copier le texte de la
     visionneuse aux étapes marquées **capture**, sans donnée réelle.
4. Transmettre les touches à Jiroo quand une étape le demande (raccourcis à
   lettres, flèches du glisser-déposer), sinon le lecteur les intercepte et
   produit de faux KO :
   - NVDA : désactiver la navigation par touche unique (`NVDA+Maj+Espace`)
     avant les raccourcis `?`, `/`, `g` puis `i` ou `a`, et passer en mode
     formulaire (`NVDA+Espace`) quand le focus est sur la poignée d'une carte,
     pour que `Espace` et les flèches aillent au contrôle ; revenir au mode
     navigation pour lire. Les régions se listent en mode navigation (`D` et
     `Maj+D`).
   - VoiceOver : désactiver la navigation rapide (flèches gauche et droite
     ensemble) et la navigation rapide par touche unique avant ces mêmes
     phases ; placer le focus clavier réel (`Tab`) sur la poignée ; le rotor
     (`VO+U`) sert à lister les régions.
   Vérifier ces commandes dans la version installée et noter les réglages
   utilisés dans la fiche.
5. Copier ce fichier en `audit/a11y/<AAAAMMJJ>-voiceover.md` ou
   `audit/a11y/<AAAAMMJJ>-nvda.md`, remplir la fiche et les colonnes
   « Entendu » et « Verdict ». Les captures vont dans
   `audit/a11y/<AAAAMMJJ>-<lecteur>-<scénario>-<étape>.png`.
6. Aucune donnée personnelle ni secret dans les captures ni dans le texte
   copié de la visionneuse : préférer le backlog de démonstration, masquer un
   nom réel s'il apparaît.

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
| Réglages du lecteur (navigation rapide, mode formulaire) | |
| Site testé (URL, commit `main`) | |
| Backlog et sprint utilisés | |

## S1 — Navigation (parcours P6)

Point de départ : la page d'accueil des backlogs, connecté.

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 1.1 | Charger la page, écouter l'annonce du titre | Aujourd'hui seules les pages Le point (« Le point (pilote) — Jiroo »), Aide et Calendrier d'équipe ont un titre propre ; les autres annoncent « Jiroo ». Noter le titre réellement annoncé à chaque page visitée dans ce script, et signaler en remarque les pages qui n'annoncent que « Jiroo » | | |
| 1.2 | Lister les régions (VoiceOver : rotor, « Points de repère » ; NVDA : `D` / `Maj+D`) | Une région de navigation « Vues du projet » et la région principale ; le lien « Jiroo — accueil » en tête de la barre latérale | | |
| 1.3 | Dans la barre latérale, parcourir les vues du projet avec `Tab` | Chaque vue est un lien nommé (Board, Liste, Arbre, Roadmap, Le point…) ; la vue courante est signalée (lien courant) | | |
| 1.4 | Activer « Board » | La page change ; le focus ou l'annonce signale la nouvelle vue (titre ou en-tête) | | |
| 1.5 | Appuyer sur `?` (touches transmises à Jiroo, voir Préparation 4, jusqu'à l'étape 1.8) | Une boîte de dialogue « Raccourcis clavier » s'ouvre, annoncée comme telle ; le focus est dedans | | **capture** |
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
| 2.3 | Mettre le focus clavier (`Tab`) sur la poignée « Déplacer <CLÉ> », puis transmettre les touches à Jiroo (NVDA : mode formulaire ; VoiceOver : navigation rapide désactivée) | Les instructions sont lues ou disponibles : « Pour sélectionner une carte, appuyez sur Espace. Utilisez ensuite les flèches pour la déplacer. Appuyez de nouveau sur Espace pour la déposer, ou sur Échap pour annuler. » Le clavier prend la carte depuis cette poignée seulement | | |
| 2.4 | `Espace` (ou `Entrée`) | « <CLÉ> — <titre> sélectionné. Utilisez les flèches pour le déplacer. » (jamais un identifiant technique) | | **capture** |
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
| 3.1 | Depuis le Board, activer le bouton d'identité de la carte « <CLÉ> — <titre> » (pas la poignée « Déplacer <CLÉ> », qui lance un déplacement) | Le tiroir s'ouvre comme une boîte de dialogue nommée « <CLÉ> — <titre> » ; le focus entre dans le tiroir | | **capture** |
| 3.2 | Parcourir le tiroir avec `Tab` | Le titre est un bouton (dans l'en-tête de niveau 1) ; les champs en ligne (statut, assigné, estimation, échéance…) et les boutons sont nommés ; le bouton « Fermer (Échap) » est atteignable | | |
| 3.3 | Activer le bouton du titre, puis `Échap` | Un champ « Titre de l'item » prend le focus avec le titre courant ; `Échap` annule l'édition sans fermer le tiroir, le focus revient sur le bouton du titre | | |
| 3.4 | Modifier le statut depuis le tiroir | Le nouveau statut est annoncé après validation ; aucune annonce technique | | |
| 3.5 | Aller dans « Description », taper un mot, attendre une seconde | L'éditeur est annoncé avec son rôle ; la sauvegarde est automatique (après une pause de saisie ou en quittant l'éditeur) et le message d'état « Enregistré » est annoncé. Le bouton « Enregistrer » n'existe que dans le mode Markdown brut de secours | | |
| 3.6 | Quitter l'éditeur (`Échap` une fois, ou `Tab`), puis activer « Fermer (Échap) » ou appuyer sur `Échap` | Le tiroir se ferme ; le focus revient sur le bouton « <CLÉ> — <titre> » de la carte qui l'avait ouvert, s'il existe encore | | **capture** |

## S4 — Le point (parcours P5)

Point de départ : « Le point » du backlog, portée « Toute l'équipe ».

| # | Action | Attendu | Entendu | Verdict |
| -- | -- | -- | -- | -- |
| 4.1 | Charger la page | Titre « Le point (pilote) — Jiroo » ; un en-tête « Santé du sprint » (lecteur d'écran seulement) | | |
| 4.2 | Lire le verdict de la santé du sprint | Le verdict (En bonne voie, En avance, À surveiller, En retard) suivi du résumé et des raisons (retard sur la date, périmètre ajouté, bloqués, non estimés) | | **capture** |
| 4.3 | Lire la barre de progression | Une image nommée « N % terminé, N % en cours, N % à faire ; N % du temps écoulé » | | |
| 4.4 | Activer « Comment est-ce calculé ? » | Une boîte de dialogue avec les règles ; `Échap` la ferme et rend le focus au bouton | | |
| 4.5 | Parcourir le groupe Perspective / Portée | Un groupe de boutons radio nommé, l'option sélectionnée annoncée | | |
| 4.6 | Section « Tickets par personne » : parcourir les personnes | Chaque personne est un bouton « <Nom>, <verdict>, N tickets ouverts, P points » (au singulier « 1 ticket ouvert », « 1 point ») ; les points sont omis quand aucun de ses tickets n'est estimé et la ligne « Non assigné » n'a pas de verdict : prendre pour la capture une personne assignée dont les tickets sont estimés | | **capture** |
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
