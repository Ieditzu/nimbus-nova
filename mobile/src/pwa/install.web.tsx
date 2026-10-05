import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Icon } from "../components/ui";
import { useAuth } from "../auth/session";
import { fonts, useTheme } from "../components/theme";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const context = createContext<{ installed: boolean; prompt: InstallPrompt | null; clear: () => void } | null>(null);
export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const check = () => {
      const active = standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
      setInstalled(active);
      if (active) { try { localStorage.setItem("nova.install.completed", "yes"); } catch {} }
    };
    check();
    const offered = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const added = () => { setInstalled(true); setPrompt(null); try { localStorage.setItem("nova.install.completed", "yes"); } catch {} };
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", added);
    standalone.addEventListener("change", check);
    if (!__DEV__ && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", added);
      standalone.removeEventListener("change", check);
    };
  }, []);
  return <context.Provider value={{ installed, prompt, clear: () => setPrompt(null) }}>{children}<PwaInstallTip /></context.Provider>;
}
export function PwaInstallCard() {
  const value = useContext(context);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!value || value.installed) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const hint = ios
    ? "În Safari: deschide meniul Partajare → Adaugă pe ecranul principal → Adaugă. Dacă apare «Deschide ca aplicație web», lasă opțiunea activată."
    : "Din meniul browserului, alege «Instalează aplicația» sau «Adaugă pe ecranul principal».";
  async function install() {
    if (!value?.prompt || busy) return;
    setBusy(true); setMessage("");
    try {
      await value.prompt.prompt();
      await value.prompt.userChoice;
      value.clear();
    } catch { setMessage("Deschide meniul browserului pentru a instala Nova."); }
    finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
    <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 18 }}>Nova pe telefonul tău</Text>
    <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 22 }}>Adaugă aplicația pe ecranul principal și deschide-o direct din iconiță.</Text>
    {value.prompt && !ios ? <Button icon="download-outline" disabled={busy} onPress={() => void install()}>{busy ? "Se deschide instalarea..." : "Instalează Nova"}</Button> : <Text style={{ fontFamily: fonts.body, color: colors.text, lineHeight: 22 }}>{hint}</Text>}
    {message ? <Text accessibilityRole="alert" style={{ color: colors.muted }}>{message}</Text> : null}
  </View>;
}

function PwaInstallTip() {
  const value = useContext(context);
  const { session, restoring } = useAuth();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [notificationPending, setNotificationPending] = useState(false);
  useEffect(() => {
    const check = () => {
      try { setNotificationPending(!!session?.user.phone_number && "Notification" in window && Notification.permission === "default" && !localStorage.getItem("nova.notifications.intro.v1")); } catch { setNotificationPending(false); }
    };
    check();
    const chosen = () => setNotificationPending(false);
    window.addEventListener("nova:notification-choice", chosen);
    return () => window.removeEventListener("nova:notification-choice", chosen);
  }, [session?.user.phone_number]);
  useEffect(() => {
    if (restoring || value?.installed || dismissed) return;
    const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!mobile) return;
    try {
      if (localStorage.getItem("nova.install.completed") === "yes" || Number(localStorage.getItem("nova.install.tip.until")) > Date.now()) return;
    } catch {}
    const timer = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(timer);
  }, [restoring, value?.installed, dismissed]);
  if (!visible || dismissed || !value || value.installed) return null;
  if (notificationPending) return null;
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem("nova.install.tip.until", String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch {}
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return createElement("aside", {
    role: "region", "aria-label": "Instalează aplicația Nova",
    style: { position: "fixed", zIndex: 1000, bottom: `calc(${session?.user.phone_number ? 96 : 16}px + env(safe-area-inset-bottom, 0px))`,
      left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 400,
      maxHeight: "65dvh", overflowY: "auto", background: colors.surface, borderRadius: 24,
      boxShadow: "0 12px 48px rgba(0,0,0,0.28)", border: `1px solid ${colors.border}`, padding: 20, boxSizing: "border-box" },
  }, <View style={{ gap: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1, fontFamily: fonts.bold, color: colors.text, fontSize: 20 }}>Nova, la un tap distanță</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide sfatul de instalare" onPress={dismiss} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="close-outline" color={colors.text} /></Pressable>
    </View>
    <Text style={{ fontFamily: fonts.body, color: colors.muted, lineHeight: 21 }}>Joburile și conversațiile tale, direct pe ecranul principal. Fără să cauți linkul de fiecare dată.</Text>
    <Text style={{ fontFamily: fonts.body, color: colors.text, lineHeight: 23 }}>{ios
      ? "1. Deschide Nova în Safari.\n2. Apasă Partajare, apoi «Adaugă pe ecranul principal».\n3. Apasă «Adaugă» și deschide iconița Nova."
      : "1. Deschide Nova în Chrome.\n2. Apasă ⋮, apoi «Instalează aplicația» sau «Adaugă pe ecranul principal».\n3. Confirmă instalarea și deschide Nova din iconiță."}</Text>
    <PwaTipActions ios={ios} dismiss={dismiss} />
  </View>);
}
function PwaTipActions({ ios, dismiss }: { ios: boolean; dismiss: () => void }) {
  const value = useContext(context);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function install() {
    if (!value?.prompt || busy) return;
    setBusy(true);
    try { await value.prompt.prompt(); const choice = await value.prompt.userChoice; value.clear(); if (choice.outcome === "accepted") dismiss(); }
    catch { setError("Folosește meniul Chrome pentru a instala aplicația."); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    {!ios && value?.prompt ? <Button icon="download-outline" disabled={busy} onPress={() => void install()}>{busy ? "Se deschide instalarea..." : "Instalează Nova"}</Button> : null}
    <Button variant="outline" onPress={dismiss}>Mai târziu</Button>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.muted }}>{error}</Text> : null}
  </View>;
}
