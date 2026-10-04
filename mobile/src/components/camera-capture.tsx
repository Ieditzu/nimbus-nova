import { useEffect, useRef, useState } from "react";
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
import { CameraView, useCameraPermissions } from "expo-camera";
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
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const taking = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      setReady(false);
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
    try {
      const photo = await camera.current.takePictureAsync({
        quality: 1,
        exif: false,
      });
      if (!photo?.uri)
        throw new Error("Nu am putut face fotografia. Încearcă din nou.");
      const asset = await prepareCameraPhoto(photo.uri);
      if (mounted.current) onCapture(asset);
      else releaseAsset(asset);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Camera nu este disponibilă.",
        );
    } finally {
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
            <View style={s.preview}>
              {active ? (
                <CameraView
                  ref={camera}
                  style={StyleSheet.absoluteFill}
                  facing={selfie ? "front" : "back"}
                  mode="picture"
                  mirror={false}
                  onCameraReady={() => setReady(true)}
                  onMountError={() => {
                    setReady(false);
                    setError(
                      "Camera nu poate porni. Închide-o și încearcă din nou.",
                    );
                  }}
                />
              ) : null}
              <View pointerEvents="none" style={s.guideArea}>
                <View style={selfie ? s.faceGuide : s.cardGuide} />
              </View>
            </View>
            <Text style={[s.body, s.instructions, { color: colors.muted }]}>
              {selfie
                ? "Privește camera. Ține fața în cadru, într-un loc bine luminat."
                : "Ține întregul act în cadru. Evită reflexiile și verifică să fie lizibil."}
            </Text>
            <View style={s.footer}>
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
  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  permission: { flex: 1, justifyContent: "center", padding: 24, gap: 24 },
  error: { fontFamily: fonts.body, padding: 20, fontSize: 14, lineHeight: 21 },
});
