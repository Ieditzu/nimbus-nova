# API status

`live` means the route is in `api/` and covered by `go test ./...`. Clients may mount a screen for it.

`planned` means the contract is frozen in [CONTRACT.md](CONTRACT.md), but the server does not have the route yet. Do not mount the screen.

| Route | Status | Client |
| --- | --- | --- |
| `GET /health` | live | website |
| `GET /v1/tasks` | live | phone |
| `GET /v1/tasks/{id}` | live | phone |
| `POST /v1/tasks` | live | both |
| `GET /v1/me/tasks` | live | both |
| `GET /v1/tasks/{id}/applications` | live | website |
| `POST /v1/applications/{id}/accept` | live | website |
| `POST /v1/tasks/{id}/complete` | live | website |
| `POST /v1/tasks/{id}/reviews` | live | website |
| `GET /v1/tasks/{id}/reviews` | live | website |
| `GET /v1/profiles/me` | live | phone |
| `PUT /v1/profiles/me` | live | phone |
| `POST /v1/tasks/{id}/applications` | live | phone |
| `GET /v1/me/applications` | live | phone |
| `POST /v1/auth/register` | live | both, later |
| `POST /v1/auth/identity` | live | phone |
| `POST /v1/auth/identity/{id}/files` | live | phone |
| `POST /v1/auth/identity/{id}/complete` | live | phone |
| `POST /v1/auth/login` | live | both, later |
| `POST /v1/auth/logout` | live | both, later |
| `GET /v1/me` | live | both |
| `PUT /v1/me/phone` | live | phone |
| `POST /v1/tasks/{id}/conversations` | live | phone |
| `GET /v1/me/conversations` | live | phone |
| `GET /v1/conversations/{id}/messages` | live | phone |
| `POST /v1/conversations/{id}/messages` | live | phone |
| `POST /v1/tasks/{id}/pay` | live | website, later |
| `POST /v1/contracts/framework` | live | phone, later |
| `POST /v1/contracts/{id}/sign` | live | phone, later |
| `GET /v1/events` | live | phone, later |
| `POST /v1/events` | live | admin, later |
| `GET /v1/tasks/search` | live | phone |
| `POST /v1/tasks/{id}/cancel` | live | website |
| `POST /v1/tasks/{id}/dispute` | live | both |
| `GET /v1/me/ledger` | live | both |
| `GET /v1/admin/ledger` | live | admin |
| `GET /v1/me/contracts` | live | phone |
| `GET /v1/me/notifications` | live | both |
| `POST /v1/profiles/me/documents` | live | phone |
| `GET /v1/partner/shifts` | live | later |
| `POST /v1/partner/shifts` | live | later |
| `GET /v1/admin/partners` | live | admin |
| `POST /v1/admin/partners/{id}/activate` | live | admin |
| `POST /v1/events/{id}/attend` | live | phone |
| `POST /v1/events/{id}/check-in` | live | admin |
| `POST /v1/events/{id}/complete` | live | admin |
| `GET /v1/users/{id}/reputation` | live | both |
| `POST /v1/admin/disputes/{id}/resolve` | live | admin |
| `GET /v1/admin/users` | live | admin |
| `POST /v1/admin/users/{id}/suspend` | live | admin |
| `POST /v1/admin/users/{id}/activate` | live | admin |
| `GET /v1/admin/logs` | live | admin |
| `GET /v1/admin/disputes` | live | admin |
| `POST /v1/admin/tasks/{id}/unhide` | live | admin |

Haivas changes a row from `planned` to `live` in the same commit as the route and its test. Ciprian and Perjoc do not flip these rows.

Identity routes now use the real server-side ID Analyzer API v2 EU integration. They require a configured EU key and available provider account; unavailable service returns 503 before upload. Both worker and poster registration require a verified, single-use identity proof. CI/CEI success and rejection paths are covered by synthetic provider tests; real-provider probes use synthetic blank images and must reject them.
