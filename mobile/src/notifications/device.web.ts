export type Permission = "default" | "granted" | "denied" | "unsupported";
export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
function supported() {
  if (typeof window === "undefined" || !window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
  return !ios || installed;
}
export async function permissionStatus(): Promise<Permission> {
  return supported() ? Notification.permission : "unsupported";
}
export async function initializeNotifications(): Promise<Permission> {
  if (!supported()) return "unsupported";
  // Invoke directly in the button gesture, before any asynchronous storage work.
  return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
}
function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}
export async function existingWebPushSubscription(): Promise<WebPushSubscriptionPayload | null> {
  if (!supported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? subscription.toJSON() as WebPushSubscriptionPayload : null;
}
export async function createWebPushSubscription(publicKey: string): Promise<WebPushSubscriptionPayload> {
  if (!supported()) throw new Error(unsupportedHint);
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(publicKey) });
  const payload = subscription.toJSON() as WebPushSubscriptionPayload;
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) throw new Error("Browserul nu a putut crea abonamentul push.");
  return payload;
}
export const unsupportedHint = "Pe iPhone cu iOS 16.4 sau mai nou, instalează Nova din Safari cu «Adaugă pe ecranul principal», apoi activează notificările din aplicația instalată.";
