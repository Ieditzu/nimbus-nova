# API status

`live` means the route is in `api/` and covered by `go test ./...`. Clients may mount a screen for it.

`planned` means the contract is frozen in [CONTRACT.md](CONTRACT.md), but the server does not have the route yet. Do not mount the screen.

| Route | Status | Client |
| --- | --- | --- |
| `GET /health` | live | website |
| `GET /v1/tasks` | live | phone |
| `GET /v1/tasks/{id}` | live | phone |
| `POST /v1/tasks` | live | website |
| `GET /v1/me/tasks` | live | website |
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
| `POST /v1/auth/login` | live | both, later |
| `POST /v1/auth/logout` | live | both, later |
| `GET /v1/me` | live | both, later |
| `POST /v1/tasks/{id}/pay` | live | website, later |
| `POST /v1/contracts/framework` | live | phone, later |
| `POST /v1/contracts/{id}/sign` | live | phone, later |
| `GET /v1/events` | live | phone, later |
| `POST /v1/events` | live | admin, later |

Haivas changes a row from `planned` to `live` in the same commit as the route and its test. Ciprian and Perjoc do not flip these rows.
