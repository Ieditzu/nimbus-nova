# Nimbus Nova website (Ciprian)

Vite + React + TypeScript task website. Romanian UI. `/` is a mobile-first public task feed; `/poster` manages the poster's tasks, and `/admin` is maintained by Haivas. Includes demo payment, cancellation, and dispute controls. Authentication UI remains a follow-up; the poster uses the seeded demo actor.

## Run locally

Start the real API in a separate terminal from the repository root:

```sh
cd api
go run .
```

Then start the website:

```sh
cd web
npm ci
cp .env.example .env
npm run dev -- --port 5173
```

On Windows PowerShell, use `Copy-Item .env.example .env`. The default API is `http://127.0.0.1:8080`. Change `VITE_API_BASE_URL` in `.env` to use another API. It calls the API directly, with no Vite proxy or fixture fallback.

The latest backend starts with demo mode enabled by default. Use a fresh seeded database for the demo after upgrading from the earlier marketplace-only backend. An existing older database may lack Maria's seeded signed framework contract, causing accept to return `Semnează contractul-cadru cu Nova înainte.` The website shows that server message. To test with a separate database without deleting existing data, set `DATABASE_PATH` before starting Go (PowerShell: `$env:DATABASE_PATH = 'nova-clean-demo.db'`). Contract signing remains on the worker side and is outside this website's brief.

## Integration

- `src/api/client.ts` and `src/api/types.ts` are verbatim copies from `docs/agents/`. The single poster client lives in `src/api/instance.ts` and is re-exported by `src/main.tsx`; keeping it separate allows static rendering without importing browser startup code.
- The client always uses `poster-1` on poster requests. Public health and review reads omit the actor, as specified by the shared client.
- The public feed calls `listOpenTasks` and `getReputation` from the shared client. Search, category, city, price, upcoming date, author rating, sort order, and one/two-column layout operate on returned tasks. Unrated authors have no invented score. Saved tasks are local to this browser.
- Create task, my tasks, expanded applications, accept, complete, reviews, demo payment, cancellation, and disputes use only routes marked live in `docs/agents/API-STATUS.md`.
- Payment is explicitly simulated; its amount, platform fee, and worker payout come from the server. Cancellation asks for confirmation, then refetches and preserves the success notice outside the removed card. Dispute submission retains the reason on failure and displays the returned reference on success.
- After accept, the website refetches both the task list and the expanded application's list. A failed refresh has a retry action. No optimistic fabricated successes.
- Money uses the supplied `ronToBani` and `formatBani`. Dates use `toRfc3339` with `+03:00`. The computer's local timezone does not alter submitted times.
- API failures keep form values. The UI displays server error messages verbatim; network and non-JSON failures have Romanian recovery messages.

## Checks

```sh
npm test
npm run build
npm run preview -- --port 5173
```

Tests lock the copied contract files, HTTP routes/headers/payloads, Romanian server errors, exact decimal conversion, and timezone offset. Fixtures are imported only by tests, never by the website.

The build prerenders meaningful Romanian landing content into `dist/index.html`, then hydrates it. Dashboard and unknown-route navigation use the client router. The real API remains necessary for all data.

## Hosting later

Set `VITE_SITE_URL` to the actual public origin before a public build. This generates an absolute canonical, social image URL, and sitemap with only `/`. Poster and unknown pages are noindex. `robots.txt` is not access control. The SVG sharing artwork is available at `/social.svg`; platform-specific sharing previews are unverified.

Host the static `dist/` output with a rewrite for `/poster`. For unknown routes, hosting must return the app's not-found view with HTTP 404. Vite's preview fallback alone does not implement production HTTP 404 behavior. No public domain or deployment is configured by this change.

## Visual design

The interface defaults to a warm light theme (`#faf7f3` background, deep berry actions) with an optional dark theme saved locally. The public feed uses pink, lavender, blue, and yellow category art, a scrolling mobile layout, bottom navigation, and a compact filter panel. Category art is illustrative typography because the task contract has no image field. The editable Figma foundations are at https://www.figma.com/design/PF68fLNhOHfq5irftxtslq; those earlier foundations do not yet mirror the current feed. The poster's own tasks keep compact filters, search, dated cards, and an optional table view.

Reference: the official Meetup screenshots at https://apps.apple.com/us/app/meetup-social-events-groups/id375990038. The supplied Mobbin collection required authentication and its individual screens were unavailable during this implementation.

The locally served `public/images/community.webp` is an illustrative photograph by Mineragua Sparkling Water: https://unsplash.com/photos/a-group-of-people-sitting-outside-of-a-building-WVtFP7i8Pb0, licensed under https://unsplash.com/license. It depicts no claimed Nova users or partnership. No task images or extra JSON fields are fabricated.

## Attribution

This website's React components, CSS layout, prerender script, and contract tests were generated with assistance from OpenAI Codex. Shared client/types and product requirements came from the team's repository. The team must review the generated work and disclose AI assistance in the competition submission. No user research, testimonials, or partnerships are claimed.

Third-party packages (exact versions in `package-lock.json`): React / React DOM (MIT, https://react.dev), React Router (MIT, https://reactrouter.com), Vite (MIT, https://vite.dev), TypeScript (Apache-2.0, https://www.typescriptlang.org), Phosphor icons (MIT, https://phosphoricons.com), Vitest (MIT, https://vitest.dev), Manrope through Fontsource (SIL OFL-1.1, https://fontsource.org/fonts/manrope). The monogram favicon and social graphic are original text-based artwork. Fonts are served locally; no external image or font service is required.
