import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCameraPermissions } from "expo-camera";
import { PhotoCamera } from "./photo-camera";
import type { PhotoCameraHandle } from "./photo-camera-types";
import { Button, Icon } from "./ui";
import { fonts, useTheme } from "./theme";
import {
  prepareCameraPhoto,
  releaseAsset,
  type IdentityAsset,
} from "../identity/files";

export function CameraCapture({
  title,
  selfie,
  onCapture,
  onClose,
}: {
  title: string;
  selfie: boolean;
  onCapture: (asset: IdentityAsset) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<PhotoCameraHandle>(null);
  const mounted = useRef(true);
  const taking = useRef(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [error, setError] = useState("");
  const cameraReady = useCallback(() => setReady(true), []);
  const cameraError = useCallback((message: string) => { setError(message); }, []);
  const torchSupport = useCallback((available: boolean) => { setTorchAvailable(available); if (!available) setTorch(false); }, []);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      setReady(false);
      setTorch(false);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);
  async function capture() {
    if (!ready || taking.current || !camera.current) return;
    taking.current = true;
    setBusy(true);
    setError("");
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const view = camera.current;
    try {
      const preparation = (async () => {
        const photo = await view.takePictureAsync({
          quality: 1,
          imageType: "jpg",
          exif: false,
        });
        if (!photo?.uri)
          throw new Error("Nu am putut face fotografia. Încearcă din nou.");
        const asset = await prepareCameraPhoto(photo.uri);
        if (expired) {
          releaseAsset(asset);
          throw new Error("Captura a expirat.");
        }
        return asset;
      })();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("Fotografia nu s-a putut salva. Încearcă din nou."));
        }, 30_000);
      });
      const asset = await Promise.race([preparation, deadline]);
      if (mounted.current) onCapture(asset);
      else releaseAsset(asset);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Camera nu este disponibilă.",
        );
    } finally {
      if (timer) clearTimeout(timer);
      taking.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function allowCamera() {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setError(
        "Nu am putut deschide camera. Verifică permisiunile aplicației.",
      );
    }
  }
  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <Text
            accessibilityRole="header"
            style={[s.title, { color: colors.text }]}
          >
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Închide camera"
            onPress={onClose}
            style={s.close}
          >
            <Icon name="close-outline" size={28} color={colors.text} />
          </Pressable>
        </View>
        {!permission?.granted ? (
          <View style={s.permission}>
            <Icon name="camera-outline" size={40} />
            <Text style={[s.body, { color: colors.text }]}>
              Nova folosește camera pentru actul de identitate și selfie.
              Fotografiile nu se salvează în galerie.
            </Text>
            <Button onPress={() => void allowCamera()}>
              {permission?.canAskAgain === false
                ? "Deschide setările"
                : "Permite camera"}
            </Button>
          </View>
        ) : (
          <>
            <View style={s.preview} onLayout={({ nativeEvent }) => {
              const { width, height } = nativeEvent.layout;
              setPreviewSize((current) => current.width === width && current.height === height ? current : { width, height });
            }}>
              {active ? (
                <PhotoCamera ref={camera} selfie={selfie} torch={torch}
                  onReady={cameraReady} onError={cameraError} onTorchAvailable={torchSupport} />
              ) : null}
              <View pointerEvents="none" style={s.guideArea}>
                <View style={selfie ? s.faceGuide : [s.cardGuide, previewSize.width > 0 && { width: Math.max(1, Math.min(520, previewSize.width - 48, (previewSize.height - 48) * 1.45)) }]} />
              </View>
            </View>
            <Text style={[s.body, s.instructions, { color: colors.muted }]}>
              {selfie
                ? "Privește camera. Ține fața în cadru, într-un loc bine luminat."
                : "Ține întregul act în cadru. Evită reflexiile și verifică să fie lizibil."}
            </Text>
            <View style={s.footer}>
              {!selfie ? <View style={s.cameraControls}>
                <Text style={{ color: colors.text, fontFamily: fonts.bold }}>1×</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={torch ? "Oprește lanterna" : "Pornește lanterna"}
                  accessibilityState={{ disabled: !torchAvailable || !ready || busy, selected: torch }}
                  disabled={!torchAvailable || !ready || busy} onPress={() => setTorch((value) => !value)}
                  style={[s.torch, { opacity: torchAvailable ? 1 : 0.5 }]}>
                  <Icon name={torch ? "flash" : "flash-off-outline"} size={22} color={colors.text} />
                  <Text style={{ color: colors.text }}>{torchAvailable ? (torch ? "Lanternă pornită" : "Lanternă") : "Lanternă indisponibilă"}</Text>
                </Pressable>
              </View> : null}
              <Button
                disabled={!ready || busy || !active}
                icon="camera-outline"
                onPress={() => void capture()}
              >
                {busy ? "Se pregătește fotografia..." : "Fă fotografia"}
              </Button>
            </View>
          </>
        )}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[s.error, { color: colors.danger }]}
          >
            {error}
          </Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  title: { fontFamily: fonts.bold, fontSize: 20, flex: 1 },
  close: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: { flex: 1, backgroundColor: "#111" },
  guideArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cardGuide: {
    width: "100%",
    aspectRatio: 1.45,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 24,
  },
  faceGuide: {
    width: "75%",
    maxWidth: 280,
    aspectRatio: 0.75,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 180,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  instructions: { padding: 20 },
  cameraControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  torch: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 12 },
  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  permission: { flex: 1, justifyContent: "center", padding: 24, gap: 24 },
  error: { fontFamily: fonts.body, padding: 20, fontSize: 14, lineHeight: 21 },
});
