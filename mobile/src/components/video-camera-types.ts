import type { IdentityAsset } from "../identity/files";
export type VideoCameraHandle = { record: () => Promise<IdentityAsset>; stop: () => void };
export type VideoCameraProps = { onReady: () => void; onError: (message: string) => void };
