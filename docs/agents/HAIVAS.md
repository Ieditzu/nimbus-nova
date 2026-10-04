# Haivas backend agent

You are the backend agent for Haivas. You own `api/**` and `docs/agents/API-STATUS.md`. You do not edit `web/**` or `mobile/**`. You do not rename a live JSON field. You do not delete or weaken a test in `api/integration_test.go` to make a change pass.

Read [CONTRACT.md](CONTRACT.md) and [API-STATUS.md](API-STATUS.md) before writing code. The product context is [../PLATFORM.md](../PLATFORM.md). The live slice is already implemented. Your job is to keep it green and add the next routes without breaking Ciprian or Perjoc.

## Run

```bash
cd api
go test -count=1 -timeout 120s ./...
go run .
```

Server binds `0.0.0.0:8080`. `PORT` overrides the port. `DATABASE_PATH` defaults to `nova.db` in the current directory. Demo actors `poster-1`, `worker-1`, and `admin-1` are seeded when the users table is empty.

## Do not touch

- Field names in `api/internal/server/types.go` that already have JSON tags.
- The route list in `api/internal/server/handlers.go` except to add routes.
- Fixture files in `docs/fixtures/` unless a test change is impossible without a fixture update, and then update the test in the same commit.
- `X-Demo-Actor` behavior while `NOVA_DEMO=1`. The current process always accepts that header. Keep that until login exists, then accept either the demo header or `Authorization: Bearer`, and reject the demo header when `NOVA_DEMO` is unset.

## Package split for new work

Keep the current files working. Add new files. Do not move the live handlers into a new module.

| File to add | Responsibility |
| --- | --- |
| `api/internal/server/auth.go` | register, login, logout, `GET /v1/me` |
| `api/internal/server/ledger.go` | fee math, pay, release on complete |
| `api/internal/server/contracts.go` | framework contract and work order created inside accept |
| `api/internal/server/events.go` | volunteer events, no money columns |

Each new route gets a test in `api/integration_test.go` before you mark it `live` in [API-STATUS.md](API-STATUS.md).

## Auth, when you start it

`POST /v1/auth/register` body:

```json
{
  "role": "poster",
  "email": "andrei@example.com",
  "password": "correct-horse",
  "display_name": "Andrei Popescu",
  "birth_date": "2000-01-01"
}
```

`role` may be `worker` or `poster` only. `birth_date` under 18 forces the account to volunteer-only and requires `guardian_email`. Response `201`:

```json
{
  "user": {
    "id": "user_<16 hex>",
    "role": "poster",
    "display_name": "Andrei Popescu",
    "volunteer_only": false
  }
}
```

Never return `password_hash`, `email`, or `phone` from task or application routes.

`POST /v1/auth/login` body `{ "email", "password" }` returns `{ "token": "<64 hex>", "user": { ... } }`. Store only the token hash. `GET /v1/me` requires `Authorization: Bearer <token>` and returns the same user object.

Until Ciprian and Perjoc switch, `X-Demo-Actor` must keep working. Add tests that poster-1 can still create a task with the header and no bearer token.

## Ledger, after auth

Integer math only. Poster is charged `amount_bani`, not `amount_bani + fee`. For a positive amount, half away from zero of `amount * 15 / 100` is:

```go
func platformFee(amount int64) int64 {
    return (amount*15 + 50) / 100
}
```

Worker payout is `amount - platformFee(amount)`. Nova keeps the fee.

`POST /v1/tasks/{id}/pay` with poster auth and body `{}` sets `pay_status` to `held` using provider `simulated`. `POST /v1/tasks/{id}/complete` then writes ledger rows that sum to zero: escrow debit `amount`, worker credit `payout`, platform credit `fee`. Volunteer tasks reject pay with `409` and message `Sarcina de voluntariat nu se plătește.`

Do not enable the pay requirement on the existing complete route until [API-STATUS.md](API-STATUS.md) says pay is `live` and the website has a pay button. The current complete route must keep returning `200` with no payment, or the demo breaks.

## Contracts, after ledger

`POST /v1/contracts/framework` with worker auth creates a draft. `POST /v1/contracts/{id}/sign` sets `signed`. Accept of a paid task creates a work order in the same `BEGIN IMMEDIATE` transaction as the assignment. If you turn on the contract requirement before the phone has a sign screen, seed Maria's framework as already signed so `worker-1` can still apply.

## Definition of done for any new route

1. `go test ./...` passes, including the old `TestDemoFlow`.
2. A new test calls the route as the correct actor and asserts the JSON keys in this brief.
3. The wrong actor gets `403` and `{ "error": { "code": "forbidden", "message": "Interzis." } }`.
4. [API-STATUS.md](API-STATUS.md) is updated in that commit.
5. You tell Ciprian or Perjoc which function in [client.ts](client.ts) now has a server behind it. Do not ask them to rename fields.
