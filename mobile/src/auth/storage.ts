import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const key = "nova.session";
export async function readToken(): Promise<string | null> {
  if (Platform.OS === "web")
    return typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    window.sessionStorage.setItem(key, token);
    return;
  }
  await SecureStore.setItemAsync(key, token);
}
export async function removeToken(): Promise<void> {
  if (Platform.OS === "web") {
    window.sessionStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
