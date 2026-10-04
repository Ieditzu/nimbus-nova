# Website verification

Checked on 4 October 2026 against the real Go API, initially at `7db1ecf`, then rechecked after pulling teammate updates through `2c4233b`. The API was run with separate local test databases outside the repository. No backend or mobile source was modified.

- `go test ./...`: passed the repository's existing API integration suite.
- `npm test`: 22 passing checks, including byte-for-byte shared-client/types copies.
- `npm run build`: TypeScript check, client build, SSR prerender, and static HTML generation passed.
- Production landing source contains Romanian content, one `Nimbus Nova` H1, language metadata, and the project favicon. Production source maps are disabled.
- Browser health showed `API pornit` from the running API.
- Created `Ajutor la stand` from the browser with `120` RON and a two-hour slot. The real API returned `amount_bani: 12000` and `2026-10-05T14:00:00+03:00`.
- Sent a `worker-1` application through the real worker endpoint, using the seeded Maria profile. Refetched applications in the website and accepted Maria through the UI. The website showed `Acceptată` and `Atribuită`, and enabled `Finalizează` only after acceptance.
- Completed the task through the website. `GET /v1/me/applications` as the worker reflected `accepted` and the task's `completed` status. This validates the shared API state; Perjoc's actual mobile UI was not available for testing.
- Submitted a five-star review in the browser. The real review GET returned it and the UI displayed it on reopening the task. The duplicate review form was absent after refetch.
- Invalid fractional precision and reversed time intervals were rejected before submission.
- Deliberately stopped the API. The production dashboard and submission showed Romanian errors, retained typed values, and recovered with retry after the server restarted. Connection failures during this deliberate outage were expected.
- Empty status filtering showed a usable empty state.
- Landing checked at 320, 375, 768, and 1440 CSS pixels: no horizontal document overflow; one H1; main CTA visible in the initial viewport. Dashboard checked at the same widths, including its form at 320 pixels and expanded details at 375 pixels.
- No console warnings or errors were seen in the initial connected flow. Final connected production checks were also inspected separately from the intentional outage.
- After the final pull, refreshed the shared client verbatim, reran all 22 frontend tests and the expanded Go suite, and rebuilt successfully. Acceptance and completion were rechecked in the production browser against a fresh seeded database on the latest backend. The same legacy demo endpoints worked without login or payment controls.
- Reusing the pre-contract database produced the server's `Semnează contractul-cadru cu Nova înainte.` error on accept. The frontend displayed it correctly and did not change the task locally. A fresh backend seed includes Maria's signed demo contract; the README explains the upgrade behavior.

Public hosting, a custom domain, production HTTP 404 responses, social platform previews, and the actual mobile application remain unverified. The website calls no planned endpoints. It imports no fixture data at runtime and exposes no admin route.
