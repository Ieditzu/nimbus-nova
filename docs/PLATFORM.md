# Nimbus Nova platform

This is the product plan. [PLAN.md](PLAN.md) is only the API slice that already runs. Do not treat that slice as the product.

Nova is the company in the middle. A person with free time and a person, shop, or partner who needs that time do not hire each other. Both contract with Nova. Nova holds the profile, the listing, the match, the money, and the record. That is the same shape as Uber between rider and driver, or eMAG between buyer and seller. It is not a network attack, and it is not a clone of either company.

Pitch line: `Nimbus Nova este omul din mijloc. Andrei nu o caută pe Maria. Maria nu sună la magazin. Amândoi trec prin Nova.`

## Who is on the platform

| Actor | What they want | What they never do |
| --- | --- | --- |
| Worker, 18+ | Turn a free afternoon into a paid task through one reusable CV | Message the poster off-platform, collect cash, sign a separate contract with Glovo, Tazz, Uber, or Lidl |
| Poster, person or business | Get one clearly scoped task done | Pay the worker directly, see the worker's ID document, home address, or phone |
| Partner | Fill a shift without hiring the worker itself | Become the worker's employer. The partner buys the shift from Nova |
| Organizer | Staff a real volunteer event | Pay a minor, or call paid work volunteering |
| Volunteer, under 18 | Show up, learn, and receive a diploma from the organizer | See a price, a payout, or a paid task |
| Guardian | Approve a minor's volunteer account and see their events | Apply for paid work on the minor's behalf |
| Nova admin | Moderate listings, resolve disputes, issue refunds from the ledger | Edit ratings to hide a complaint, or move money without a ledger entry |
| Nova | Take the platform fee for standing in the middle | Pretend a partnership exists before a partner account is actually signed |

Paid work is 18+. Under 18 is the volunteer lane only. Relabeling a paid task as volunteering is not a feature.

## The ecosystem

Eight products, one Go API, one database. Clients do not keep their own copy of the truth.

```text
mobile worker app ──┐
poster website ─────┼── HTTPS ── Go API ── Postgres
partner console ────┤                 │
admin console ──────┘                 ├── simulated payments now, licensed PSP later
                                      └── object storage for private CV documents
```

Public landing page is on the poster website. It explains the middleman model and links into signup. It is not a separate backend.

| Product | Owner | Job |
| --- | --- | --- |
| Go API and ledger | Haivas | Every state change, every fee, every permission |
| Poster website and landing | Ciprian | Demand side: post, pay, pick, complete |
| Worker mobile app | Perjoc | Supply side: CV, browse, apply, get paid |
| Admin and partner console | Eric | Moderation, disputes, partner shift publishing |
| Product language, CV fields, partner and volunteer rules | Selaru | The words and the cases the software must enforce |
| QA, release checks, pitch | Vlad | Proves the two sides only meet through Nova |

File ownership when those apps exist: `api/**` Haivas, `web/**` except `web/src/admin/**` and `web/src/partner/**` Ciprian, those two folders Eric, `mobile/**` Perjoc. One owner per file. No force-push. AI tools are assistants. Record what they generated.

## What Nova keeps in the middle

The other side never receives a phone number, a home address, a national ID, a CV file, or a payment credential. Posters see display name, city, skills, bio, availability, and ratings. Workers see the task, the area, the time, the proposed amount, and the poster's display name. Private documents stay in Nova's document store and are visible to Nova admin only when a check requires it.

Money path for a paid task:

1. Poster publishes a task with a proposed amount in bani.
2. Nova calculates `platform_fee_bani = amount_bani * 15 / 100`, rounded half away from zero to an integer. The worker payout is `amount_bani - platform_fee_bani`.
3. On accept, the poster pays Nova `amount_bani + platform_fee_bani` is wrong. The poster pays the proposed amount. Nova's fee comes out of that amount. Poster is charged `amount_bani`. Worker is owed `worker_payout_bani`. Nova keeps `platform_fee_bani`.
4. The charge is held by Nova until the poster marks the task complete, or a dispute resolves it.
5. On completion, the ledger releases the payout to the worker and the fee to Nova.
6. On cancel before start, the hold returns to the poster. After start, only admin dispute resolution moves the money.

No wallet-to-wallet payment between poster and worker exists. There is no cash-on-delivery status.

Contract path:

- A worker signs one framework agreement with Nova before the first paid application.
- Accepting a task creates a work order under that agreement. The work order names the task, the time, and the payout. It does not name the poster as the employer.
- A partner shift uses the same work order. The partner is Nova's client. The worker still works under Nova's agreement.
- A volunteer event creates an attendance record, not a work order and not a ledger entry.

## Domain

Build this as one Go process with packages, not microservices. Current code in `api/internal/server` is the marketplace slice. New packages are added beside it. The HTTP routes below are the contract the clients code against. Do not invent fields.

### Identity

`users`: `id`, `role` (`worker`, `poster`, `partner_user`, `organizer`, `guardian`, `admin`), `email`, `phone`, `password_hash`, `status` (`pending`, `active`, `suspended`), `birth_date`, `guardian_user_id`, `created_at`.

`sessions`: `id`, `user_id`, `token_hash`, `expires_at`.

Auth replaces `X-Demo-Actor` only after this package exists. Until then the running server keeps the demo header, and only when `NOVA_DEMO=1`. Production must refuse that header. Clients send `Authorization: Bearer <token>` once login exists. The server loads the user from the token. The client never sends a role.

Routes:

| Method and path | Body in | Body out | Rule |
| --- | --- | --- | --- |
| `POST /v1/auth/register` | `role`, `email`, `password`, `display_name`, `birth_date`, `guardian_email` if under 18 | `user` without secrets | Under 18 can register only as `worker` with a guardian email, and the account stays volunteer-only |
| `POST /v1/auth/login` | `email`, `password` | `token`, `user` | Suspended users get `403 account_suspended` |
| `POST /v1/auth/logout` | empty | `{ "ok": true }` | Deletes the session |
| `GET /v1/me` | none | the signed-in user and profile summary | No token is `401 missing_token` |

Passwords are hashed with bcrypt. Tokens are random 32 bytes, stored as a hash. Email and phone are never returned on a task or application payload.

### Universal CV

`profiles` grows from the current profile. Add `languages`, `transport`, `expected_amount_bani`, `framework_contract_status` (`missing`, `signed`). Skills stay a JSON array. `display_name` stays on the user, not editable through the public task payload.

`documents`: `id`, `user_id`, `kind` (`id_card`, `certificate`), `storage_key`, `visibility` (`private`). A document upload returns an id. It never returns a public URL to the other side.

Routes stay `GET /v1/profiles/me` and `PUT /v1/profiles/me`. PUT gains optional `languages`, `transport`, and `expected_amount_bani`. Old clients that send only the current four fields still work. `POST /v1/profiles/me/documents` accepts a private file and returns `{ "document": { "id", "kind" } }`.

A worker cannot apply to a paid task until `framework_contract_status` is `signed` and `birth_date` says 18 or older. The error is `409 contract_required` or `403 underage`, using the same error envelope as [PLAN.md](PLAN.md).

### Marketplace

The running task, application, accept, complete, review, hide, and reset routes stay. Their JSON is frozen in [PLAN.md](PLAN.md) and [fixtures](fixtures/). New fields are added, not renamed.

Add to every task, including the current responses, only when the column exists:

| Field | Meaning |
| --- | --- |
| `kind` | `local_task`, `partner_shift`, or `volunteer` |
| `partner_id` | null unless `kind` is `partner_shift` |
| `amount_bani` | proposed amount. `0` and ignored for volunteer |
| `platform_fee_bani` | server-calculated. Clients do not send it |
| `worker_payout_bani` | server-calculated |
| `pay_status` | `unpaid`, `held`, `released`, `refunded`. Volunteer is always `unpaid` |
| `contract_id` | work order id after accept, else null |

Until those columns are migrated, the live API omits them rather than inventing zeroes. When Haivas ships the migration, clients must tolerate both the old and new task object for one release, then require the new fields.

New routes:

| Method and path | Who | Effect |
| --- | --- | --- |
| `POST /v1/tasks/{id}/cancel` | owning poster, before `assigned` start time | `409 already_started` after start. Refund if `pay_status` is `held` |
| `GET /v1/tasks/search` | worker | same filters as `GET /v1/tasks` plus `kind` and `from` / `to` RFC3339. Still no GPS |
| `POST /v1/tasks/{id}/dispute` | poster or assignee | `{ "reason": "..." }` creates one open dispute. Second open dispute is `409 dispute_exists` |

Matching is deterministic. A task matches a worker when the city is equal ignoring case, at least one skill string overlaps, and the task interval fits the worker's availability text until real windows exist. Do not call this AI. Sort remains `starts_at`, then `id`.

### Ledger

`ledger_entries`: `id`, `task_id`, `account` (`poster`, `escrow`, `worker`, `platform`), `direction` (`debit`, `credit`), `amount_bani`, `created_at`. Every hold, release, refund, and fee is two rows that sum to zero. Admin cannot update a row. Corrections are new rows.

`payment_intents`: `id`, `task_id`, `provider` (`simulated` now, a licensed provider later), `status` (`requires_payment`, `held`, `released`, `refunded`), `amount_bani`.

| Method and path | Who | Effect |
| --- | --- | --- |
| `POST /v1/tasks/{id}/pay` | owning poster, task `assigned` | Simulated provider moves poster debit to escrow credit. `pay_status` becomes `held` |
| `POST /v1/tasks/{id}/complete` | owning poster | Existing route. If `kind` is paid, it also releases escrow to worker payout plus platform fee. If never paid, `409 payment_required` |
| `GET /v1/me/ledger` | signed-in user | That user's rows only. Admin uses `GET /v1/admin/ledger?task_id=` |

Volunteer tasks reject `/pay` with `409 volunteer_unpaid`.

### Contracts

`contracts`: `id`, `worker_id`, `kind` (`framework`, `work_order`), `parent_id`, `task_id`, `version`, `status` (`draft`, `signed`, `completed`, `cancelled`), `signed_at`.

| Method and path | Who | Effect |
| --- | --- | --- |
| `POST /v1/contracts/framework` | worker 18+ | Creates the Nova framework draft |
| `POST /v1/contracts/{id}/sign` | that worker | Sets `signed`. This is a recorded acceptance, not a qualified electronic signature claim |
| `GET /v1/me/contracts` | worker | Framework plus work orders |

Accept creates the work order in the same transaction as the assignment. If the worker has no signed framework, accept returns `409 contract_required` and does not assign the task.

### Partners

`partners`: `id`, `name`, `status` (`prospect`, `active`, `paused`). A name in the interface is not a partnership. Glovo, Tazz, Uber, and Lidl start as `prospect` examples in copy, not as `active` rows, until a real agreement exists.

`partner_shifts` are tasks with `kind=partner_shift`. A partner user creates them through the partner console. The worker still applies through Nova. The partner sees the accepted worker's display name and status, not their phone or documents.

| Method and path | Who | Effect |
| --- | --- | --- |
| `GET /v1/partner/shifts` | `partner_user` | That partner's shifts |
| `POST /v1/partner/shifts` | `partner_user` of an `active` partner | Creates a `partner_shift` task. Prospect partners get `403 partner_inactive` |
| `GET /v1/admin/partners` | admin | Includes prospects |
| `POST /v1/admin/partners/{id}/activate` | admin | The only way a partner becomes `active` |

### Volunteer lane

`events`: `id`, `organizer_id`, `title`, `city`, `starts_at`, `ends_at`, `slots`, `min_age`, `description`. No amount column.

`attendances`: `id`, `event_id`, `volunteer_id`, `status` (`going`, `checked_in`, `completed`, `no_show`).

`diplomas`: `id`, `event_id`, `volunteer_id`, `code`, `issued_at`. Issued only when attendance is `completed`. The organizer is the issuer. Nova stores the record. Nova does not claim to be a school.

| Method and path | Who | Effect |
| --- | --- | --- |
| `POST /v1/events` | organizer | Creates an event. Amount fields are rejected |
| `GET /v1/events` | volunteer or guardian | Public events. No pay fields in the JSON |
| `POST /v1/events/{id}/attend` | volunteer, age at least `min_age` | Guardian account can read but cannot attend for the minor |
| `POST /v1/events/{id}/check-in` | organizer | Sets `checked_in` |
| `POST /v1/events/{id}/complete` | organizer | Sets `completed` and creates the diploma |

A volunteer `GET /v1/tasks` does not return paid tasks. A worker `GET /v1/events` is allowed. The clients use the role from `GET /v1/me`, not a local switch.

### Trust

Reviews stay `POST /v1/tasks/{id}/reviews` after completion. Add `GET /v1/users/{id}/reputation` returning `{ "count", "average" }` computed from reviews where that user is the subject. No written review text on that public route if the task was hidden.

Disputes freeze the ledger. Complete and refund both fail with `409 dispute_open` until admin posts `POST /v1/admin/disputes/{id}/resolve` with `result` of `release`, `refund`, or `split`. `split` requires `worker_bani` and `poster_bani` that sum to the held amount. The fee stays with Nova only on `release`. On `refund`, the fee returns to the poster too.

### Notifications

`notifications`: `id`, `user_id`, `kind`, `task_id`, `read_at`. Kinds are `application_received`, `application_accepted`, `task_completed`, `payout_released`, `dispute_opened`, `event_reminder`. `GET /v1/me/notifications` returns the signed-in user's rows. Clients poll. No push provider in the first full build.

## Clients

Romanian UI. English JSON. Show server `error.message`. Do not keep a second translation table.

Landing, Ciprian: the current lines in [PLAN.md](PLAN.md), plus `Nova ia cererea, alege omul, ține banii și predă lucrarea.` Do not draw Uber or eMAG logos. Name them in speech as examples of a middleman, not as partners.

Poster website: signup, my tasks, pay, cancel, dispute, and the running create, accept, and complete flow. The poster never sees a worker phone number. The pay button calls `POST /v1/tasks/{id}/pay` and shows `Banii sunt ținuți de Nova.`

Worker app: signup, CV, framework contract, task list, apply, my work, payout status, volunteer events if under 18. Under 18, hide every amount field. The app does not ask for a map permission in the first full build. City is typed.

Partner console, Eric: shift list and create shift. Inactive partners see the form disabled and the server still returns `403`.

Admin console, Eric: the running hide and reset, plus users, partners, disputes, and ledger. Reset stays a demo-only route and returns `404` when `NOVA_DEMO` is not `1`.

## What is already built

The Go process in `api/` implements the marketplace slice: health, tasks, profile, apply, accept, complete, reviews, hide, and demo reset. Tests in `api/integration_test.go` lock that slice. Ciprian and Perjoc build the poster site and worker app against it now. They do not wait for auth, ledger, or partners before the first screen.

The hackathon demo is this slice, told as the middleman story. It is the first screen of the platform, not a separate student project. Do not add a second backend for the full plan.

## Build order

No calendar. Each slice is done when its tests pass and the previous slice still passes.

1. Running slice. Done. Do not rename its fields.
2. Identity. Login works. Demo header dies outside `NOVA_DEMO=1`.
3. CV and framework contract. Paid apply requires both.
4. Ledger and simulated pay. Complete moves money. Volunteer cannot pay.
5. Partner shifts and volunteer events. Prospect partners cannot publish.
6. Disputes, reputation, notifications, admin ledger.

If a later slice slips, the live demo remains slice 1. Do not block the poster and worker screens on payments. Do not claim a live Glovo, Tazz, Uber, eMAG, or Lidl integration. Do not claim the fee, the contract, or the diploma is legally certified. Those are product rules to build. A lawyer reviews them before a public launch.
