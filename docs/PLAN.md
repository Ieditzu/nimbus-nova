# Nimbus Nova - conditional VNU Hack build plan

**Status:** planning only; not a prebuilt competition submission. Six registered teammates are already at the hackathon. The specific challenge, not the public slogan "CONNECT THE DOTS", determines whether this idea is eligible. Consult [the official rules checklist](VNU-HACK-RULES.md) and [original PDF](vnu-hack-2026-regulament.pdf). No project-specific implementation prepared before the official theme reveal/start should be passed off as event work. Update this plan **after** the briefing with the actual challenge and organizer instructions.

## Decision at the theme reveal (hard gate)

Write here during the briefing: **exact challenge:** [TBD]; **how Nova solves it in one sentence:** [TBD]; **first user and problem evidence:** [TBD]; **decision:** build / narrow / pivot. Have all six agree on a falsifiable link between the *specific* challenge and the demo. If that link is weak, pivot rather than shoehorn a gig app into a different theme. Nothing below overrides that decision. Public "Connect the Dots" could suggest connecting free time, local help and opportunities, but does **not** itself establish compliance with the undisclosed challenge.

## Product hypothesis and boundaries

Nova helps an adult with a few spare hours find a short, nearby, clearly scoped task, while a person or small business can find help for a one-off need. The worker keeps one reusable **skills/availability profile (CV-lite)**, browses transparent task details (time, location area, proposed amount), applies, and receives a status update. A poster creates a task, selects an applicant, marks it complete and leaves a rating. For the hackathon, show this as an **adult-only simulated marketplace**, not a service operating jobs or processing money.

- Primary launch wedge: a small, low-risk, local help task, such as event setup or moving *light* items; secondary example: a shop looking for short coverage. Do not imply a shop can legally employ someone for one day through our app without a compliant employer/agency arrangement. Avoid driving/ride-sharing, pet care, heavy lifting, unsupervised access to homes or cash handling in the live demo. The Bucharest-Constanta car example is a future research question, not an MVP feature.
- Two user roles: worker and task poster. Admin is a moderator, not an employer. A seeded demo account can switch between test roles; distinct actors are enforced in the domain model. A user cannot hire themselves, rate before completion or rate twice.
- Value proposition to test: can a worker understand the task and apply within 60 seconds, and can a poster choose and close a task without assistance? Compare against classifieds/Facebook groups/general freelance sites: short duration + explicit schedule/pay + portable skills profile + transparent application status; claim differentiation as a hypothesis, not proven market superiority.
- CV-lite for demo: display name, skills, city/neighborhood, availability, short experience summary; avoid national ID, home address, birth date, phone, real CV files, background checks and private documents. Show only minimal necessary information to poster. Ratings follow completed tasks only and include an abuse-report route or moderation option, not unverified testimonials.

## Scope: three levels, one vertical slice

**Must demo, in order:**
1. Poster creates a task with title, category, general location, start/end time, fixed proposed amount in RON (integer bani), description and safety note. Validation: nonempty fields; end after start; amount nonnegative; no personal contact details in seeded data. Display "proposed amount - no payment collected".
2. Worker creates/edits CV-lite and sees open tasks filtered by category/location/time; opens one, applies with a brief note; duplicate applications rejected. Sorting and matching can be simple deterministic filters; do not claim AI matching unless implemented and disclosed.
3. Poster sees applications, accepts one; API prevents another accepted applicant for that task; other applications close/reject, task becomes assigned. Worker sees updated status. Poster marks task complete; worker/poster submits one review after completion. Basic admin can see/report/disable an unsafe task (if time allows).
4. Demonstrate across **mobile + Go API + web**: worker acts in Expo mobile; poster acts in web panel; admin moderation shown in web only if working. Landing page explains the same scenario and points to demo. Every screen must use the same real API/seeded data; no disconnected mock screens marketed as working features.

**If ahead of schedule:** add category chips, distance as manual neighborhood not live GPS, task status timeline, lightweight admin report queue, accessible empty/error/loading states and a one-page research insight. **Cut first when behind:** admin actions, ratings, filtering, then landing-page polish. Do **not** cut the post -> browse -> apply -> accept path. If mobile networking is unreliable, use Expo web or simulator on the same API, and disclose limitations; retain a live functional prototype.

**After hackathon only, subject to partners/legal review:** verified identities, employer-of-record/agency contracts, payroll/taxes, insurance, background checks where lawful, escrow/PSP with licensed provider, payout and refund flows, Glovo/Tazz/Uber/Lidl partnerships (none are assumed), geolocation and transport, volunteer events with independent safeguarding/legal framework. Do not promise a "Nimbus Nova employment contract", diploma, payment guarantee or partnership today. No real transaction, employment, shift dispatch or volunteer placement in MVP.

## Safety, minors and legal reality

Hackathon eligibility for high-school participants does **not** authorize a product to place children into work. Do not put under-16 users into paid gigs or assume relabeling work as "volunteering" makes it legal. The demo is adult-only, with no real participants or money. A future volunteer offering would need verified organizers, genuine non-remunerated activities, appropriate age/parental permissions, supervision, safe tasks, privacy rules and legal advice; a certificate must come from an authorized organizer, not automatically from Nova. Age restrictions and labor, employment agency, tax, transport, consumer-protection, platform-work and data-protection duties in Romania/EU require qualified local legal review before launch. Do not state legal compliance without that review.

Use fake accounts and fictional jobs; no real CVs, minors' data, home addresses or payment credentials in seed data or screenshots. Real deployment would need consent/notice and lawful basis, retention/deletion, access controls, abuse reporting, incident response and a regulated payment provider. For the demo, label authentication and payments simulated; separate poster and worker permissions in API even with seeded users. Never expose private applicant data to other workers. Rate limits and moderation are necessary before public use. Review moderation and anti-retaliation policy are future work.

## Technical contract (agree before parallel coding)

Repository layout *to create after the official start and theme-fit decision*: `api/` Go HTTP server; `mobile/` React Native + Expo + TypeScript; `web/` React + TypeScript via Vite, with landing page, poster dashboard and admin view; `docs/` rules, plan and final submission materials. Avoid three separate backend implementations. Local SQLite with migrations/seed script for the demo (or in-memory seeded repository if SQLite setup fails), JSON REST, explicit `API_BASE_URL` for emulator/device/website. Go owns validation and state transitions. If phone cannot reach localhost, use LAN address or a secure tunnel; do not embed secrets or expose the demo server publicly without safeguards. Agree on one shared API origin and test from a physical device *early*. CORS allow the actual local web origin. Keep all times as ISO 8601 with zone, amounts as integer bani, ids as strings, errors as `{ "error": { "code": "...", "message": "..." } }`.

Proposed API v1 (Haivas publishes example JSON responses and freezes field names immediately after gate):

| Method/path | Input -> response | Owner/consumer |
| --- | --- | --- |
| `GET /health` | `{ "ok": true }` | backend / all |
| `GET /v1/tasks?category=&city=` | array of public task summaries | backend / mobile, web |
| `GET /v1/tasks/{id}` | public task + status, without private applicant info | backend / mobile, web |
| `POST /v1/tasks` | poster identity + title/category/city/starts_at/ends_at/amount_bani/description -> task | backend / web |
| `GET /v1/profiles/me`, `PUT /v1/profiles/me` | worker skills/city/availability/bio -> CV-lite | backend / mobile |
| `POST /v1/tasks/{id}/applications` | worker identity + message -> application | backend / mobile |
| `GET /v1/tasks/{id}/applications` | poster-only applicant summaries/status | backend / web |
| `POST /v1/applications/{id}/accept` | poster-only -> assigned task; atomic single winner | backend / web |
| `POST /v1/tasks/{id}/complete` | poster-only -> completed task | backend / web |
| `POST /v1/tasks/{id}/reviews` | completed-task participant + rating 1-5 + short text -> review | backend / mobile or web, stretch |
| `GET /v1/admin/tasks`, `POST /v1/admin/tasks/{id}/hide` | moderator-only -> list/hidden | backend / admin, stretch |

Demo-only actor switch: `X-Demo-Actor` maps to known seeded IDs `worker-1`, `poster-1`, `admin-1` on the local server. **This is not authentication and must never be deployed as a public production service.** API checks actor role/ownership for every mutation, 400 for invalid input, 403 for forbidden, 404 for absent, 409 for closed task/duplicate apply/second acceptance; no trust in client-submitted role. Model: `User(id, role, display_name)`, `Profile(user_id, skills[], city, availability, bio)`, `Task(id, poster_id, title, category, city, starts_at, ends_at, amount_bani, description, status: open|assigned|completed|hidden)`, `Application(id, task_id, worker_id, message, status: pending|accepted|rejected)`, `Review(id, task_id, author_id, subject_id, stars, text)`. Sequence `open -> assigned -> completed`; hidden may be moderated. Migration/seed should be idempotent; test invariant with two concurrent accept attempts. On integration failure, prioritize a single seeded API response contract over adding endpoints.

## Six owners (all registered teammates, no external builders)

| Person | Primary accountable deliverable | Secondary role and handoff |
| --- | --- | --- |
| **Haivas** | Go API and storage; define/freeze JSON contract, validation/role checks, state machine, seed data and backend integration tests | Proposed team lead: clarify theme with organizers, coordinate merge and submission; delegate final lead choice to actual registered team. Give runnable URL + sample requests to Ciprian/Perjoc ASAP. |
| **Ciprian** | Web React frontend: task posting/applicant selection dashboard and concise landing page | Integrate live API with Haivas; ensure desktop/mobile responsive layout, loading/errors and demo navigation. Admin can reuse web shell. |
| **Perjoc** | Expo React Native worker flow: CV-lite, task list/detail, apply and status | Confirm emulator/device networking early; test against seed and record fallback demo environment. |
| **Eric** | Admin/moderation view in web app: see tasks, hide unsafe listing, review flagged content *if time permits*; otherwise test and polish core web flow | Work in isolated admin files/components with Ciprian agreeing routes/props first. Own accessibility/error/empty states and cross-browser checks. |
| **Selaru** | User research, product safety and demo content: 3-5 short, consent-based interviews or usability checks with available adults, competitor comparison and fictitious seed scenarios | Capture assumptions, observations and changes in final description; no identifiable interview data or unsupported partner/legal claims. Help with UX copy and poster/worker test scripts. |
| **Vlad** | QA, integration and pitch: test matrix, smoke testing API/mobile/web; draft demo script, slides/one-page submission, source/AI attribution log | Verify every member's contribution with owners, rehearse Q&A, own freeze/submission checklist and stand readiness. Can assist admin tests, not create conflicting API. |

Three AI coding setups (Codex/Claude Code) and others (OpenCode or similar) are tools, not extra team members. Each person remains responsible for understanding, testing and attributing their own work. Record who used which tools and for what; never claim AI-written material as solely human-created. Only six registered members contribute substantially. Agree who is actual team lead before submission.

**Handoff contract:** Haivas provides endpoint examples and the seed actor IDs first; Ciprian and Perjoc build against those exact shapes, using temporary client fixtures only until API responds. Eric coordinates web routes with Ciprian; Selaru supplies user story/seed text to Haivas and demo copy to both clients; Vlad signs off the integrated flow. Branch by area (`api/`, `mobile/`, `web/`, `docs/`) and use short PRs or pair-review. One person owns each shared file; merge integration frequently, no force pushes. Communicate blocker + owner + deadline in team chat; if an endpoint slips, stub behind an explicit demo-only flag and disclose it rather than pretend it works.

## Work checklist (dependencies, not a timetable)

1. Record the announced challenge and confirm the concept fits; otherwise pivot. Agree on the narrow user story and a registered team lead. Do not present pre-reveal project work as competition work.
2. Define the API response shapes, seeded identities and the single acceptance script. Haivas shares examples with Ciprian and Perjoc; Selaru writes fictional task copy and user questions; Vlad defines pass/fail cases.
3. Build the core vertical slice in parallel: Go endpoints/storage, web poster flow and React Native worker flow. Integrate against the same running API and seeded task; test a real phone or emulator network connection rather than trusting isolated mocks.
4. Validate with users, test role boundaries and state transitions, then add only demonstrable extras such as ratings, moderation and landing-page polish. If integration breaks, drop extras and restore the post -> browse -> apply -> accept path.
5. Rehearse the live demo and capture actual results, limitations, member contributions and tool/source credits. Submit only the working build and truthful description. Follow the fixed event deadlines and attendance requirements in [VNU-HACK-RULES.md](VNU-HACK-RULES.md); do not change code after the official freeze.

## Acceptance and validation

- Acceptance script: seeded poster creates "Event setup help, 2 hours, 100 RON proposed" -> worker on mobile sees task, completes profile, applies -> poster on web sees applicant and accepts -> worker sees assigned status -> poster completes; review/admin only if real and tested. No actual job or payment happens.
- Negative cases: blank/invalid task rejected; repeated apply 409; non-poster accept 403; competing acceptance 409; completed task cannot take new applicants; review cannot be posted before completion; hidden task not shown publicly; private profile fields not exposed in public task list. Test these with Go tests or curl and a manual device/web smoke test.
- Selaru records 3-5 anonymous observations: who tested (broad persona only), what they tried, confusion/quotes with permission, and one change made. If no real testers available, explicitly say unvalidated hypothesis and show scripted usability checks, not invented interview results.
- Vlad checks Wi-Fi, device power, local server address, demo accounts, refresh/seed reset, service startup commands, error handling, color contrast and keyboard navigation on web. Rehearse a 2-3 minute pitch: problem/user -> exact theme link -> working cross-device flow -> evidence -> operational/legal limits -> future path. One person narrates, others handle screens and Q&A; all six available at stand.
- Final project description template: **problem + target user**, **specific challenge fit**, **solution and what runs live**, **tech/architecture**, **one insight and evidence**, **known limitations/safety**, **each of six members' actual contributions**, **third-party licenses/links/assets**, **AI tools and which parts they assisted**. Fill with facts after building; never assert unbuilt features as finished.

## Rubric-to-evidence map

| Official criterion | Evidence to show, not merely claim |
| --- | --- |
| Problem/relevance (20) | Specific spare-time/short-task pain; two user personas; task scenario and research notes. |
| Innovation (20) | Demonstrated short-duration matching + reusable profile + transparent flow; explicit connection to **announced** challenge and honest comparison with alternatives. |
| Feasibility (20) | API-backed mobile-to-web live state change; simple Go architecture, validation and conflict tests; safe demo boundaries. |
| Impact/scalability (15) | Clear local users, plausible phased expansion, honest partner/legal dependencies and sustainable revenue hypothesis (not a promise). |
| Validation/research (10) | Actual interviews/tests with observed issues, cited credible sources, written assumptions; disclose if validation was limited. |
| Pitch/demo (15) | Rehearsed, reliable live flow and crisp answers about legal risk, moderation, payments and minors. |

Scoring and mandatory deliverables are from sections V-VI of the [official PDF](vnu-hack-2026-regulament.pdf). Use organizers' current instructions if they differ from this plan.
