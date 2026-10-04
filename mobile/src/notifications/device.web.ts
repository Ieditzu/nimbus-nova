export type Permission = "default" | "granted" | "denied" | "unsupported";
function supported() {
  return typeof window !== "undefined" && window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}
export async function permissionStatus(): Promise<Permission> {
  return supported() ? Notification.permission : "unsupported";
}
export async function initializeNotifications(): Promise<Permission> {
  if (!supported()) return "unsupported";
  // Invoke directly in the button gesture, before any asynchronous storage work.
  return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
}
export const unsupportedHint = "Pe iPhone, adaugă Nova pe ecranul principal din Safari și deschide-o de acolo. Folosește un browser cu suport push și o conexiune HTTPS.";
