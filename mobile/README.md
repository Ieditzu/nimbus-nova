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
npm test            # Node 22.6+; identity approval, transport and upload-flow checks
```

## Appearance

Nova starts in dark mode. Use the sun/moon button for a quick switch, or choose dark, light, or system appearance under **Profil → Aspect**. The choice is stored locally on the device. Larger controls, plain screen titles, and readable task dates keep the main actions easy to find.

## Screens and accounts

- Discover: open tasks filtered by city/category; pull to refresh.
- Task details: schedule, proposed RON amount, safety note, and application message.
- Profile: read-only name, private phone number, editable skills, city, availability, and bio.
- Anunțuri: publish jobs from the signed-in account, view applicants, contact them, choose a worker, and complete assigned jobs.
- Mesaje: private job conversations, saved by the backend, with older-message history.
- My applications: application and task statuses; pull to refresh.

Users sign in or begin worker signup from Profile. Private requests use the bearer token returned by the Go API; there is no demo actor fallback. iOS and Android store the token with Expo SecureStore. Browser preview uses session storage. The Go API validates permissions and rejects duplicate applications. Adult worker and poster accounts can publish and manage their own jobs. Applications still require a worker account and accepting an applicant retains the backend's contract checks. Lists reload on screen focus and pull to refresh. Open conversations poll every three seconds while the app is active; background screens stop polling. Login and logout use the real API. Payment controls are outside the current mobile scope.

## Required phone and test account

Every signed-in member must save a valid phone number before entering private app screens. Existing accounts without a number are sent to phone completion. The backend also enforces this requirement for authenticated member actions. Romanian `07...` numbers are normalized to `+40...`; international numbers require a country prefix. This is format validation, not SMS verification. The number appears only in the owner's authenticated account responses and is excluded from public jobs and conversation participants.

The supplied test login uses normal backend password hashing and bearer sessions. To provision it locally, start the API with both `NOVA_DEMO=1` and `NOVA_TEST_ACCOUNT=1`. It starts with no phone number, so the same completion step applies. Its jobs and messages live in that API's SQLite database and are shared across devices connecting to that server. No test credentials or fake bearer are handled by the mobile app. Leave `NOVA_TEST_ACCOUNT` unset on a published server.

## Identity signup

Signup has three steps: account details, Romanian identity document, then a live camera selfie. There is no manual birth date input. Both CI and CEI support importing front/back photographs from the photo library or capturing them with the camera. CEI also requires the original PDF export from RO CEI Reader. Photos are converted to JPEG; every uploaded file must be at most 2 MB. A minor can enter a guardian email; the server derives age and volunteer eligibility from the verified document.

Temporary native copies are kept in the app's cache, never saved to the gallery, and removed when signup closes or a file is replaced. Starting another file selection also prunes interrupted copies older than 15 minutes. Browser previews stay in memory. Camera permission is requested only when the user opens capture. Camera and navigation screens use no slide transition.

New account creation uses the backend's ID Analyzer API v2 EU integration. The backend checks provider availability before accepting uploads, verifies Romanian identity document data and the camera selfie, and requires an accepted result. CEI also requires the original PDF to match the photographed document. Registration requires passed file, CNP, document, selfie and face-match checks, plus an unexpired proof matching the signup email. Review/rejected results never create an account.

Identity requests require an HTTPS API URL. HTTP LAN development supports existing login and tasks but cannot receive identity documents. The backend needs `IDANALYZER_REGION=eu`, a private `IDANALYZER_KEY`, available provider credits/quota, and `pdftotext` for CEI. No key or provider SDK belongs in the mobile app. iOS/Android native camera capture still requires physical-device verification; browser QA and platform bundle exports do not replace it.

Selfie verification now records an eight-second silent video directly with the front camera. The guided prompts ask for forward, left, right and forward poses. Browsers use MediaRecorder with MP4/WebM negotiation; native iOS/Android use Expo Camera. Videos have an 8 MB limit, are uploaded to `selfie_video`, and are passed to the provider's `faceVideo` check. Older single-photo uploads remain supported by the API. Native video recording still needs physical-device QA.
