# Push notifications

The API sends native notifications through Expo Push Service. Before producing an iOS or Android app build:

1. Create/link the Expo project (`eas init`) and set `EXPO_PUBLIC_EAS_PROJECT_ID` in the build environment.
2. Configure the project's Apple Push Notification service (APNs) credentials and Android Firebase Cloud Messaging credentials with EAS.
3. Build and install a new Nova binary. Expo Go cannot receive Nova's remote pushes.
4. Set the same `EXPO_PUBLIC_EAS_PROJECT_ID` when exporting the mobile app so the device registers its Expo push token.

The API does not need APNs/FCM secrets: it submits tokens to Expo. Push tokens are stored per signed-in account and reassigned if the same device signs in to a different account. Nearby digests are opt-in, run at 09:00 Europe/Bucharest, include open jobs created in the last 24 hours, and match the city saved in the buyer's profile. The sender stores one digest per account per local day. This is city matching, not a GPS radius.

Web push is not included. Browser permission alone does not register a remote subscription.
