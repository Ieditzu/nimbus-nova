# Nimbus Nova API slice

The platform is [PLATFORM.md](PLATFORM.md). This file is only the marketplace slice that already runs. Contract version: `2026-10-04.1`. This file plus `docs/fixtures/` is the current interface between the Go API, the website, the mobile app, and the admin view. If a screen needs a field or route that is not written here or in [PLATFORM.md](PLATFORM.md), add it there before using it. Clients must not invent JSON names, status codes, or headers.

The announced challenge is **man in the middle**, in the Uber / eMAG sense: a platform that sits between two sides. It is not a network man-in-the-middle attack. Public slogan "CONNECT THE DOTS" is still not the challenge. Rules: [VNU-HACK-RULES.md](VNU-HACK-RULES.md) and [vnu-hack-2026-regulament.pdf](vnu-hack-2026-regulament.pdf). Do not submit project-specific code written before the official start as competition work.

## Announced theme

Nova is the middleman. One side has a free afternoon. The other side has a short task. They do not find each other in a Facebook group, and they do not pay each other off-platform. Both sides talk only to Nimbus Nova, the same way a rider and a driver talk only through Uber, or a buyer and a seller talk only through eMAG.

The live split is the proof: Maria acts only in the mobile app, Andrei acts only on the website, and the Go API is the middle. Neither client stores the other side's private contact details. The proposed amount, the application, the acceptance, and the rating all pass through Nova. Nova is not the employer and does not collect the money in this demo. That is the same shape as those platforms, not a partnership with Uber or eMAG.

Pitch line: `Nimbus Nova este omul din mijloc. Andrei nu o caută pe Maria. Maria nu sună la magazin. Amândoi trec prin Nova.`

If the organizers' written wording differs from "man in the middle", keep this product and swap only that sentence. Do not pivot to a security attack, a ride-hailing clone, or an eMAG reseller.

## What the demo is

Nimbus Nova lets an adult worker spend a few free hours on one clearly scoped local task, and lets an adult poster publish that task, pick one applicant, and mark it complete. The hackathon build is an adult-only simulated marketplace. It does not collect money, sign employment contracts, dispatch shifts, verify identity, or place anyone under 18 into paid or "volunteer" work. Do not show driving, ride-sharing, pet care, heavy lifting, home access, or cash handling.

The live demo uses one shared API. The website is the poster. The Expo app is the worker. Admin is a third page on the website. Disconnected mock screens are not a working feature.

UI copy is Romanian. JSON field names, error `code` values, and this document are English. Clients display the server's Romanian `error.message` and do not keep a second translation table.

## Who builds what

Only the six registered teammates contribute. AI tools are assistants, not extra authors; record what they generated. Haivas is the proposed team lead unless the registered roster says otherwise.

| Person | Builds | Must match |
| --- | --- | --- |
| Haivas | Go API, SQLite, seed, reset, tests | Every route, status, and fixture in this file |
| Ciprian | Vite + React + TypeScript website: landing and poster dashboard | `web/src/api/types.ts` copied from the TypeScript block below; actor `poster-1` |
| Perjoc | Expo + TypeScript worker app | The same type block; actor `worker-1` |
| Eric | Admin page only, under `web/src/admin/` | Ciprian's API client; actor `admin-1` |
| Selaru | Romanian seed/demo copy and anonymous adult usability notes | No extra personal fields in the profile |
| Vlad | Curl/smoke checks and the pitch | The acceptance sequence below |

When coding starts, ownership is `api/**` Haivas, `web/**` except `web/src/admin/**` Ciprian, `web/src/admin/**` Eric, `mobile/**` Perjoc, `docs/**` whoever is changing the contract. One owner per file. No force-push.

There is no role switcher. Each surface hardcodes its actor id. The server looks up the role; the client never sends a role.

## Shared transport

- Server listens on `0.0.0.0:8080`. Environment override: `PORT`, default `8080`. Database file: `DATABASE_PATH`, default `nova.db` in the process working directory. Demo command from the repo: `cd api && go run .`, which creates `api/nova.db`.
- Base URL has no trailing slash. Website: `VITE_API_BASE_URL=http://127.0.0.1:8080`. iOS simulator and same-machine tools use that URL. Android emulator uses `http://10.0.2.2:8080`. A physical phone uses `http://<lan-ipv4>:8080`. No Vite proxy, so the website and the contract use the same paths.
- Success and error bodies are JSON, header `Content-Type: application/json; charset=utf-8`.
- Browser calls need CORS. Allow methods `GET, POST, PUT, OPTIONS`. Allow headers `Content-Type, X-Demo-Actor`. Allow origin only when it matches `^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$`. Preflight returns `204` with an empty body. Other origins get no allow-origin header.
- Mutating routes and `/v1/me/*`, `/v1/admin/*` require `X-Demo-Actor` to be exactly `worker-1`, `poster-1`, or `admin-1`. Public reads do not require the header.
- Missing header: `401` and [error-missing-actor.json](fixtures/error-missing-actor.json). Unknown value: `401` and [error-unknown-actor.json](fixtures/error-unknown-actor.json).
- Clients treat any HTTP `2xx` as success. They still send the status required below. On a non-2xx response, parse `{ "error": { "code", "message" } }`. If the body is not that shape, show `Răspuns neașteptat de la server.`
- Lists return `200` and an empty array when nothing matches. They never return `404` for an empty list. Unknown object ids return `404` and [error-not-found.json](fixtures/error-not-found.json).
- Server ignores unknown JSON fields. Clients send only the documented fields. `null` is sent for empty assignee fields; do not omit them. Do not use `omitempty`. Skills and list fields are arrays, never JSON `null`.
- Times are RFC3339 with offset `+03:00`, for example `2026-10-05T14:00:00+03:00`. A `datetime-local` value gets `:00+03:00` appended. Do not send `Z`.
- Money is integer `amount_bani` (1 RON = 100 bani). The client converts a RON input by replacing comma with dot, rejecting more than two fractional digits, and rounding half away from zero to an integer. Display with `(amount_bani / 100).toFixed(2) + " RON"` plus the caption `Sumă propusă. În acest demo nu se încasează plata.`
- New ids are server-generated lowercase `task_`, `app_`, or `rev_` plus 16 hex characters from crypto-strong randomness. Seed ids stay human-readable.

## Types

Copy this block verbatim into `web/src/api/types.ts` and `mobile/src/api/types.ts` when those files are created. Do not rename fields.

```ts
export type ActorId = "worker-1" | "poster-1" | "admin-1";
export type Category = "event_setup" | "light_moving" | "shop_cover" | "other";
export type TaskStatus = "open" | "assigned" | "completed" | "hidden";
export type ApplicationStatus = "pending" | "accepted" | "rejected";

export interface TaskPublic {
  id: string;
  poster_id: string;
  poster_name: string;
  title: string;
  category: Category;
  city: string;
  starts_at: string;
  ends_at: string;
  amount_bani: number;
  description: string;
  safety_note: string;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
}

export interface CreateTaskRequest {
  title: string;
  category: Category;
  city: string;
  starts_at: string;
  ends_at: string;
  amount_bani: number;
  description: string;
  safety_note: string;
}

export interface Profile {
  user_id: string;
  display_name: string;
  skills: string[];
  city: string;
  availability: string;
  bio: string;
}

export interface ProfileWrite {
  skills: string[];
  city: string;
  availability: string;
  bio: string;
}

export interface ApplicationView {
  id: string;
  task_id: string;
  worker_id: string;
  worker_name: string;
  skills: string[];
  city: string;
  bio: string;
  message: string;
  status: ApplicationStatus;
  created_at: string;
}

export interface ApplicationWithTask extends ApplicationView {
  task: TaskPublic;
}

export interface Review {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  subject_id: string;
  subject_name: string;
  stars: number;
  text: string;
  created_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
```

Go structs use the same JSON names and no `omitempty`. Nullable assignee fields are `*string`. `amount_bani` is `int64`. `stars` is `int`.

Label maps, identical on web and mobile:

| Value | Romanian label |
| --- | --- |
| `event_setup` | Amenajare eveniment |
| `light_moving` | Mutat obiecte ușoare |
| `shop_cover` | Acoperire scurtă în magazin |
| `other` | Altele |
| `open` | Deschisă |
| `assigned` | Atribuită |
| `completed` | Finalizată |
| `hidden` | Ascunsă |
| `pending` | În așteptare |
| `accepted` | Acceptată |
| `rejected` | Respinsă |

## Seed

Reset restores exactly these rows and deletes every task, application, review, and profile not listed here.

Users:

| id | role | display_name |
| --- | --- | --- |
| `worker-1` | `worker` | Maria Ionescu |
| `poster-1` | `poster` | Andrei Popescu |
| `admin-1` | `admin` | Moderator Nova |

One profile, [profile.json](fixtures/profile.json), for `worker-1`. No applications, reviews, or hidden tasks. Two open tasks, in this order, in [task-list.json](fixtures/task-list.json):

- `task_seed_event_setup`, poster `poster-1`, category `event_setup`, city `București`, `2026-10-05T14:00:00+03:00` to `2026-10-05T16:00:00+03:00`, `10000` bani, created `2026-10-04T12:05:00+03:00`.
- `task_seed_shop_cover`, poster `poster-1`, category `shop_cover`, city `București`, `2026-10-06T10:00:00+03:00` to `2026-10-06T14:00:00+03:00`, `15000` bani, created `2026-10-04T12:06:00+03:00`.

`GET /v1/tasks` with no query returns [task-list.json](fixtures/task-list.json): `starts_at` ascending, then `id` ascending. The second task remains open after the demo accepts the first, so the phone list does not go empty.

## Endpoints

### `GET /health`

No actor. `200` [health.json](fixtures/health.json).

### `GET /v1/tasks`

Public. Query `category` and `city` are optional. Blank values are ignored. `category` must be a known category or the response is `400` [error-invalid-category.json](fixtures/error-invalid-category.json). `city` is trimmed and compared with `strings.EqualFold`. Only `status=open` tasks are returned. Sort `starts_at`, then `id`, ascending. `200` `{ "tasks": [...] }`.

### `GET /v1/tasks/{id}`

Public. Hidden or missing: `404` [error-not-found.json](fixtures/error-not-found.json). Otherwise `200` `{ "task": TaskPublic }`. Open seed example: [task-open.json](fixtures/task-open.json).

### `POST /v1/tasks`

Actor must be `poster-1`; anyone else gets `403` [error-forbidden.json](fixtures/error-forbidden.json). Body: [create-task-request.json](fixtures/create-task-request.json). Server sets id, `poster_id`, `poster_name`, `status=open`, null assignee fields, and `created_at`. `201` `{ "task": TaskPublic }`. Invalid JSON: `400` [error-invalid-json.json](fixtures/error-invalid-json.json). First failed validation rule: `400` with `code=invalid_input` and the matching message below.

### `GET /v1/me/tasks`

Actor must be `poster-1`. `200` and that poster's tasks except `hidden`, `created_at` descending. Worker or admin: `403`.

### `GET /v1/profiles/me`

Actor must be `worker-1`. `200` [profile.json](fixtures/profile.json) wrapped as `{ "profile": ... }` when the seed profile exists. No profile: `404`. Other actors: `403`.

### `PUT /v1/profiles/me`

Actor must be `worker-1`. Body: [profile-write.json](fixtures/profile-write.json). Replaces skills, city, availability, and bio. `display_name` stays the user row. `200` `{ "profile": Profile }`. Other actors: `403`.

### `POST /v1/tasks/{id}/applications`

Actor must be `worker-1` and must already have a profile. Body: [apply-request.json](fixtures/apply-request.json). `201` `{ "application": ApplicationView }` using [application.json](fixtures/application.json) as the field shape. The server fills worker fields from the profile and user row.

Conflicts, in this check order: missing/hidden task `404`; actor is not a worker `403`; actor is the poster `409` `cannot_apply_own_task`; no profile `409` `profile_required`; task status is not `open` `409` `task_not_open`; existing row for the same task and worker `409` `duplicate_application`. Messages are in the error table. Do not create the row on conflict.

### `GET /v1/tasks/{id}/applications`

Actor must be the poster who owns that task. `200` `{ "applications": [...] }`, `created_at` ascending. Seed result for an untouched task: [application-list-empty.json](fixtures/application-list-empty.json). A non-owner, worker, or admin gets `403`. Missing task: `404`. This list is not embedded in `GET /v1/tasks`.

### `GET /v1/me/applications`

Actor must be `worker-1`. `200` `{ "applications": [ApplicationWithTask] }`, application `created_at` descending. Each item includes the full task, including assigned and completed tasks, but omits hidden tasks. Example shape after a live apply: [my-applications.json](fixtures/my-applications.json). Other actors: `403`.

### `POST /v1/applications/{id}/accept`

Actor must be the poster who owns the application's task. Empty JSON object `{}`. In one `BEGIN IMMEDIATE` transaction, reread the task. If the application is missing: `404`. If the actor is not the owning poster: `403`. If the task is not `open` or the application is not `pending`: `409` `task_already_assigned`. Otherwise set that application to `accepted`, set every other `pending` application on that task to `rejected`, set the task to `assigned`, and set `assignee_id` to the worker. `200` `{ "task": TaskPublic }` with the assigned shape in [task-assigned.json](fixtures/task-assigned.json). Clients then refetch applications; they do not expect applications inside this response.

### `POST /v1/tasks/{id}/complete`

Actor must be the owning poster. Empty object `{}`. Task must be `assigned`, then becomes `completed` and keeps `assignee_id`. `200` `{ "task": TaskPublic }`. Not assigned: `409` `task_not_assigned`. Non-owner: `403`. Missing: `404`.

### `POST /v1/tasks/{id}/reviews`

Actor must be the owning poster or the assignee, and the task must be `completed`. Body: [review-request.json](fixtures/review-request.json). The client does not send subject or author. Server sets `author_id` from the actor and `subject_id` to the other participant. `201` `{ "review": Review }` matching [review.json](fixtures/review.json). Not completed: `409` `task_not_completed`. Actor is neither participant: `403`. Second review by the same author: `409` `duplicate_review`.

### `GET /v1/tasks/{id}/reviews`

Public for a non-hidden task. `200` `{ "reviews": [...] }`, `created_at` ascending. Empty seed result: [review-list-empty.json](fixtures/review-list-empty.json). Hidden or missing task: `404`.

### `GET /v1/admin/tasks`

Actor must be `admin-1`. `200` and every task, including hidden, `created_at` descending. The untouched seed matches [admin-task-list.json](fixtures/admin-task-list.json). Other actors: `403`.

### `POST /v1/admin/tasks/{id}/hide`

Actor must be `admin-1`. Empty object `{}`. Sets `hidden`. Already hidden is still `200` and stays hidden. `200` `{ "task": TaskPublic }` matching [task-hidden.json](fixtures/task-hidden.json) for the shop-cover example. Missing: `404`. Other actors: `403`. There is no unhide route.

### `POST /v1/demo/reset`

Actor must be `admin-1`. Empty object `{}`. Deletes all tasks, applications, reviews, and profiles, then inserts the seed. `200` [health.json](fixtures/health.json). Other actors: `403`. This is a local demo control, not a production endpoint.

## Validation and errors

Trim strings before measuring length. The first failing rule wins.

| Rule | `message` |
| --- | --- |
| title length not in 3..80 | `Titlul trebuie să aibă între 3 și 80 de caractere.` |
| category not in the four values | `Categoria trebuie să fie event_setup, light_moving, shop_cover sau other.` |
| city length not in 2..80 | `Orașul trebuie să aibă între 2 și 80 de caractere.` |
| time not RFC3339 | `Timpul trebuie să fie RFC3339 cu fus orar.` |
| `ends_at` is not after `starts_at` | `Ora de final trebuie să fie după ora de început.` |
| duration greater than 12 hours | `Durata trebuie să fie de cel mult 12 ore.` |
| `amount_bani` not an integer in 0..500000 | `Suma trebuie să fie un număr întreg de bani între 0 și 500000.` |
| description length not in 10..500 | `Descrierea trebuie să aibă între 10 și 500 de caractere.` |
| safety note longer than 200 | `Nota de siguranță poate avea cel mult 200 de caractere.` |
| message length not in 1..280 | `Mesajul trebuie să aibă între 1 și 280 de caractere.` |
| skills length not in 1..8, or an item length not in 1..40 | `Competențele trebuie să conțină între 1 și 8 elemente, fiecare de cel mult 40 de caractere.` |
| availability length not in 1..80 | `Disponibilitatea trebuie să aibă între 1 și 80 de caractere.` |
| bio longer than 280 | `Bio poate avea cel mult 280 de caractere.` |
| stars not an integer in 1..5 | `Nota trebuie să fie un număr întreg între 1 și 5.` |
| review text length not in 1..280 | `Textul trebuie să aibă între 1 și 280 de caractere.` |

| HTTP | `code` | `message` | Fixture |
| --- | --- | --- | --- |
| 400 | `invalid_json` | `JSON invalid.` | [error-invalid-json.json](fixtures/error-invalid-json.json) |
| 400 | `invalid_input` | the first rule above | [error-invalid-category.json](fixtures/error-invalid-category.json) is the category case |
| 401 | `missing_actor` | `Lipsește antetul X-Demo-Actor.` | [error-missing-actor.json](fixtures/error-missing-actor.json) |
| 401 | `unknown_actor` | `Actor necunoscut.` | [error-unknown-actor.json](fixtures/error-unknown-actor.json) |
| 403 | `forbidden` | `Interzis.` | [error-forbidden.json](fixtures/error-forbidden.json) |
| 404 | `not_found` | `Nu există.` | [error-not-found.json](fixtures/error-not-found.json) |
| 409 | `cannot_apply_own_task` | `Nu poți aplica la propria sarcină.` | same envelope shape |
| 409 | `profile_required` | `Completează profilul înainte să aplici.` | same envelope shape |
| 409 | `task_not_open` | `Sarcina nu este deschisă.` | same envelope shape |
| 409 | `duplicate_application` | `Ai aplicat deja la această sarcină.` | [error-duplicate-application.json](fixtures/error-duplicate-application.json) |
| 409 | `task_already_assigned` | `Sarcina este deja atribuită.` | same envelope shape |
| 409 | `task_not_assigned` | `Sarcina nu este atribuită.` | same envelope shape |
| 409 | `task_not_completed` | `Sarcina nu este finalizată.` | same envelope shape |
| 409 | `duplicate_review` | `Ai lăsat deja o recenzie.` | same envelope shape |
| 500 | `internal` | `Eroare internă.` | no stack trace or SQL text |

## Website (Ciprian)

Stack: Vite, React, TypeScript, `react-router-dom`. Routes are only `/`, `/poster`, and `/admin`. The poster page always sends `X-Demo-Actor: poster-1`. It does not ask the user to type an actor.

`/` landing, no task fixture hardcoded:

- Heading `Nimbus Nova`.
- Text `Omul din mijloc dintre cine are timp și cine are o sarcină scurtă.`
- Text `Demo pentru adulți. Nu se încasează bani și nu se face angajare.`
- Link labeled `Postează o sarcină` to `/poster`.
- Text `Lucrătorii folosesc aplicația mobilă.`
- A health line from `GET /health`: `API pornit` or `API oprit`.

`/poster`:

- Form fields map one-to-one onto `CreateTaskRequest`. Category is a select of the four values, showing the Romanian labels and submitting the English values. Amount is a RON text input converted to `amount_bani` before send. Safety note may be empty.
- Submit calls `POST /v1/tasks`. On success, clear the form and refetch `GET /v1/me/tasks`. On failure, show `error.message`.
- The list calls `GET /v1/me/tasks`, not the public open-task list. Columns: title, category label, city, interval, formatted amount, status label. Empty copy: `Nu ai sarcini încă.`
- Expanding a row calls `GET /v1/tasks/{id}/applications`. Show worker name, skills joined with `, `, city, message, and status label. Button `Acceptă` is enabled only when the application is `pending` and the task is `open`. It calls `POST /v1/applications/{id}/accept` with `{}`, then refetches the task list and that row's applications.
- Button `Finalizează` is enabled only when the task is `assigned`. It calls `POST /v1/tasks/{id}/complete` with `{}`, then refetches.
- After completion, a review form sends `POST /v1/tasks/{id}/reviews` and then calls `GET /v1/tasks/{id}/reviews`. Stars are a select from 1 to 5.
- Every data region has loading, empty, and error states. Loading copy: `Se încarcă...`.

Ciprian creates `web/src/api/client.ts` with these exact function names, all attaching `poster-1` except `getHealth` and the admin functions, which attach the actor argument:

```ts
export function getHealth(): Promise<{ ok: true }>;
export function createTask(body: CreateTaskRequest): Promise<{ task: TaskPublic }>;
export function listMyTasks(): Promise<{ tasks: TaskPublic[] }>;
export function listTaskApplications(taskId: string): Promise<{ applications: ApplicationView[] }>;
export function acceptApplication(applicationId: string): Promise<{ task: TaskPublic }>;
export function completeTask(taskId: string): Promise<{ task: TaskPublic }>;
export function createReview(taskId: string, body: { stars: number; text: string }): Promise<{ review: Review }>;
export function listReviews(taskId: string): Promise<{ reviews: Review[] }>;
export function listAdminTasks(): Promise<{ tasks: TaskPublic[] }>;
export function hideTask(taskId: string): Promise<{ task: TaskPublic }>;
export function resetDemo(): Promise<{ ok: true }>;
```

Admin functions send `admin-1`. Eric imports this module and does not write a second client.

## Mobile (Perjoc)

Stack: Expo, React Native, TypeScript, React Navigation native stack. Hardcoded actor `worker-1`. Screens:

- `TaskListScreen`: `GET /v1/tasks`. Optional city input defaults to `București`. Optional category select. Row shows title, category label, interval, amount, and `safety_note`. Empty copy: `Nu există sarcini deschise.` Tap opens `TaskDetailScreen`.
- `TaskDetailScreen`: `GET /v1/tasks/{id}`. Text input for `message`. Button `Aplică` calls `POST /v1/tasks/{id}/applications`. If `code` is `profile_required`, navigate to `ProfileScreen`. On `201`, navigate to `MyApplicationsScreen`.
- `ProfileScreen`: `GET /v1/profiles/me` on open. `display_name` is read-only. Skills are edited as comma-separated text and sent as a trimmed JSON array with empty items removed. Save calls `PUT /v1/profiles/me`.
- `MyApplicationsScreen`: `GET /v1/me/applications`. Each card shows task title, application status label, and task status label.

No map, GPS, camera, CV upload, chat, or payment control. Pull-to-refresh repeats the same GET.

## Admin (Eric)

Route `/admin`, using Ciprian's client, actor `admin-1`. Table from `GET /v1/admin/tasks` with title, poster name, status label, and city. Button `Ascunde` calls `POST /v1/admin/tasks/{id}/hide` and refetches. Button `Resetează demo` first asks `window.confirm("Resetezi datele demo?")`; on confirm it calls `POST /v1/demo/reset`, then refetches. Do not add unhide, user editing, or a second API wrapper.

## Backend (Haivas)

Use Go's standard `net/http` and `modernc.org/sqlite` (pure Go, no CGO). No HTTP framework. Tables:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('worker', 'poster', 'admin')),
  display_name TEXT NOT NULL
);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  skills_json TEXT NOT NULL,
  city TEXT NOT NULL,
  availability TEXT NOT NULL,
  bio TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  amount_bani INTEGER NOT NULL,
  description TEXT NOT NULL,
  safety_note TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'completed', 'hidden')),
  assignee_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  UNIQUE (task_id, worker_id)
);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  subject_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, author_id)
);
```

`poster_name`, `assignee_name`, and `worker_name` are joined from `users.display_name` at read time, not stored on the task. Skills are a JSON array in `skills_json`. Accept and reset run in a transaction. Two concurrent accepts must leave exactly one `accepted` application and one assignee. Public queries add `status != 'hidden'`, and the open list also adds `status = 'open'`.

Startup inserts the seed only when `users` is empty, and also exposes reset. Do not trust a client-supplied `poster_id`, `status`, or `role`. The executable lock is `api/integration_test.go`. From `api/`, `go test ./...` must pass. Do not delete or weaken a test to make a change pass. The website and mobile app are aligned only when they call the routes that suite exercises.

## Acceptance sequence (Vlad)

From a clean reset, against `http://127.0.0.1:8080`:

1. `GET /health` returns [health.json](fixtures/health.json).
2. `GET /v1/tasks` returns [task-list.json](fixtures/task-list.json).
3. `GET /v1/tasks/task_seed_event_setup` returns [task-open.json](fixtures/task-open.json).
4. `POST /v1/tasks/task_seed_event_setup/applications` without a header returns [error-missing-actor.json](fixtures/error-missing-actor.json).
5. The same POST with `X-Demo-Actor: worker-1` and [apply-request.json](fixtures/apply-request.json) returns `201` and the field shape of [application.json](fixtures/application.json).
6. Repeating step 5 returns `409` and [error-duplicate-application.json](fixtures/error-duplicate-application.json).
7. `POST /v1/applications/{new-id}/accept` with `X-Demo-Actor: poster-1` and `{}` returns `200`, `status=assigned`, `assignee_id=worker-1`, and `assignee_name=Maria Ionescu`.
8. Repeating accept returns `409` and `code=task_already_assigned`.
9. `GET /v1/me/applications` with `worker-1` shows that application and the assigned task.
10. `POST /v1/tasks/task_seed_event_setup/complete` with `poster-1` returns `status=completed`.
11. `POST /v1/admin/tasks/task_seed_shop_cover/hide` with `admin-1` returns `status=hidden`.
12. `GET /v1/tasks` no longer contains `task_seed_shop_cover`, and `GET /v1/tasks/task_seed_shop_cover` is `404`.
13. `POST /v1/demo/reset` with `admin-1` restores step 2.

The website and phone must perform the same apply and accept path against this process, not against fixture imports. Fixture files are for contract checks and offline typing only.

## Demo story and cut order

Demo story, same data as the seed: Andrei publishes event setup for 100.00 RON proposed on the website. He never sees Maria's phone number. Maria applies from the phone and never messages Andrei directly. Nova accepts the match in the middle. Maria sees `Acceptată` / `Atribuită`. Andrei presses `Finalizează`. Nobody is paid and nobody is employed.

If integration is failing, stop in this order: reviews, admin hide/reset, landing polish, category filter. Do not drop public task list, worker apply, or poster accept. Do not claim a Glovo, Tazz, Uber, eMAG, or Lidl partnership, a ride dispatch, a shop checkout, a Nova employment contract, a diploma, or legal compliance. Name Uber and eMAG only as the jury's examples of a middleman. Selaru may collect anonymous adult feedback, but missing feedback is recorded as untested rather than invented.

Pitch evidence is the two sides meeting only through the API, the live cross-device state change, the safety limits, and the source/AI attribution list. Judging weights are in the rules doc.
