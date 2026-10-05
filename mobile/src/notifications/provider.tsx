import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Modal, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/session";
import { fonts, useTheme } from "../components/theme";
import { Button } from "../components/ui";
import { expoPushToken, initializeNotifications, permissionStatus, unsupportedHint, type Permission } from "./device";

const seenKey = "nova.notifications.intro.v1";
const context = createContext<{ status: Permission; busy: boolean; message: string; daily: boolean; city: string; enable: () => Promise<void>; setDaily: (enabled: boolean) => Promise<void> } | null>(null);
let seenThisSession = false;
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, restoring, client } = useAuth();
  const ready = !restoring && !!session?.user.phone_number;
  const { colors } = useTheme();
  const [status, setStatus] = useState<Permission>("unsupported");
  const [intro, setIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [daily, setDailyState] = useState(false);
  const [city, setCity] = useState("");
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    void import("expo-notifications").then((notifications) => {
      if (!active) return;
      notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });
      subscription = notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { conversation_id?: string; task_id?: string };
        if (data.conversation_id) router.push({ pathname: "/messages/[id]", params: { id: data.conversation_id } });
        else if (data.task_id) router.push({ pathname: "/task/[id]", params: { id: data.task_id } });
      });
    }).catch(() => {});
    return () => { active = false; subscription?.remove(); };
  }, []);
  const refresh = useCallback(async () => {
    try { setStatus(await permissionStatus()); } catch { setStatus("unsupported"); }
  }, []);
  const syncToken = useCallback(async () => {
    if (!session || Platform.OS === "web") return;
    const token = await expoPushToken();
    await client.registerPushToken(token);
  }, [client, session]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.all([permissionStatus(), AsyncStorage.getItem(seenKey), client.getNotificationPreferences()]).then(([permission, seen, prefs]) => {
      if (!active) return;
      setStatus(permission); setDailyState(prefs.daily_nearby_enabled); setCity(prefs.city);
      setIntro(permission === "default" && !seen && !seenThisSession);
      if (permission === "granted") void syncToken().catch(() => {});
    }).catch(() => { if (active) setMessage("Nu am putut verifica setările notificărilor."); });
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; listener.remove(); };
  }, [ready, refresh, client, syncToken]);
  function dismiss() {
    seenThisSession = true; setIntro(false);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof Event !== "undefined") window.dispatchEvent(new Event("nova:notification-choice"));
    void AsyncStorage.setItem(seenKey, "seen").catch(() => setMessage("Preferința nu a putut fi salvată pe dispozitiv."));
  }
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage("");
    const request = initializeNotifications(); dismiss();
    try {
      const next = await request; setStatus(next);
      if (next === "granted" && Platform.OS !== "web") await syncToken();
      else if (next === "granted") setMessage("Push-ul remote pe web nu este încă configurat. Îl poți folosi în aplicația instalată pe iPhone sau Android.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Nu am putut inițializa notificările. Reîncearcă din Profil."); }
    finally { setBusy(false); }
  }
  async function setDaily(enabled: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (enabled && status !== "granted") throw new Error("Permite notificările pe acest dispozitiv mai întâi.");
      if (enabled && Platform.OS === "web") throw new Error("Alertele push zilnice sunt disponibile momentan în aplicația Nova instalată pe iPhone sau Android.");
      if (enabled) await syncToken();
      const saved = await client.putNotificationPreferences(enabled);
      setDailyState(saved.daily_nearby_enabled); setCity(saved.city);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Nu am putut salva preferința."); }
    finally { setBusy(false); }
  }
  return <context.Provider value={{ status, busy, message, daily, city, enable, setDaily }}>
    {children}
    <Modal visible={ready && intro} transparent animationType="fade" onRequestClose={dismiss}>
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ padding: 24, gap: 16, borderRadius: 24, backgroundColor: colors.surface }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 24 }}>Notificări Nova</Text>
          <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 22 }}>Permite notificările pe acest dispozitiv. Poți schimba alegerea din Profil.</Text>
          <Button disabled={busy} onPress={() => void enable()}>Permite notificările</Button>
          <Button variant="outline" onPress={dismiss}>Mai târziu</Button>
        </View>
      </SafeAreaView>
    </Modal>
  </context.Provider>;
}
export function NotificationSettings() {
  const value = useContext(context);
  const { colors } = useTheme();
  if (!value) return null;
  const labels: Record<Permission, string> = {
    default: "Permisiunea nu este acordată.", granted: "Permisiune acordată pe acest dispozitiv.",
    denied: "Notificările sunt blocate. Le poți permite din setările aplicației sau ale browserului.", unsupported: unsupportedHint,
  };
  return <View style={{ gap: 12, paddingVertical: 12 }}>
    <Text style={{ fontFamily: fonts.bold, color: colors.text }}>Notificări</Text>
    <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 21 }}>{labels[value.status]}</Text>
    {value.status === "default" ? <Button variant="outline" icon="notifications-outline" disabled={value.busy} onPress={() => void value.enable()}>{value.busy ? "Se inițializează..." : "Permite notificările"}</Button> : null}
    {Platform.OS !== "web" && value.status === "granted" ? <View style={{ gap: 6 }}>
      <Button variant={value.daily ? "outline" : "primary"} icon="location-outline" disabled={value.busy} onPress={() => void value.setDaily(!value.daily)}>{value.daily ? "Oprește joburile zilnice" : "Primește zilnic joburi din orașul tău"}</Button>
      <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 20 }}>{value.daily ? `Trimitem cel mult un rezumat pe zi pentru ${value.city}.` : "Folosim orașul salvat în profil; poți opri alertele oricând."}</Text>
    </View> : null}
    {value.message ? <Text accessibilityRole="alert" style={{ color: colors.muted }}>{value.message}</Text> : null}
  </View>;
}
