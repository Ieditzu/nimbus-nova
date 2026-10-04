# Shared contract

Haivas, Ciprian, and Perjoc build different folders. This file is the only interface between them. If a screen needs a field that is not here, stop and add it to this file in the same commit as the API change. Do not invent JSON names in the website or the phone.

The running server already implements the live routes below. Prove it with `cd api && go test ./...` before changing it. Start it with `cd api && go run .`. It listens on `http://127.0.0.1:8080`.

## Actors for the first build

There is no login yet. Each app hardcodes one actor. There is no role switcher.

| App | Header | Id |
| --- | --- | --- |
| Ciprian website | `X-Demo-Actor: poster-1` | Andrei Popescu, poster |
| Perjoc mobile app | `X-Demo-Actor: worker-1` | Maria Ionescu, worker |
| Nobody in this three-person build | `X-Demo-Actor: admin-1` | Leave admin routes alone |

The server looks up the role from that id. The client never sends a role field. Demo screens may keep the header above. Real login screens call `createNovaClient(baseUrl, { token })`. That form sends `Authorization: Bearer <token>` and does not send `X-Demo-Actor`. CORS allows `Authorization`.

## Transport

- Base URL has no trailing slash. Website: `VITE_API_BASE_URL=http://127.0.0.1:8080`. iOS simulator: `http://127.0.0.1:8080`. Android emulator: `http://10.0.2.2:8080`. A physical phone uses `http://<lan-ipv4>:8080`.
- No Vite proxy. Call the API directly so CORS is the same bug the phone does not have.
- Send `Content-Type: application/json` when there is a body.
- Success and error bodies are JSON. Read `Content-Type: application/json; charset=utf-8`.
- Treat any HTTP 2xx as success. Create task, apply, and review return `201`. Other successes return `200`.
- On a non-2xx response, parse `{ "error": { "code": "...", "message": "..." } }` and show `message`. If the body is not that shape, show `Răspuns neașteptat de la server.`
- Lists are objects, never bare arrays: `{ "tasks": [] }`, `{ "applications": [] }`, `{ "reviews": [] }`. An empty list is `200`, not `404`.
- Money is integer `amount_bani`. 100 lei is `10000`. Display `(amount_bani / 100).toFixed(2) + " RON"` plus `Sumă propusă. În acest demo nu se încasează plata.`
- Times are RFC3339 with offset `+03:00`, for example `2026-10-05T14:00:00+03:00`. A `datetime-local` value gets `:00+03:00` appended. Do not send `Z`.
- Do not send `poster_id`, `status`, `assignee_id`, `phone`, or `role`. The server ignores unknown fields and sets those itself.

Copy [types.ts](types.ts) into both clients. Do not rename fields. Copy [client.ts](client.ts) and pass the actor for that app.

## Live routes

These work today. Wave A screens may call only these.

| Call | Header | Body | Success |
| --- | --- | --- | --- |
| `GET /health` | none | none | `{ "ok": true }` |
| `GET /v1/tasks?category=&city=&sector=&lat=&lng=&radius_km=` | none | none | `{ "tasks": [TaskPublic] }` open tasks only, `starts_at` ascending |
| `GET /v1/tasks/{id}` | none | none | `{ "task": TaskPublic }` |
| `POST /v1/tasks` | poster-1 | `CreateTaskRequest` | `201` `{ "task": TaskPublic }` |
| `GET /v1/me/tasks` | poster-1 | none | `{ "tasks": [TaskPublic] }` this poster's tasks, `created_at` descending |
| `GET /v1/tasks/{id}/applications` | poster-1 | none | `{ "applications": [ApplicationView] }` |
| `POST /v1/applications/{id}/accept` | poster-1 | `{}` | `{ "task": TaskPublic }` status `assigned` |
| `POST /v1/tasks/{id}/complete` | poster-1 | `{}` | `{ "task": TaskPublic }` status `completed` |
| `POST /v1/tasks/{id}/reviews` | poster-1 | `{ "stars": 5, "text": "..." }` | `201` `{ "review": Review }` |
| `GET /v1/tasks/{id}/reviews` | none | none | `{ "reviews": [Review] }` |
| `GET /v1/profiles/me` | worker-1 | none | `{ "profile": Profile }` |
| `PUT /v1/profiles/me` | worker-1 | `ProfileWrite` | `{ "profile": Profile }` |
| `POST /v1/tasks/{id}/applications` | worker-1 | `{ "message": "..." }` | `201` `{ "application": ApplicationView }` |
| `GET /v1/me/applications` | worker-1 | none | `{ "applications": [ApplicationWithTask] }` |

`category` must be empty or one of `event_setup`, `light_moving`, `shop_cover`, `other`. `city` and `sector` are matched ignoring case after trim. Blank query params are ignored. `photo_url` is an empty string or an http(s) URL. `sector` is an empty string or at most 40 characters. `lat` and `lng` are numbers; `0` and `0` means unknown. Near-me needs `lat`, `lng`, and `radius_km` together. `radius_km` is greater than 0 and at most 100. A missing piece, or a radius without both coordinates, is `400` `invalid_input` with `Pentru căutare în apropiere trimite lat, lng și radius_km.` `GET /v1/tasks/search` stays worker-only and keeps `kind`, `from`, `to`, and `city`. Call it with `searchTasks`.

Seeded tasks the phone must already see before anyone creates one:

- `task_seed_event_setup`, `Ajutor la amenajarea evenimentului`, `10000` bani, București, 5 Oct 2026 14:00–16:00 `+03:00`
- `task_seed_shop_cover`, `Acoperire scurtă la stand`, `15000` bani, București, 6 Oct 2026 10:00–14:00 `+03:00`

Maria's profile is already seeded. Andrei has no worker profile. Do not make the website call profile routes.

## Errors the UI must show verbatim

| HTTP | `code` | Show this `message` |
| --- | --- | --- |
| 400 | `invalid_json` | `JSON invalid.` |
| 400 | `invalid_input` | the server sentence, including `Titlul trebuie să aibă între 3 și 80 de caractere.` |
| 401 | `missing_actor` | `Lipsește antetul X-Demo-Actor.` |
| 401 | `unknown_actor` | `Actor necunoscut.` |
| 403 | `forbidden` | `Interzis.` |
| 404 | `not_found` | `Nu există.` |
| 409 | `duplicate_application` | `Ai aplicat deja la această sarcină.` |
| 409 | `task_not_open` | `Sarcina nu este deschisă.` |
| 409 | `task_already_assigned` | `Sarcina este deja atribuită.` |
| 409 | `task_not_assigned` | `Sarcina nu este atribuită.` |
| 409 | `task_not_completed` | `Sarcina nu este finalizată.` |
| 409 | `profile_required` | `Completează profilul înainte să aplici.` |
| 409 | `duplicate_review` | `Ai lăsat deja o recenzie.` |

Validation limits, first failure wins: title 3–80, category one of the four values, city 2–80, `ends_at` after `starts_at`, duration at most 12 hours, `amount_bani` integer 0–500000, description 10–500, safety note at most 200, message 1–280, skills 1–8 items of 1–40, availability 1–80, bio at most 280, stars integer 1–5, review text 1–280.

## Labels

## Later routes

Check [API-STATUS.md](API-STATUS.md) before mounting a screen. A route marked `live` may be called. A route marked `planned` must not be mounted. Fee rule when pay is used: the poster is charged `amount_bani`. The worker payout is `amount_bani` minus the 15 percent platform fee, rounded half away from zero. Nova keeps the fee. Clients display the server numbers. They do not calculate a second fee.
| `hidden` | Ascunsă |
| `pending` | În așteptare |
| `accepted` | Acceptată |
| `rejected` | Respinsă |

## Wave A demo both clients must survive

1. Start the API. Website health line says `API pornit`.
2. Phone shows both seeded tasks without creating them.
3. Website creates `Ajutor la stand`, category `shop_cover`, city `București`, a two-hour slot, `120` RON. The form converts that to `amount_bani: 12000` before `POST /v1/tasks`.
4. Phone refresh shows that task. Maria applies with `Pot ajunge la 13:45 și ajut la amenajare.`
5. Website expands the task, sees Maria, presses `Acceptă`.
6. Phone `Aplicările mele` shows `Acceptată` and task `Atribuită`.
7. Website presses `Finalizează`. Phone shows task `Finalizată`.
8. Nobody is paid. The caption about no payment stays visible.

## Not live yet

Do not route these in Wave A. Haivas adds them without renaming the live fields. Clients already have the functions in [client.ts](client.ts), but the pages stay unmounted until `docs/agents/API-STATUS.md` marks the route `live`.

| Route | Owner | Client that will call it |
| --- | --- | --- |
| `POST /v1/auth/register` | Haivas | both, later |
| `POST /v1/auth/login` | Haivas | both, later |
| `GET /v1/me` | Haivas | both, later |
| `POST /v1/tasks/{id}/pay` | Haivas | website |
| `POST /v1/contracts/framework` | Haivas | phone |
| `POST /v1/contracts/{id}/sign` | Haivas | phone |
| `GET /v1/events` | Haivas | phone, under 18 only |

Fee rule when pay exists: poster is charged `amount_bani`. Worker payout is `amount_bani - floor(amount_bani * 15 / 100)` using integer math, half away from zero. Nova keeps the fee. Clients display those numbers. They do not calculate a second fee.

## Identity proof

Worker and poster `POST /v1/auth/register` require `identity_proof`. A client `birth_date` cannot establish identity. A minor worker also supplies `guardian_email`; minors cannot register as posters. The server derives birth date and volunteer eligibility from the verified document.

`POST /v1/auth/identity` accepts `{ "email", "kind" }`, with `kind` equal to `ci` or `cei`. It checks the server-side ID Analyzer EU configuration, account availability and liveness profile before accepting photographs. Unavailable configuration returns `503 identity_unavailable`. A successful `201` returns `{ "verification": { "id", "email", "kind", "status": "collecting", "expires_at", "checks" } }`, with pending checks. Sessions expire after 15 minutes.

`POST /v1/auth/identity/{id}/files` accepts `{ "slot", "content_type", "content_base64" }`. CI requires `ci_front`, `ci_back`, and `selfie`. CEI requires `cei_front`, `cei_back`, `cei_pdf`, and `selfie`. Photographs may be JPEG or PNG, with each file at most 2 MB. CEI requires the original PDF exported by RO CEI Reader. Legacy `ci_scan_text` is ignored for identity verification. The response is `{ "file": { "id", "slot", "sha256" } }`; document bytes are never returned.

`POST /v1/auth/identity/{id}/complete` sends the document photographs and selfie to ID Analyzer API v2 in its EU region using a server-only key. It requires an accepted Romanian identity document, face match and the provider liveness checks. CI birth date comes from OCR and a valid matching CNP. CEI additionally requires PDF text extraction, a valid CNP matching the document birth date, and a matching document number or CNP between PDF and document OCR. The provider request disables saved results, saved images, output images, audit reports and webhooks.

Successful `200` responses contain `verification.status: "verified"`, passed `files`, `cnp`, `selfie`, `face_match` and `document` checks (`pdf` also passes for CEI), and `proof: { "token", "expires_at", "email" }`. Rejected or review results return `proof: null`, corresponding verification status/checks, and a safe Romanian `message`. Clients must require all five shared checks and a proof before registration. Status can also be `processing` or `consumed`. Temporary uploaded bytes are deleted after completion or rejection, and expired uploads are periodically removed. This is application-level deletion, not a guarantee of physical SQLite media erasure or provider retention outside the request settings.

Registration supplies the proof token and the same email. Only proofs marked by the real verification integration are accepted; legacy proofs are invalid. Proof consumption and account creation occur in one transaction. Missing proof is `409 identity_required`, expiration is `409 proof_expired`, and reuse is `409 proof_used`. Existing account login is unchanged. The user explicitly authorized these backend and contract changes while the hub remains paused; the website registration client must adopt this proof flow before creating new accounts.

## Mobile accounts, phone onboarding, and job conversations

Perjoc was explicitly authorized by the user to implement these backend and shared-contract changes while the hub is paused. No web files change.

`PublicAccount` now includes `phone_number` on register/login/me and phone-update responses. The number is private account data; it is not returned on public tasks, profiles, or conversation participants. Old accounts start with an empty number. Registration can include `phone_number`; otherwise onboarding must collect it before app access. `PUT /v1/me/phone` requires a bearer token and `{ "phone_number": "+40712345678" }`, returning `200 { "user": PublicAccount }`. Normalization strips spaces/dashes/parentheses, accepts `00` country prefixes and Romanian `07...` numbers, and validates an international number of 8–15 digits. It does not verify ownership with SMS.

Bearer-authenticated worker/poster accounts without a phone number receive `409 phone_required` on protected API routes. `/v1/me`, logout and phone update remain available for onboarding. Existing demo headers remain supported on the old routes; chat always requires a real bearer session. Suspended sessions are rejected.

Adult workers can now publish and manage their own tasks without changing their `role`. Ownership checks still apply to applications, acceptance, completion, and cancellation. Minors cannot publish. Workers cannot apply to their own task. `GET /v1/me/tasks` lists only the authenticated account's tasks. Profiles may be edited by worker or poster accounts. Poster accounts continue to publish; applying and signing worker contracts remain worker-only.

- `POST /v1/tasks/{id}/conversations`: a member contacts the task owner with `{}`. An owner can contact an applicant with `{ "participant_id": user_id }`. Repeated calls return the same thread. New threads require an open visible task; existing threads can reopen after completion. Returns `200 { "conversation": Conversation }`.
- `GET /v1/me/conversations`: returns the member's most recent 100 threads as `{ "conversations": Conversation[] }`.
- `GET /v1/conversations/{id}/messages`: returns the newest 100 messages ordered oldest first. `?before=sequence` loads older history; `?after=sequence` loads later messages. Do not combine cursors. Returns `MessagePage`, including `next_cursor`, `previous_cursor`, and `has_more` in the requested direction.
- `POST /v1/conversations/{id}/messages`: `{ "text": string }`, 1–2000 Unicode characters after trimming. Returns `201 { "message": ChatMessage }`. The server sets sender, sequence, IDs and timestamps. Only participants can read/send; other accounts get `404`. No sends to suspended participants or hidden jobs.

`Conversation` includes `id`, `task_id`, `task_title`, `other_user: { id, display_name }`, `last_message: ChatMessage | null`, and `updated_at`. `ChatMessage` includes `id`, integer `sequence`, `conversation_id`, `sender_id`, `text`, and `created_at`. Copy the shared client/types verbatim.

The supplied test login is now a real hashed-password account only when both `NOVA_DEMO=1` and `NOVA_TEST_ACCOUNT=1` are set. Its phone is initially empty. No mobile authentication shortcut or fake bearer token remains. Production should leave `NOVA_TEST_ACCOUNT` unset. CI/CEI identity provider availability is unchanged by this feature.

### Guided selfie video

The phone now captures an eight-second silent selfie video, with prompts to face forward, turn gently left/right, and return forward. `selfie_video` is an optional upload slot for CI and CEI and replaces the required `selfie` photograph when supplied. It accepts `video/mp4`, `video/quicktime`, or `video/webm`, up to 8 MB. Existing photograph clients remain compatible. The backend sends the original video as `faceVideo` to ID Analyzer EU and requires the same face-match/liveness result; following UI prompts alone does not establish identity or prove that every prompted movement was independently validated. Videos are deleted with the other temporary session files after completion/rejection/expiry.
