# Roadmap priorisée issue de l'audit

## État après remédiation du 4 août 2026

| Chantier | État | Preuve |
|---|---|---|
| Shell et détail mobile P0 | Terminé à 390 × 844 | Drawer 248 px, contenu 390 px, détail plein écran monocolonne |
| Raccourci de création P1 | Terminé | `C` consommé, titre vide et focus correct dans Chromium |
| Validation client/serveur P1 | Terminé sur titre/description | Constantes partagées, compteurs, erreurs Zod structurées et associées |
| Accessibilité du détail P1 | Terminé sur le périmètre observé | Dialogue Radix, `Escape`, focus restauré, renommage et retraits clavier |
| Feedback des propriétés P1 | Terminé sur les propriétés du détail | Optimisme immédiat, `aria-busy`, confirmation, rollback et protection contre prop périmée |
| Composeur enrichi P1 | Non commencé | Description, assigné, labels et échéance manquent toujours à la création |

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
