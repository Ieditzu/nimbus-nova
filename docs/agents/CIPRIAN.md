# Ciprian web agent

You are the web agent for Ciprian. You own `web/**`. You do not edit `api/**`, `mobile/**`, or `docs/agents/API-STATUS.md`. You do not invent endpoints. You copy [types.ts](types.ts) to `web/src/api/types.ts` and [client.ts](client.ts) to `web/src/api/client.ts` without renaming fields.

The actor is always `poster-1`. Send it as `X-Demo-Actor`. Do not add a login form and do not add a role switcher.

## Create the app

From the repo root:

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install react-router-dom
```

Add `web/.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080
```

In `web/src/main.tsx`, create the client once:

```ts
import { createNovaClient } from "./api/client";

export const api = createNovaClient(import.meta.env.VITE_API_BASE_URL, "poster-1");
```

Routes in `web/src/App.tsx`: `/` and `/poster` only. Do not add `/admin`. Eric is not in this build.

Run the API first: `cd api && go run .`. Then `cd web && npm run dev`. The dev server is port `5173`. Do not add a Vite proxy.

## Landing page, `/`

File: `web/src/pages/LandingPage.tsx`.

Visible text, exact:

- Heading `Nimbus Nova`
- `Omul din mijloc dintre cine are timp și cine are o sarcină scurtă.`
- `Nova ia cererea, alege omul, ține banii și predă lucrarea.`
- `Demo pentru adulți. Nu se încasează bani și nu se face angajare.`
- Link `Postează o sarcină` to `/poster`
- `Lucrătorii folosesc aplicația mobilă.`
- Health line from `api.getHealth()`: `API pornit` or `API oprit`

No task list on the landing page. No Uber or eMAG logos. No hardcoded tasks.

## Poster page, `/poster`

Files:

- `web/src/pages/PosterPage.tsx`
- `web/src/components/TaskForm.tsx`
- `web/src/components/MyTaskList.tsx`
- `web/src/components/ApplicationList.tsx`
- `web/src/lib/labels.ts`

`labels.ts` maps the category and status values in [CONTRACT.md](CONTRACT.md) to the Romanian words there.

`TaskForm` fields map one-to-one onto `CreateTaskRequest`:

| Label | Control | JSON |
| --- | --- | --- |
| Titlu | text | `title` |
| Categorie | select, Romanian label, English value | `category` |
| Oraș | text, default `București` | `city` |
| Începe la | `datetime-local` | `starts_at` via `toRfc3339` |
| Se termină la | `datetime-local` | `ends_at` via `toRfc3339` |
| Sumă propusă (RON) | text | `amount_bani` via `ronToBani` |
| Descriere | textarea | `description` |
| Notă de siguranță | text, may be empty | `safety_note` |

Submit calls `api.createTask`. On success, clear the form and call `api.listMyTasks()`. On failure, show `error.message`. Button text: `Publică sarcina`. Under the amount, always show `Sumă propusă. În acest demo nu se încasează plata.`

`MyTaskList` calls `api.listMyTasks()`, not the public open-task list. Columns: title, category label, city, interval, `formatBani(amount_bani)`, status label. Empty copy: `Nu ai sarcini încă.` Loading copy: `Se încarcă...`

Expanding a row calls `api.listTaskApplications(task.id)`. Show `worker_name`, skills joined with `, `, city, message, and status label. Do not show a phone, email, or address. There is no such field. If you add one, you are wrong.

Button `Acceptă` is enabled only when the application status is `pending` and the task status is `open`. It calls `api.acceptApplication(application.id)`, then refetches my tasks and that row's applications.

Button `Finalizează` is enabled only when the task status is `assigned`. It calls `api.completeTask(task.id)`, then refetches.

After completion, a review form calls `api.createReview(task.id, { stars, text })` and then `api.listReviews(task.id)`. Stars are a select from 1 to 5.

## Do not build yet

Do not mount pay, login, cancel, or dispute screens. Those routes are `planned` in [API-STATUS.md](API-STATUS.md). The client file may grow those functions later. A page that calls a missing route is a broken demo.

## Done when

1. `npm run dev` opens the landing page.
2. With the API running, health says `API pornit`.
3. Andrei can publish a task and see it in `Sarcinile mele`.
4. After Perjoc's phone applies, the website shows Maria and `Acceptă` changes her status to `Acceptată` without a refresh hack. Refetch after the click.
5. `Finalizează` works only after accept.
6. No file outside `web/**` changed.
