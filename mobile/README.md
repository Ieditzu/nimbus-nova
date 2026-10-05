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

Users sign in or begin worker signup from Profile. Private requests use the bearer token returned by the Go API; there is no demo actor fallback. iOS and Android store the token with Expo SecureStore. Browser/PWA sessions persist in local storage and are removed on logout. The Go API validates permissions and rejects duplicate applications. Adult worker and poster accounts can publish and manage their own jobs. Applications still require a worker account and accepting an applicant retains the backend's contract checks. Lists reload on screen focus and pull to refresh. Open conversations poll every three seconds while the app is active; background screens stop polling. Login and logout use the real API. Payment controls are outside the current mobile scope.

## Required phone and test account

Every signed-in member must save a valid phone number before entering private app screens. Existing accounts without a number are sent to phone completion. The backend also enforces this requirement for authenticated member actions. Romanian `07...` numbers are normalized to `+40...`; international numbers require a country prefix. This is format validation, not SMS verification. The number appears only in the owner's authenticated account responses and is excluded from public jobs and conversation participants.

The supplied test login uses normal backend password hashing and bearer sessions. To provision it locally, start the API with both `NOVA_DEMO=1` and `NOVA_TEST_ACCOUNT=1`. It starts with no phone number, so the same completion step applies. Its jobs and messages live in that API's SQLite database and are shared across devices connecting to that server. No test credentials or fake bearer are handled by the mobile app. Leave `NOVA_TEST_ACCOUNT` unset on a published server.

## Identity signup

Signup has three steps: account details, Romanian identity document, then a live camera selfie. There is no manual birth date input. Classic CI requires a front photograph; CEI requires front/back photographs. Both support photo-library import or camera capture. CEI also requires the original PDF export from RO CEI Reader. Photos are converted to JPEG; every uploaded file must be at most 2 MB. A minor can enter a guardian email; the server derives age and volunteer eligibility from the verified document.

Temporary native copies are kept in the app's cache, never saved to the gallery, and removed when signup closes or a file is replaced. Starting another file selection also prunes interrupted copies older than 15 minutes. Browser previews stay in memory. Camera permission is requested only when the user opens capture. Camera and navigation screens use no slide transition.

New account creation uses the backend's ID Analyzer API v2 EU integration. The backend checks provider availability before accepting uploads, verifies Romanian identity document data and the camera selfie, and requires an accepted result. CEI also requires the original PDF to match the photographed document. Registration requires passed file, CNP, document, selfie and face-match checks, plus an unexpired proof matching the signup email. Review/rejected results never create an account.

Identity requests require an HTTPS API URL. HTTP LAN development supports existing login and tasks but cannot receive identity documents. The backend needs `IDANALYZER_REGION=eu`, a private `IDANALYZER_KEY`, available provider credits/quota, and `pdftotext` for CEI. No key or provider SDK belongs in the mobile app. iOS/Android native camera capture still requires physical-device verification; browser QA and platform bundle exports do not replace it.

Selfie verification now records an eight-second silent video directly with the front camera. The guided prompts ask for forward, left, right and forward poses. Browsers use MediaRecorder with MP4/WebM negotiation; native iOS/Android use Expo Camera. Videos have an 8 MB limit, are uploaded to `selfie_video`, and are passed to the provider's `faceVideo` check. Older single-photo uploads remain supported by the API. Native video recording still needs physical-device QA.

Classic CI signup asks only for the front photograph because its reverse is blank. CEI still requires front, back and the original Reader PDF. Backend compatibility accepts legacy CI back uploads but excludes them from provider recognition.

Document preparation preserves up to 3200 pixels on the longest edge at JPEG quality 0.96. It lowers quality/resolution only if needed to meet the 2 MB file limit. The API includes a server-side Tesseract fallback for a missing/unusable CI CNP after document acceptance; checksum, birth date and biometric checks remain mandatory.

### Notification initialization

The first signed-in session with a completed phone number shows a one-time notification opt-in on supported devices. The choice is persisted per installation/browser, including “later”; notification permission remains optional and can be requested from Profile. Web requests permission directly from the button gesture. Native builds use `expo-notifications` and configure the `nova` Android notification channel. Expo Go is reported as unsupported.

This initializes permission only. Remote delivery, device token/subscription registration, notification taps, and backend message/application dispatch are not wired yet. Native remote delivery additionally needs an EAS project and APNs/FCM credentials in a rebuilt Nova binary; browser delivery needs VAPID configuration and authenticated subscription storage; the PWA service worker currently provides installation/offline fallback only. No keys or tokens are hardcoded.

## Install Nova on a phone (PWA)

Open https://app.nimbusnova.cc. On iPhone/iPad use Safari → Share → Add to Home Screen → Add (leave “Open as Web App” enabled when shown). On Android use Chrome → Install app/Add to Home Screen, or the “Instalează Nova” button under Profile when the browser offers it. Installed Nova launches in standalone mode; the same backend/account and camera flows are used. Browser and home-screen storage may be separate, so first installation may require signing in again. Subsequent sessions persist until logout or server expiry.

The manifest includes standard, maskable and Apple icons. The production service worker caches only branding and an offline screen; it never caches accounts, identity uploads, jobs or messages. Job/chat actions require internet. Navigation is network-first so new deployments load normally. Install guidance is hidden in standalone mode. Remote push delivery remains a separate integration. Native store/APK/IPA distribution is not part of this PWA installation.

Mobile browser visitors also get a dismissible install tip after a short delay, with Safari/iPhone or Chrome/Android steps. Where Chrome exposes an install prompt, the tip has a direct install button. “Later”/close snoozes the tip for seven days. Standalone launches and observed installation events suppress it; browsers cannot universally detect installations made outside their own storage/context. The prompt waits for the notification opt-in choice instead of stacking both invitations.
