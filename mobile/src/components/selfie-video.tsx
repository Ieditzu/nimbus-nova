import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon } from "./ui";
import { fonts, useTheme } from "./theme";
import { VideoCamera } from "./video-camera";
import type { VideoCameraHandle } from "./video-camera-types";
import { releaseAsset, type IdentityAsset } from "../identity/files";
import { videoGuide } from "../identity/video-guide";
export function SelfieVideo({ onCapture, onClose }: { onCapture: (asset: IdentityAsset) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const camera = useRef<VideoCameraHandle>(null);
  const mounted = useRef(true);
  const taking = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback((message: string) => { setReady(false); setError(message); }, []);
  const close = useCallback(() => { mounted.current = false; camera.current?.stop(); onClose(); }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") close(); });
    return () => { mounted.current = false; subscription.remove(); };
  }, [close]);
  async function record() {
    if (taking.current || !ready || !camera.current) return;
    taking.current = true; setBusy(true); setError(""); setElapsed(0);
    const started = Date.now();
    const ticker = setInterval(() => setElapsed(Math.min(8, (Date.now() - started) / 1000)), 100);
    const deadline = setTimeout(() => camera.current?.stop(), 15_000);
    try {
      const asset = await camera.current.record();
      if (!mounted.current) { releaseAsset(asset); return; }
      if (Date.now() - started < 7000) { releaseAsset(asset); throw new Error("Filmarea a fost întreruptă. Refă filmarea completă de 8 secunde."); }
      onCapture(asset);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Nu am putut salva filmarea."); }
    finally { clearInterval(ticker); clearTimeout(deadline); taking.current = false; if (mounted.current) setBusy(false); }
  }
  const guide = videoGuide(elapsed);
  return <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.header}><Text style={[s.title, { color: colors.text }]}>Video selfie</Text><Button variant="outline" onPress={close}>Închide</Button></View>
      <View style={s.preview}><VideoCamera ref={camera} onReady={handleReady} onError={handleError} /><View pointerEvents="none" style={s.guide}><View style={s.oval} /></View></View>
      <View style={s.instructions}>
        <Icon name={guide.icon} size={32} /><Text accessibilityLiveRegion="polite" style={[s.prompt, { color: colors.text }]}>{busy ? guide.text : "Ține fața în oval, la distanța unui braț"}</Text>
        <Text style={[s.help, { color: colors.muted }]}>Întoarce capul ușor, fără să ieși din cadru. Lumină uniformă, fără filtre. 8 secunde, fără sunet.</Text>
        <View style={[s.track, { backgroundColor: colors.raised }]}><View style={{ height: 4, backgroundColor: colors.accent, width: `${elapsed / 8 * 100}%` }} /></View>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
        <Button disabled={!ready || busy} icon="videocam-outline" onPress={() => void record()}>{busy ? `Se filmează · ${Math.min(8, Math.floor(elapsed))}/8 sec` : "Pornește filmarea"}</Button>
      </View>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({ safe: { flex: 1 }, header: { padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontFamily: fonts.bold, fontSize: 20 }, preview: { flex: 1, backgroundColor: "#111", overflow: "hidden" }, guide: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }, oval: { width: "70%", maxWidth: 280, aspectRatio: 0.75, borderRadius: 180, borderWidth: 2, borderColor: "white" }, instructions: { padding: 20, gap: 12, alignItems: "center" }, prompt: { fontFamily: fonts.bold, fontSize: 19, textAlign: "center" }, help: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, textAlign: "center" }, track: { height: 4, width: "100%", borderRadius: 2, overflow: "hidden" } });
