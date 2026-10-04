import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Button } from "../components/ui";
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
    const check = () => setInstalled(standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    check();
    const offered = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const added = () => { setInstalled(true); setPrompt(null); };
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
  return <context.Provider value={{ installed, prompt, clear: () => setPrompt(null) }}>{children}</context.Provider>;
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
