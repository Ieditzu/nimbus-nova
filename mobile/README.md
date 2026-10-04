# Nova mobile app

Expo + React Native + TypeScript worker app, built by Perjoc for team Nimbus Nova. The app uses the shared Go API and the shared client and types from `../docs/agents/`, following `PERJOC.md`.

## Run

```bash
cd mobile
npm install
npm start
```

Start the Go API in a separate terminal with `cd api && go run .` from the repository root. It serves port 8080.

For a physical phone, copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_BASE_URL` to `http://<computer-LAN-IPv4>:8080`. Connect the phone and computer to the same Wi-Fi, then restart Expo and scan the QR code with a compatible Expo Go installation (SDK 57). The Android emulator defaults to `http://10.0.2.2:8080`; iOS simulator and browser preview default to `http://127.0.0.1:8080`. Override the address in `.env.local` when needed.

```bash
npm run ios         # iOS simulator on macOS, or scan the QR on an iPhone
npm run android     # Expo preview on an Android emulator
npm run web         # browser preview of this same worker app
npm run typecheck
npm run lint
```

## Appearance

Nova starts in dark mode. Use the sun/moon button for a quick switch, or choose dark, light, or system appearance under **Profil → Aspect**. The choice is stored locally on the device. Larger controls, plain screen titles, and readable task dates keep the main actions easy to find.

## Screens and demo

- Discover: open tasks filtered by city/category; pull to refresh.
- Task details: schedule, proposed RON amount, safety note, and application message.
- Profile: read-only name, editable skills, city, availability, and bio.
- My applications: application and task statuses; pull to refresh.

The worker identity is fixed to `worker-1`. The Go API validates permissions and rejects duplicate applications. When a poster accepts an application on the teammate's website, the app updates its status. Data reloads on screen focus and pull to refresh; the app does not poll. Authentication and payments are simulated for the adult-only demo.

Codex assisted Perjoc with the initial app code, API client, styling, and setup notes. Nova's icon is a simple vector star rendered to PNG. Review and verify the code before the final submission.
