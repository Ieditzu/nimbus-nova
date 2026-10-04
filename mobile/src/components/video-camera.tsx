import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StyleSheet } from "react-native";
import { prepareSelfieVideo } from "../identity/files";
import type { VideoCameraHandle, VideoCameraProps } from "./video-camera-types";
export const VideoCamera = forwardRef<VideoCameraHandle, VideoCameraProps>(function VideoCamera({ onReady, onError }, ref) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) void requestPermission().catch(() => onError("Permite accesul la cameră din setările telefonului."));
    else if (!permission.granted) onError("Permite accesul la cameră din setările telefonului.");
  }, [permission, requestPermission, onError]);
  useImperativeHandle(ref, () => ({
    stop: () => camera.current?.stopRecording(),
    record: async () => {
      const result = await camera.current?.recordAsync({ maxDuration: 8, maxFileSize: 8_000_000, codec: "avc1" });
      if (!result?.uri) throw new Error("Filmarea nu s-a salvat. Încearcă din nou.");
      return prepareSelfieVideo(result.uri, result.uri.endsWith(".mov") ? "video/quicktime" : "video/mp4");
    },
  }));
  useEffect(() => () => camera.current?.stopRecording(), []);
  if (!permission?.granted) return null;
  return <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mode="video" mute mirror={false} videoQuality="720p" videoBitrate={1_500_000} onCameraReady={onReady} onMountError={() => onError("Camera nu poate porni. Închide-o și încearcă din nou.")} />;
});
