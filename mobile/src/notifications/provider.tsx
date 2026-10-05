import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Modal, Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/session";
import { fonts, useTheme } from "../components/theme";
import { Button } from "../components/ui";
import { createWebPushSubscription, existingWebPushSubscription, expoPushToken, initializeNotifications, permissionStatus, unsupportedHint, type Permission } from "./device";
import { notificationContent, openNotification } from "./content";

const seenKey = "nova.notifications.intro.v1";
const context = createContext<{ status: Permission; busy: boolean; message: string; webPushReady: boolean; webPushConfigLoading: boolean; daily: boolean; city: string; unreadCount: number; enable: () => Promise<void>; setDaily: (enabled: boolean) => Promise<void> } | null>(null);
let seenThisSession = false;
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, restoring, client } = useAuth();
  const ready = !restoring && !!session?.user.phone_number;
  const { colors } = useTheme();
  const [status, setStatus] = useState<Permission>("unsupported");
  const [intro, setIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [webPushReady, setWebPushReady] = useState(false);
  const [webPushPublicKey, setWebPushPublicKey] = useState("");
  const [webPushConfigLoading, setWebPushConfigLoading] = useState(true);
  const [daily, setDailyState] = useState(false);
  const [city, setCity] = useState("");
  const [unread, setUnread] = useState<{ accountId: string; count: number } | null>(null);
  const [eventAlert, setEventAlert] = useState<{ kind: string; taskId: string; accountId: string } | null>(null);
  const [incoming, setIncoming] = useState<{ id: string; name: string; text: string; accountId: string } | null>(null);
  const seenMessages = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    seenMessages.current.clear();
    if (!ready || !session) return;
    let active = true;
    let running = false;
    let initialized = false;
    async function poll() {
      if (!active || running || (AppState.currentState !== null && AppState.currentState !== "active")) return;
      if (Platform.OS === "web" && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      running = true;
      try {
        const { conversations } = await client.listConversations();
        if (!active) return;
        for (const chat of conversations) {
          const message = chat.last_message;
          const previous = seenMessages.current.get(chat.id);
          if (message && initialized && previous !== message.id && message.sender_id !== session!.user.id) {
            setIncoming({ id: chat.id, name: chat.other_user.display_name, text: message.text, accountId: session!.user.id });
          }
          if (message) seenMessages.current.set(chat.id, message.id);
        }
        initialized = true;
      } catch { /* The inbox keeps its own retry state. */ }
      finally { running = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    const appState = AppState.addEventListener("change", state => { if (state === "active") void poll(); });
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", poll);
    return () => {
      active = false; clearInterval(timer); appState.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", poll);
    };
  }, [ready, client, session]);
  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => setIncoming(null), 8000);
    return () => clearTimeout(timer);
  }, [incoming]);
  useEffect(() => {
    if (!ready || !session) return;
    let active = true;
    let running = false;
    let initialized = false;
    const seenIds = new Set<string>();
    async function poll() {
      if (!active || running || (AppState.currentState !== null && AppState.currentState !== "active")) return;
      if (Platform.OS === "web" && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      running = true;
      try {
        const { notifications } = await client.listNotifications();
        if (!active) return;
        setUnread({ accountId: session!.user.id, count: notifications.filter(item => !item.read_at).length });
        if (initialized) {
          const newest = notifications.find(item => !seenIds.has(item.id) && item.kind !== "new_message");
          if (newest) setEventAlert({ kind: newest.kind, taskId: newest.task_id, accountId: session!.user.id });
        }
        for (const item of notifications) seenIds.add(item.id);
        initialized = true;
      } catch { /* Retry on the next poll. */ }
      finally { running = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 8000);
    const appState = AppState.addEventListener("change", state => { if (state === "active") void poll(); });
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", poll);
    return () => {
      active = false; clearInterval(timer); appState.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", poll);
    };
  }, [ready, client, session]);
  useEffect(() => {
    if (!eventAlert) return;
    const timer = setTimeout(() => setEventAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [eventAlert]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    void import("expo-notifications").then((notifications) => {
      if (!active) return;
      notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });
      subscription = notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { conversation_id?: string; task_id?: string; screen?: string };
        if (data.conversation_id) router.push({ pathname: "/messages/[id]", params: { id: data.conversation_id } });
        else if (data.task_id && data.screen === "job_applications") router.push({ pathname: "/jobs/[id]", params: { id: data.task_id } });
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
  const syncWebPush = useCallback(async (create: boolean) => {
    if (!session || Platform.OS !== "web") return;
    let subscription = await existingWebPushSubscription();
    if (subscription || create) {
      const key = webPushPublicKey || (await client.getWebPushConfig()).public_key;
      if (!key) throw new Error("Push-ul web nu este configurat încă pe server.");
      subscription = await createWebPushSubscription(key);
    }
    if (!subscription) { setWebPushReady(false); return; }
    await client.registerWebPushSubscription(subscription);
    setWebPushReady(true);
  }, [client, session, webPushPublicKey]);
  useEffect(() => {
    if (!ready || Platform.OS !== "web") return;
    let active = true;
    void client.getWebPushConfig().then(config => {
      if (!active) return;
      setWebPushPublicKey(config.enabled ? config.public_key : "");
      if (!config.enabled || !config.public_key) setMessage("Push-ul web nu este configurat încă pe server.");
    }).catch(() => {
      if (active) setMessage("Nu am putut pregăti push-ul web. Reîncarcă Nova și încearcă din nou.");
    }).finally(() => { if (active) setWebPushConfigLoading(false); });
    return () => { active = false; };
  }, [ready, client]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.all([permissionStatus(), AsyncStorage.getItem(seenKey), client.getNotificationPreferences()]).then(([permission, seen, prefs]) => {
      if (!active) return;
      setStatus(permission); setDailyState(prefs.daily_nearby_enabled); setCity(prefs.city);
      setIntro(permission === "default" && !seen && !seenThisSession);
      if (permission === "granted") {
        const sync = Platform.OS === "web" ? syncWebPush(false) : syncToken();
        void sync.catch(() => {});
      }
    }).catch(() => { if (active) setMessage("Nu am putut verifica setările notificărilor."); });
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; listener.remove(); };
  }, [ready, refresh, client, syncToken, syncWebPush]);
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
      if (next === "granted" && Platform.OS === "web") {
        await syncWebPush(true);
        setMessage("Push activ pe acest dispozitiv. Vei primi notificări pentru aplicări, mesaje și noutăți despre joburi.");
      } else if (next === "granted") await syncToken();
      else if (next === "unsupported") setMessage(unsupportedHint);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Nu am putut inițializa notificările. Reîncearcă din Profil."); }
    finally { setBusy(false); }
  }
  async function setDaily(enabled: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (enabled && status !== "granted") throw new Error("Permite notificările pe acest dispozitiv mai întâi.");
      if (enabled) {
        if (Platform.OS === "web") await syncWebPush(true);
        else await syncToken();
      }
      const saved = await client.putNotificationPreferences(enabled);
      setDailyState(saved.daily_nearby_enabled); setCity(saved.city);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Nu am putut salva preferința."); }
    finally { setBusy(false); }
  }
  return <context.Provider value={{ status, busy, message, webPushReady, webPushConfigLoading, daily, city, unreadCount: unread && unread.accountId === session?.user.id ? unread.count : 0, enable, setDaily }}>
    {children}
    {incoming && incoming.accountId === session?.user.id ? <SafeAreaView pointerEvents="box-none" edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, paddingHorizontal: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mesaj nou de la ${incoming.name}. Deschide conversația.`} onPress={() => { const id = incoming.id; setIncoming(null); router.push({ pathname: "/messages/[id]", params: { id } }); }} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 4, elevation: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12 }}>
        <Text style={{ fontFamily: fonts.bold, color: colors.text }}>Mesaj nou · {incoming.name}</Text>
        <Text numberOfLines={2} style={{ fontFamily: fonts.body, color: colors.muted }}>{incoming.text}</Text>
      </Pressable>
    </SafeAreaView> : null}
    {!incoming && eventAlert && eventAlert.accountId === session?.user.id ? <SafeAreaView pointerEvents="box-none" edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, paddingHorizontal: 16 }}>
      <Pressable accessibilityRole="button" onPress={() => { const item = eventAlert; setEventAlert(null); openNotification(item.kind, item.taskId); }} style={{ backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 16, gap: 4, elevation: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12 }}>
        <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{notificationContent(eventAlert.kind).title}</Text>
        <Text numberOfLines={2} style={{ fontFamily: fonts.body, color: colors.muted }}>{notificationContent(eventAlert.kind).body}</Text>
      </Pressable>
    </SafeAreaView> : null}
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
    {Platform.OS === "web" && value.status === "granted" ? <View style={{ gap: 6 }}>
      {!value.webPushReady ? <Button icon="notifications-outline" disabled={value.busy || value.webPushConfigLoading} onPress={() => void value.enable()}>{value.busy ? "Se activează..." : value.webPushConfigLoading ? "Se pregătește..." : "Activează notificările push"}</Button> : null}
      <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 20 }}>{value.webPushReady ? "Push-ul este activ pentru acest browser și cont." : "Permisiunea browserului e acordată; apasă ca să legăm acest dispozitiv de contul Nova."}</Text>
    </View> : null}
    {value.status === "granted" ? <View style={{ gap: 6 }}>
      <Button variant={value.daily ? "outline" : "primary"} icon="location-outline" disabled={value.busy} onPress={() => void value.setDaily(!value.daily)}>{value.daily ? "Oprește joburile zilnice" : "Primește zilnic joburi din orașul tău"}</Button>
      <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 20 }}>{value.daily ? `Trimitem cel mult un rezumat pe zi pentru ${value.city}.` : "Folosim orașul salvat în profil; poți opri alertele oricând."}</Text>
    </View> : null}
    {value.message ? <Text accessibilityRole="alert" style={{ color: colors.muted }}>{value.message}</Text> : null}
  </View>;
}
export function useNotificationCount() {
  return useContext(context)?.unreadCount ?? 0;
}
