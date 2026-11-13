# API REST v1

L’API agit avec les permissions du propriétaire du jeton. Préfixe : `/api/v1`.
Les requêtes utilisent `Authorization: Bearer jiroo_pat_…` ; les cookies de session
ne remplacent pas le jeton. Créez un jeton dans **Jetons d’accès** ; son secret
n’est affiché qu’à sa création. Stockez-le dans votre gestionnaire de secrets.
Les portées sont `read` et `write` ; `write` inclut la lecture, sans ajouter de
permission sur les backlogs. Un jeton révoqué ou expiré reçoit une réponse 401,
de même qu’un jeton dont le propriétaire n’a plus la double authentification
active. Un jeton `write` a toujours une date d’expiration (30, 90 ou 365 jours).
Une lecture par un administrateur de plateforme hors de ses droits ordinaires
laisse un événement d’audit, comme dans l’interface.

Toutes les réponses portent `Cache-Control: private, no-store`. Le JSON est en
UTF-8, les instants au format ISO 8601 UTC, les jours au format `YYYY-MM-DD`.
Aucune réponse ne contient le secret ni son empreinte.

## Routes

| Méthode et chemin | Portée | Réponse |
| --- | --- | --- |
| `GET /me` | read | `{ user: { id, name, email }, token: { id, name, scope, expiresAt } }` |
| `GET /backlogs` | read | `{ backlogs: [{ id, key, name, color, archivedAt }] }`, archivés inclus |
| `GET /backlogs/{key}/statuses` | read | `{ statuses: [{ id, name, category, color, order }] }`, tri `order, id` |
| `GET /items` | read | `{ items: ItemSummary[], nextCursor: string|null }` |
| `GET /items/{KEY}` | read | `{ item: ItemDetail }` |
| `GET /me/items` | read | `{ items: ItemSummary[], nextCursor: string|null }`, items assignés au propriétaire et lisibles, 1 000 au plus par réponse ; poursuivre avec `?cursor=` |
| `POST /items` | write | 201 `{ item: ItemSummary }` |
| `PATCH /items/{KEY}` | write | 200 `{ item: ItemSummary }` |
| `POST /items/{KEY}/comments` | write | 201 `{ comment: Comment }` |

Les clés sont insensibles à la casse à l’entrée, normalisées en majuscules.
Les items supprimés sont exclus. Les permissions des cas d’usage s’appliquent
également aux écritures : création, modification, transition et assignation.

## Liste et pagination

`GET /items` accepte ces filtres cumulables : `backlog=KEY`, `status=ID`,
`assignee=ID|me`, `type=composant|epic|tache|soustache`, `q=texte` (clé ou titre,
recherche littérale insensible à la casse), `limit=1..100` (50 par défaut),
`cursor=…`. Sans backlog, la recherche couvre tous les backlogs lisibles,
archivés inclus. Un `backlog` nommé mais non lisible répond 404, comme un
backlog inconnu.

L’ordre est celui de création : **`createdAt` croissant, puis `id` croissant**
pour départager les créations simultanées. Cet ordre reste stable quand le titre,
le statut ou la clé changent. Le curseur est opaque : transmettez exactement le
`nextCursor` reçu à la requête suivante, avec les mêmes filtres. `null` indique
la fin. Il ne s’agit pas d’un instantané : des créations ou changements de filtre
pendant le parcours peuvent modifier les résultats. `/me/items` parcourt au plus
dix pages de cette même liste avec `assignee=me`, puis renvoie le `nextCursor`
pour la suite.

## Objets

`ItemSummary` contient uniquement :

```ts
{
  id, key, backlog: { id, key, name }, type, kind, title,
  status: { id, name, category }, priority, estimatePoints,
  assignee: { id, name } | null, parentId, startDate, dueDate,
  createdAt, updatedAt, closedAt
}
```

`category` vaut `todo`, `in_progress` ou `done`. `kind` vaut `feature` ou `bug`.
`priority` est un entier de 0 (aucune) à 4 (la plus haute).
`estimatePoints` est un nombre ou `null` (les colonnes numériques ne sont pas
exposées sous forme de chaînes). Les références et dates facultatives valent
`null`, sauf les champs d’entrée facultatifs qui peuvent être omis.

`ItemDetail` ajoute :

```ts
{
  description, reporter: { id, name } | null,
  parent: { id, key, title } | null,
  children: [{ id, key, title, statusId }],
  labels: [{ id, name, color }],
  comments: [{ id, author: { id, name }, body, createdAt, updatedAt, deletedAt }],
  activities: [{ id, actor: { id, name }, action, field, oldValue, newValue, source, at }],
  url
}
```

`url` est relatif à l’origine : `/b/{backlogKey}?item={KEY}`. Le corps d’un
commentaire supprimé est vide ; `deletedAt` conserve sa date de suppression.
`updatedAt` d’un commentaire vaut `null` s’il n’a jamais été modifié. Les
activités sont triées par instant puis identifiant ; `source` vaut `ui`, `api`,
`mcp` ou `webhook`. Les identifiants de jeton et de corrélation internes ne sont
pas exposés dans le détail. La réponse d’ajout de commentaire utilise le même
objet `Comment` que la liste du détail.

## Écritures

Les corps JSON n’acceptent que les champs indiqués ; un champ inconnu est refusé.
Les valeurs et règles de hiérarchie restent celles de Jiroo.

- Création : `{ backlogKey, type, title, description?, parentKey?, statusId?,
  priority?, assigneeId?, estimatePoints?, startDate?, dueDate?, labelIds?, kind?,
  sprintId? }`. Le titre est non vide (200 caractères maximum), la description
  limitée à 20 000 caractères. Le parent doit respecter la hiérarchie et appartenir
  au même backlog. Le statut initial par défaut est utilisé s’il est omis.
- Modification : au moins un champ parmi `{ title, description, priority,
  assigneeId, statusId, estimatePoints, startDate, dueDate }`. `null` efface la
  description, l’assignation, l’estimation ou une date. `statusId` effectue une
  transition. Les labels, le rapporteur et le parent ne se modifient pas ici.
- Commentaire : `{ body, mentionIds? }`. Corps non vide, 5 000 caractères maximum ;
  au plus 50 identifiants de personnes mentionnées. Les mentions inconnues sont
  ignorées par le service.

Les écritures passent par les cas d’usage partagés et publient les changements
en temps réel. Les activités portent `source=api` et l’identifiant du jeton
ayant authentifié l’appel. Aucune invalidation de page Next n’est nécessaire.

## Erreurs et budget

Les erreurs sont en `application/problem+json` :

```json
{
  "type": "https://jiroo.dev/problems/not_found",
  "title": "Ressource introuvable.",
  "status": 404
}
```

| HTTP | Suffixe de `type` | Détail |
| --- | --- | --- |
| 400 | `validation_error` | JSON, clé, filtre ou curseur invalide ; `errors` contient les issues Zod (`code`, `path`, `message`) quand disponibles |
| 401 | `unauthorized` | Jeton absent/invalide/révoqué/expiré ; en-tête `WWW-Authenticate: Bearer …` |
| 403 | `insufficient_scope` | Écriture avec portée read |
| 403 | `forbidden` | Permission métier insuffisante |
| 404 | `not_found` | Ressource inconnue ou non lisible : réponse identique |
| 405 | `method_not_allowed` | En-tête `Allow` ; `OPTIONS` répond 204 avec les méthodes disponibles |
| 413 | `payload_too_large` | Corps JSON au-delà de 64 Kio |
| 409 | `domain_error` | Règle métier refusée ; `detail` contient le message métier public |
| 429 | `rate_limited` | En-tête `Retry-After` en secondes, minimum 1 |
| 500 | `internal_error` | Message générique et une référence à transmettre à l’équipe ; aucun détail interne |

Le budget partagé est de **300 requêtes par minute et par jeton**, avec une
fenêtre fixe par minute UTC. L’ordre de contrôle est authentification,
réservation atomique du budget, puis portée : toute requête authentifiée est
comptée, y compris celles refusées pour leur portée ou au-delà du quota. Les
requêtes non authentifiées ne consomment pas de budget ; limitez-les en amont
(pare-feu ou proxy). Respectez
`Retry-After` avant de reprendre ; ne réessayez pas automatiquement une écriture
quand son résultat est incertain (absence de clé d’idempotence en v1).

## Exemples

Définissez `JIROO_ORIGIN` et `JIROO_TOKEN` dans votre environnement sécurisé :

```sh
curl "$JIROO_ORIGIN/api/v1/me" -H "Authorization: Bearer $JIROO_TOKEN"
curl --get "$JIROO_ORIGIN/api/v1/items" \
  -H "Authorization: Bearer $JIROO_TOKEN" \
  --data-urlencode 'backlog=CASS' --data-urlencode 'assignee=me' --data-urlencode 'limit=50'
curl --get "$JIROO_ORIGIN/api/v1/items" \
  -H "Authorization: Bearer $JIROO_TOKEN" \
  --data-urlencode 'backlog=CASS' --data-urlencode 'assignee=me' --data-urlencode 'cursor=CURSEUR_REÇU'
curl "$JIROO_ORIGIN/api/v1/items" -X POST \
  -H "Authorization: Bearer $JIROO_TOKEN" -H 'Content-Type: application/json' \
  --data '{"backlogKey":"CASS","type":"composant","title":"Nouveau composant"}'
curl "$JIROO_ORIGIN/api/v1/items/CASS-12" -X PATCH \
  -H "Authorization: Bearer $JIROO_TOKEN" -H 'Content-Type: application/json' \
  --data '{"statusId":"00000000-0000-4000-8000-000000000001"}'
curl "$JIROO_ORIGIN/api/v1/items/CASS-12/comments" -X POST \
  -H "Authorization: Bearer $JIROO_TOKEN" -H 'Content-Type: application/json' \
  --data '{"body":"Vérification terminée."}'
```

Remplacez l’identifiant de statut d’exemple par l’un de
`GET /backlogs/CASS/statuses`.
