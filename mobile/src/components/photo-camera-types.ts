export type PhotoCameraHandle = {
  takePictureAsync: (options: { quality: number; imageType: "jpg"; exif: boolean }) => Promise<{ uri: string }>;
};
export type PhotoCameraProps = {
  selfie: boolean;
  torch: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onTorchAvailable: (available: boolean) => void;
};
