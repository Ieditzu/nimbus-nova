import { Platform } from "react-native";
import { createNovaClient } from "./client";

const defaultBaseUrl =
  Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://127.0.0.1:8080";
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultBaseUrl;
export const api = createNovaClient(baseUrl, "worker-1");
