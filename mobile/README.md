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
npm test            # Node 22.6+; identity approval and transport checks
```

## Appearance

Nova starts in dark mode. Use the sun/moon button for a quick switch, or choose dark, light, or system appearance under **Profil → Aspect**. The choice is stored locally on the device. Larger controls, plain screen titles, and readable task dates keep the main actions easy to find.

## Screens and accounts

- Discover: open tasks filtered by city/category; pull to refresh.
- Task details: schedule, proposed RON amount, safety note, and application message.
- Profile: read-only name, editable skills, city, availability, and bio.
- My applications: application and task statuses; pull to refresh.

Users sign in or begin worker signup from Profile. Private requests use the bearer token returned by the Go API; there is no demo actor fallback. iOS and Android store the token with Expo SecureStore. Browser preview uses session storage. The Go API validates permissions and rejects duplicate applications. When a poster accepts an application on the teammate's website, the app updates its status. Data reloads on screen focus and pull to refresh; the app does not poll. Login and logout use the real API. Payment controls are outside the current mobile scope.

## Identity signup

Signup has three steps: account details, Romanian identity document, then a live camera selfie. There is no manual birth date input. CI uses camera captures of the front and back. CEI uses imported front/back photographs and the original PDF export from RO CEI Reader. Photos are converted to JPEG; every uploaded file must be at most 2 MB. A minor can enter a guardian email; the server derives age and volunteer eligibility from the verified document.

Temporary native copies are kept in the app's cache, never saved to the gallery, and removed when signup closes or a file is replaced. Starting another file selection also prunes interrupted copies older than 15 minutes. Browser previews stay in memory. Camera permission is requested only when the user opens capture. Camera and navigation screens use no slide transition.

**New account creation is currently blocked.** The backend reports `face_match: "not_available"`; the mobile app stops before uploading any identity files when it receives this status. Identity requests also require an HTTPS API URL, so the normal HTTP LAN development address supports existing login and tasks, but cannot receive identity documents. Registration requires all shared verification checks to pass and a valid, unexpired proof matching the signup email. A `verified` status alone is insufficient.

The backend owner still needs to connect real document OCR, face matching, passive liveness, and the agreed provider privacy settings. No ID Analyzer key or SDK belongs in the mobile app. Review provider setup and server retention before using real identity documents. iOS/Android native camera permission and capture behavior still require checks on physical devices; browser QA and platform bundle exports cannot replace those checks.

Codex assisted Perjoc with the initial app code, API client, styling, and setup notes. Nova's icon is a simple vector star rendered to PNG. Review and verify the code before the final submission.
