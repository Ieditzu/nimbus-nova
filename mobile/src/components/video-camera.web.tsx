import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { prepareSelfieVideo } from "../identity/files";
import type { VideoCameraHandle, VideoCameraProps } from "./video-camera-types";
export const VideoCamera = forwardRef<VideoCameraHandle, VideoCameraProps>(function VideoCamera({ onReady, onError }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recording = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    let disposed = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Browserul nu permite filmarea. Folosește Safari sau Chrome actualizat, cu acces la cameră.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(async (media) => {
      if (disposed) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      if (!disposed) onReady();
    }).catch(() => { if (!disposed) onError("Nu am putut deschide camera. Permite accesul în setările browserului."); });
    return () => { disposed = true; cancelled.current = true; if (recording.current?.state === "recording") recording.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()); };
  }, [onReady, onError]);
  useImperativeHandle(ref, () => ({
    stop: () => { cancelled.current = true; if (recording.current?.state === "recording") recording.current.stop(); },
    record: () => new Promise((resolve, reject) => {
      if (!stream.current) { reject(new Error("Camera nu este pregătită.")); return; }
      const mime = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) { reject(new Error("Browserul nu suportă formatul video necesar.")); return; }
      cancelled.current = false;
      const recorder = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
      recording.current = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      const timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 8000);
      recorder.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > 8_000_000 && recorder.state === "recording") recorder.stop(); } };
      recorder.onerror = () => { clearTimeout(timer); reject(new Error("Filmarea a eșuat. Încearcă din nou.")); };
      recorder.onstop = () => {
        clearTimeout(timer);
        if (cancelled.current) { reject(new Error("Filmarea a fost anulată.")); return; }
        const contentType = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
        const uri = URL.createObjectURL(new Blob(chunks, { type: contentType }));
        void prepareSelfieVideo(uri, contentType).then(resolve, reject);
      };
      recorder.start(250);
    }),
  }));
  return createElement("video", { ref: video, autoPlay: true, muted: true, playsInline: true, style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" } });
});
