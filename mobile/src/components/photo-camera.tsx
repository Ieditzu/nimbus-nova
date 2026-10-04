import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CameraView } from "expo-camera";
import { StyleSheet } from "react-native";
import type { PhotoCameraHandle, PhotoCameraProps } from "./photo-camera-types";

export const PhotoCamera = forwardRef<PhotoCameraHandle, PhotoCameraProps>(function PhotoCamera(
  { selfie, torch, onReady, onError, onTorchAvailable }, ref,
) {
  const camera = useRef<CameraView>(null);
  useEffect(() => { onTorchAvailable(!selfie); }, [selfie, onTorchAvailable]);
  useImperativeHandle(ref, () => ({
    async takePictureAsync(options) {
      const picture = await camera.current?.takePictureAsync(options);
      if (!picture?.uri) throw new Error("Camera nu este pregătită.");
      return { uri: picture.uri };
    },
  }));
  return <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={selfie ? "front" : "back"}
    selectedLens={selfie ? undefined : "builtInWideAngleCamera"} zoom={0}
    enableTorch={!selfie && torch} mode="picture" mirror={false}
    onCameraReady={onReady} onMountError={() => onError("Camera nu poate porni. Închide-o și încearcă din nou.")} />;
});
