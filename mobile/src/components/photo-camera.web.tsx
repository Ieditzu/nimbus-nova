import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PhotoCameraHandle, PhotoCameraProps } from "./photo-camera-types";

type CameraCapabilities = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number } };
export const PhotoCamera = forwardRef<PhotoCameraHandle, PhotoCameraProps>(function PhotoCamera(
  { selfie, torch, onReady, onError, onTorchAvailable }, ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => {
    let disposed = false;
    async function start() {
      let media: MediaStream | undefined;
      try {
        const constraints = { facingMode: selfie ? "user" : "environment", width: { ideal: 3840 }, height: { ideal: 2160 } };
        media = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        if (!selfie) {
          // Labels become available after permission. Avoid ultra-wide and telephoto lenses.
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          const main = devices.find((device) => device.kind === "videoinput"
            && /back|rear|environment|spate/i.test(device.label)
            && !/ultra|tele|0[.,]5|0[.,]6/i.test(device.label));
          if (main && main.deviceId !== media.getVideoTracks()[0]?.getSettings().deviceId && !disposed) {
            media.getTracks().forEach((track) => track.stop());
            try { media = await navigator.mediaDevices.getUserMedia({ video: { ...constraints, deviceId: { exact: main.deviceId } }, audio: false }); }
            catch { media = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false }); }
          }
        }
        if (disposed) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        const track = media.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as CameraCapabilities | undefined;
        if (capabilities?.zoom && capabilities.zoom.min <= 1 && capabilities.zoom.max >= 1) {
          await track.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] }).catch(() => {});
        }
        onTorchAvailable(!selfie && capabilities?.torch === true);
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
        if (!disposed) onReady();
      } catch {
        media?.getTracks().forEach((track) => track.stop());
        if (!disposed) onError("Nu am putut deschide camera. Verifică permisiunile browserului.");
      }
    }
    void start();
    return () => { disposed = true; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
  }, [selfie, onReady, onError, onTorchAvailable]);
  useEffect(() => {
    const track = stream.current?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as CameraCapabilities | undefined;
    if (!selfie && capabilities?.torch) {
      void track?.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] }).catch(() => {
        onTorchAvailable(false);
        onError("Browserul nu a putut porni lanterna. Folosește lumină ambientală.");
      });
    }
  }, [torch, selfie, onError, onTorchAvailable]);
  useImperativeHandle(ref, () => ({
    async takePictureAsync({ quality }) {
      const element = video.current;
      if (!element?.videoWidth || !element.videoHeight) throw new Error("Camera nu este pregătită.");
      const canvas = document.createElement("canvas");
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Fotografia nu s-a putut salva.");
      context.drawImage(element, 0, 0);
      return { uri: canvas.toDataURL("image/jpeg", quality) };
    },
  }));
  return createElement("video", { ref: video, autoPlay: true, muted: true, playsInline: true,
    style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" } });
});
