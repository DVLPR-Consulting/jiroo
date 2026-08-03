# Jiroo — Design de finalisation fonctionnelle

**Date :** 2026-08-03
**Statut :** validé
**Branche de départ :** `lot-d2-admin-users`

## Contexte

Jiroo est un gestionnaire de projet en français inspiré de Jira et de Linear. Les lots 0 à 13 ainsi que le lot D1 de fidélité visuelle sont déjà fusionnés. La branche active contient le backend initial du lot D2 pour l'administration des utilisateurs.

Le projet doit maintenant satisfaire l'ensemble des critères applicables de `.claude/output/design/design_handoff_jiroo/PROMPT-FEATURES.md`, et pas seulement les éléments résumés dans les lots D2 à D5 de l'audit du 5 juin 2026. Les captures 01 à 16 du handoff restent la référence visuelle.

## Définition de terminé

La finalisation est découpée en quatre lots séquentiels, suivis d'un audit de fermeture :

1. D2 — Administration des utilisateurs et des rôles.
2. D3 — Shell, navigation et compteurs.
3. D4 — Vues, filtres et édition inline.
4. D5 — États, recherche récente, Undo, détail et raccourcis.
5. Audit final de tous les critères de `PROMPT-FEATURES.md`.

Un lot est terminé lorsque ses tests ciblés passent, que `pnpm test`, `pnpm typecheck`, `pnpm lint` et `pnpm build` sont verts, et que ses parcours principaux ont été vérifiés visuellement et au clavier.

## Architecture

L'architecture existante est conservée :

- Les pages React Server Components chargent et assemblent les données.
- Les Server Actions effectuent l'authentification, le contrôle RBAC, la revalidation et la traduction des erreurs.
- Les services portent les mutations, les transactions et l'écriture du journal d'activité.
- Les fonctions pures portent la validation, le filtrage, le tri et les règles hiérarchiques.
- L'URL reste la source de vérité pour la vue, les filtres, le regroupement, le tri, la vue sauvegardée et l'item ouvert.

Le shell reçoit un composant client léger chargé de déduire l'état actif depuis l'URL et de persister uniquement les préférences locales de présentation. Il ne duplique pas l'état métier chargé par les Server Components.

Aucune nouvelle table n'est prévue par défaut. Une migration ne sera ajoutée que si un critère validé ne peut pas être satisfait correctement avec le schéma actuel.

## D2 — Administration des utilisateurs

La page `/admin` devient une page à onglets comprenant Backlogs et Utilisateurs & rôles. Le nouvel onglet utilise le service présent sur la branche pour :

- lister avatar, nom, e-mail et rôle ;
- modifier le rôle admin, contributeur ou lecteur ;
- créer un compte avec nom, e-mail, mot de passe initial et rôle ;
- afficher les erreurs de validation en français ;
- interdire à un administrateur de retirer son propre rôle admin.

L'interface suit la capture `15-admin-utilisateurs.png`. Les contrôles sensibles restent protégés côté serveur, indépendamment de leur visibilité dans l'interface.

L'onglet Backlogs existant est également fermé par rapport au critère d'administration : la clé devient éditable. Son changement réécrit atomiquement la clé du backlog et les clés de tous ses items, y compris ceux de la corbeille, en conservant leur suffixe numérique. Une confirmation avertit que les anciens liens contenant l'ancienne clé ne seront plus valides. La collision avec une clé de backlog ou d'item existante fait échouer toute la transaction.

## D3 — Shell et navigation

Le shell est aligné sur le handoff :

- sidebar repliable, de 248 px en mode ouvert à une largeur compacte centrée sur les icônes ;
- état replié persisté dans `localStorage` et appliqué sans modifier les données métier ;
- suppression des en-têtes Backlogs et Navigation ;
- sélecteur de backlog avec clé colorée, nom et chevrons ;
- navigation active et compteurs pour Tous les items, Mes items et Corbeille ; Tous les items ouvre la vue non filtrée du backlog actif, tandis que Mes items conserve sa portée cross-backlog existante ;
- breadcrumb dynamique dans la topbar à partir du backlog, du mode et de la vue active ;
- suppression de la bannière d'enrôlement 2FA dans le shell ;
- carte utilisateur avec Profil, Préférences et Déconnexion ;
- Profil en lecture seule et Préférences regroupant thème et densité.

Les compteurs sont calculés côté serveur à partir des données accessibles à l'utilisateur. Le shell ne charge pas les listes complètes uniquement pour calculer ces compteurs.

## D4 — Vues et filtres

La barre de filtres utilise des facettes pointillées, multi-sélectionnables, avec un état actif plein. Le contrôle de regroupement est déplacé dans la view bar sous la forme `Grouper : …` et propose Statut, Priorité, Assignee, Composant ou Aucun selon le mode. Le regroupement Composant remonte l'ascendance de chaque item jusqu'à son composant racine.

Le filtre hiérarchique accepte un composant ou un epic et conserve les descendants de l'élément sélectionné. Il est encodé dans l'URL, participe aux vues sauvegardées et respecte la logique existante : ET entre facettes, OU au sein d'une facette.

La vue liste devient un tableau dense comprenant type, clé, titre, statut, priorité, labels, échéance et assignee. Elle fournit :

- des en-têtes sticky et triables ;
- un tri stable et réversible ;
- des groupes sticky, repliables pour la session, avec compteurs ;
- l'édition inline du statut, de la priorité et de l'assignee ;
- l'ouverture du détail depuis les zones non interactives de la ligne.

L'édition inline réutilise `updateItemAction`. Elle reste pessimiste : l'état visuel n'est confirmé qu'après succès serveur.

Chaque colonne du board reçoit un bouton `+` ouvrant le dialogue de création avec son statut prérempli. La priorité d'une carte devient éditable depuis son icône sans ouvrir le détail, via la même action transactionnelle que les autres éditions. La vue arbre reçoit les labels, la priorité, le statut et l'assignee manquants sans modifier son protocole de reparentage.

## D5 — États et finitions

### Chargement, vide et erreur

Des skeletons dédiés sont fournis pour le board, la liste et le panneau de détail selon les conventions documentées de Next.js 16. Des frontières d'erreur proposent un message français et une action Réessayer.

Les états vides couvrent au minimum : aucun item, aucun résultat de filtre, aucune vue sauvegardée et corbeille vide. L'état sans résultat propose Effacer les filtres.

### Toasts et Undo

Le store de toast accepte une action optionnelle. Les mutations inverses sont :

- annulation d'une création : soft-delete de l'item créé ;
- annulation d'une suppression : restauration de l'item supprimé.

L'action est disponible pendant la durée du toast. Si la ressource a changé ou n'est plus restaurable, l'échec est signalé sans remplacer l'état autoritatif du serveur.

### Recherche récente

Le navigateur stocke uniquement les clés des items récemment ouverts, avec une taille bornée et dédupliquée. Lorsque la palette est ouverte sans requête, le serveur résout ces clés et applique les contrôles d'accès avant de retourner icône, clé, titre, statut et avatar. Les titres et descriptions ne sont pas stockés dans `localStorage`.

### Détail et raccourcis

Le détail reçoit :

- un breadcrumb parent / item courant ;
- une action de copie du lien partageable ;
- un rapporteur éditable via la mutation transactionnelle existante étendue ;
- les retours toast appropriés.

Le raccourci `C` ouvre le dialogue de création lorsqu'un backlog est actif. Il est ignoré quand le focus se trouve dans un champ éditable, un menu ou un dialogue. `Échap` conserve son comportement de fermeture et `⌘/Ctrl+K` reste réservé à la recherche.

Les liens de l'écran de connexion sont ajoutés sans introduire de récupération de mot de passe par e-mail, explicitement hors périmètre du design initial. Le panneau de détail actuel, encodé dans l'URL et partageable, satisfait le besoin de détail navigable ; aucune page `/item/[key]` redondante n'est ajoutée.

## Sécurité et gestion des erreurs

- Les vérifications admin et writer restent exécutées côté serveur.
- Toutes les entrées externes sont validées par Zod avant mutation.
- Les changements d'item restent transactionnels et audités.
- Les erreurs attendues sont traduites en messages français ; les erreurs inconnues échouent sans exposer d'information interne.
- Les opérations optimistes existantes du board et de l'arbre conservent leur rollback.
- Les contrôles d'accès sont réappliqués lors de la résolution des items récents.

La corbeille affiche une date limite de restauration à 30 jours. Une restauration après cette limite est refusée. La purge définitive reste une action explicite de l'administrateur ; aucune suppression automatique silencieuse n'est ajoutée.

## Tests et recette

Les changements métier et correctifs suivent une boucle TDD. La couverture comprend :

- validation et actions utilisateurs ;
- renommage atomique d'une clé de backlog et de ses clés d'items, y compris les collisions ;
- dérivation du shell, compteurs et préférence de repli ;
- lecture/écriture du filtre hiérarchique et intégration aux vues sauvegardées ;
- tri, regroupement par composant et édition inline ;
- préremplissage du statut depuis une colonne ;
- store de toast avec action et mutations inverses ;
- restauration dans et hors de la fenêtre de 30 jours ;
- liste récente bornée, dédupliquée et résolue côté serveur ;
- raccourci `C` et exclusion des zones de saisie ;
- mise à jour auditée du rapporteur.

La recette navigateur couvre les captures pertinentes 04, 06, 07, 08, 11, 12, 14, 15 et 16, en clair et en sombre lorsque le composant est concerné. Elle vérifie également le clavier, les focus visibles, les libellés accessibles et les principaux états d'erreur.

## Audit de fermeture

Un tableau final reprend chaque critère de `PROMPT-FEATURES.md` avec l'un des statuts suivants : satisfait avec preuve, satisfait par une implémentation existante vérifiée, ou hors périmètre explicite avec justification. Aucun critère applicable ne reste en statut partiel ou absent.

## Hors périmètre

Restent hors périmètre : workflow configurable, champs personnalisés, suivi du temps, automatisations, permissions configurables, SSO/SAML, notifications e-mail, collaboration temps réel, récupération de mot de passe par e-mail, analytics et virtualisation des listes.
