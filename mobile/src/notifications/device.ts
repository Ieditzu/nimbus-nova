import Constants from "expo-constants";
import { Platform } from "react-native";
export type Permission = "default" | "granted" | "denied" | "unsupported";
export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export async function permissionStatus(): Promise<Permission> {
  if (Constants.executionEnvironment === "storeClient") return "unsupported";
  const notifications = await import("expo-notifications");
  const result = await notifications.getPermissionsAsync();
  return result.granted || result.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL ? "granted" : result.canAskAgain ? "default" : "denied";
}
export async function initializeNotifications(): Promise<Permission> {
  if (Constants.executionEnvironment === "storeClient") return "unsupported";
  const notifications = await import("expo-notifications");
  if (Platform.OS === "android") await notifications.setNotificationChannelAsync("nova", {
    name: "Nova", importance: notifications.AndroidImportance.DEFAULT,
  });
  const current = await permissionStatus();
  if (current !== "default") return current;
  const result = await notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  return result.granted || result.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL ? "granted" : result.canAskAgain ? "default" : "denied";
}
export async function expoPushToken(): Promise<string> {
  if (Constants.executionEnvironment === "storeClient" || Platform.OS === "web") throw new Error(unsupportedHint);
  const notifications = await import("expo-notifications");
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Push-ul Nova nu este configurat pentru acest build.");
  const result = await notifications.getExpoPushTokenAsync({ projectId });
  return result.data;
}
export async function existingWebPushSubscription(): Promise<WebPushSubscriptionPayload | null> { return null; }
export async function createWebPushSubscription(_publicKey: string): Promise<WebPushSubscriptionPayload> { throw new Error(unsupportedHint); }
export const unsupportedHint = "Notificările se configurează în aplicația instalată, într-un build propriu Nova. Expo Go nu acceptă push.";
