import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/session";
import { fonts, useTheme } from "../components/theme";
import { Button } from "../components/ui";
import { initializeNotifications, permissionStatus, unsupportedHint, type Permission } from "./device";

const seenKey = "nova.notifications.intro.v1";
const context = createContext<{ status: Permission; busy: boolean; message: string; enable: () => Promise<void> } | null>(null);
let seenThisSession = false;
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, restoring } = useAuth();
  const ready = !restoring && !!session?.user.phone_number;
  const { colors } = useTheme();
  const [status, setStatus] = useState<Permission>("unsupported");
  const [intro, setIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try { setStatus(await permissionStatus()); } catch { setStatus("unsupported"); }
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.all([permissionStatus(), AsyncStorage.getItem(seenKey)]).then(([permission, seen]) => {
      if (!active) return;
      setStatus(permission);
      setIntro(permission === "default" && !seen && !seenThisSession);
    }).catch(() => { if (active) setMessage("Nu am putut verifica setările notificărilor."); });
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; listener.remove(); };
  }, [ready, refresh]);
  function dismiss() {
    seenThisSession = true;
    setIntro(false);
    void AsyncStorage.setItem(seenKey, "seen").catch(() => setMessage("Preferința nu a putut fi salvată pe dispozitiv."));
  }
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage("");
    // Start the native/browser request before awaiting persistence (web user gesture).
    const request = initializeNotifications();
    dismiss();
    try { setStatus(await request); }
    catch { setMessage("Nu am putut inițializa notificările. Reîncearcă din Profil."); }
    finally { setBusy(false); }
  }
  return <context.Provider value={{ status, busy, message, enable }}>
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
    {value.message ? <Text accessibilityRole="alert" style={{ color: colors.muted }}>{value.message}</Text> : null}
  </View>;
}
