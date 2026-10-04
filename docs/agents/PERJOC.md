# Perjoc mobile agent

You are the mobile agent for Perjoc. You own `mobile/**`. You do not edit `api/**`, `web/**`, or `docs/agents/API-STATUS.md`. You do not invent endpoints. You copy [types.ts](types.ts) to `mobile/src/api/types.ts` and [client.ts](client.ts) to `mobile/src/api/client.ts` without renaming fields.

The actor is always `worker-1`. Send it as `X-Demo-Actor`. Maria Ionescu is the only worker. Do not add a login screen and do not add a role switcher.

## Create the app

From the repo root:

```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

Add `mobile/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080
```

Create the client once:

```ts
import { createNovaClient } from "./api/client";

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";
export const api = createNovaClient(baseUrl, "worker-1");
```

Android emulator cannot use `127.0.0.1`. If the app runs on Android, set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080`. A physical phone uses the laptop's LAN IP and the API must already be running with `cd api && go run .`.

Navigation is a native stack with four screens: `TaskListScreen`, `TaskDetailScreen`, `ProfileScreen`, `MyApplicationsScreen`.

## Screens

`mobile/src/lib/labels.ts` uses the Romanian map in [CONTRACT.md](CONTRACT.md).

`TaskListScreen` calls `api.listOpenTasks`. City input defaults to `București`. Category select is optional and submits the English value. Each row shows title, category label, `starts_at`–`ends_at`, `formatBani(amount_bani)`, and `safety_note`. Empty copy: `Nu există sarcini deschise.` Loading copy: `Se încarcă...` Pull to refresh calls the same function. Tap opens `TaskDetailScreen` with the task id, not a copied task object that can go stale.

`TaskDetailScreen` calls `api.getTask(id)` on open. Show poster name, description, safety note, amount, and the caption `Sumă propusă. În acest demo nu se încasează plata.` Message input maps to `{ "message" }`. Button `Aplică` calls `api.applyToTask`. On `201`, navigate to `MyApplicationsScreen`. On `code === "profile_required"`, navigate to `ProfileScreen`. Other errors show `error.message`.

`ProfileScreen` calls `api.getMyProfile()` on open. `display_name` is text, not an input. Skills are a comma-separated field. On save, split on comma, trim, drop empty items, and send `api.putMyProfile({ skills, city, availability, bio })`. Do not send `display_name`. Button: `Salvează profilul`.

`MyApplicationsScreen` calls `api.listMyApplications()`. Each card shows `task.title`, application status label, and task status label. After Andrei accepts on the website, pull to refresh must show `Acceptată` and `Atribuită`. Do not poll in a loop.

## Do not build

No map, GPS permission, camera, or chat. Contract list, document upload, event attend, and reputation are live in [API-STATUS.md](API-STATUS.md). Pull `main`. Do not create a branch.

Do not hardcode the two seed tasks in the list. If the API is down, show `API oprit` and no fake rows.

## Done when

1. The phone or emulator shows both seeded tasks from `GET /v1/tasks` before anyone creates a task.
2. Maria can edit her skills and the next `GET /v1/profiles/me` returns the saved array.
3. Apply on `task_seed_event_setup` returns success once, and a second tap shows `Ai aplicat deja la această sarcină.`
4. After the website accepts, refresh shows the assigned task.
5. No file outside `mobile/**` changed.
