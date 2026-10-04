import { IdentityError } from "./errors";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { MAX_IDENTITY_BYTES } from "./policy";
import { photoSize } from "./photo-size";

export type IdentityAsset = {
  uri: string;
  name: string;
  contentType: "image/jpeg" | "application/pdf";
  size: number;
};

function privateDirectory() {
  const directory = new Directory(Paths.cache, "nova-identity");
  directory.create({ idempotent: true, intermediates: true });
  // Clean copies left by an interrupted signup, without touching the gallery.
  for (const entry of directory.list()) {
    const timestamp = Number(entry.name.split("-")[0]);
    if (
      entry instanceof File &&
      timestamp &&
      Date.now() - timestamp > 15 * 60_000
    )
      entry.delete();
  }
  return directory;
}

function removeCacheCopy(uri: string) {
  try {
    if (Platform.OS === "web") {
      if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
      return;
    }
    // Pickers and CameraView return cache copies; originals are never deleted.
    if (uri.startsWith(Paths.cache.uri)) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  } catch {
    // Cleanup must not hide a selection error if the OS purged its cache.
  }
}

export function releaseAsset(asset?: IdentityAsset) {
  if (!asset) return;
  removeCacheCopy(asset.uri);
}

async function photoAsset(uri: string): Promise<IdentityAsset> {
  let output: string | undefined;
  try {
    const context = ImageManipulator.manipulate(uri);
    let rendered = await context.renderAsync();
    if (Math.max(rendered.width, rendered.height) > 1800) {
      context.resize(photoSize(rendered.width, rendered.height));
      rendered = await context.renderAsync();
    }
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.88,
    });
    output = saved.uri;
    if (Platform.OS !== "web") {
      const destination = new File(
        privateDirectory(),
        `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      );
      new File(output).move(destination);
      output = destination.uri;
    }
    const size =
      Platform.OS === "web"
        ? (await (await fetch(output)).blob()).size
        : new File(output).size;
    if (size < 8 || size > MAX_IDENTITY_BYTES)
      throw new IdentityError(
        "Fotografia este prea mare. Încearcă din nou; limita este 2 MB.",
      );
    return {
      uri: output,
      name: "fotografie.jpg",
      contentType: "image/jpeg",
      size,
    };
  } catch (error) {
    if (output) removeCacheCopy(output);
    throw error;
  } finally {
    if (uri !== output) removeCacheCopy(uri);
  }
}

export const prepareCameraPhoto = photoAsset;

export async function importCardPhoto(): Promise<IdentityAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  return photoAsset(result.assets[0].uri);
}

export async function importReaderPdf(): Promise<IdentityAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) return null;
  const picked = result.assets[0];
  let uri = picked.uri;
  try {
    if (picked.size && picked.size > MAX_IDENTITY_BYTES)
      throw new IdentityError(
        "PDF-ul este prea mare. Alege exportul original, de maximum 2 MB.",
      );
    const bytes =
      Platform.OS === "web"
        ? new Uint8Array(await (await fetch(uri)).arrayBuffer())
        : await new File(uri).bytes();
    if (
      bytes.length < 8 ||
      bytes.length > MAX_IDENTITY_BYTES ||
      String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-"
    )
      throw new IdentityError(
        "Alege fișierul PDF original din RO CEI Reader, nu o fotografie sau o captură de ecran.",
      );
    if (Platform.OS !== "web") {
      const destination = new File(
        privateDirectory(),
        `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
      );
      new File(uri).move(destination);
      uri = destination.uri;
    }
    return {
      uri,
      name: picked.name,
      contentType: "application/pdf",
      size: bytes.length,
    };
  } catch (error) {
    removeCacheCopy(uri);
    throw error;
  }
}

export async function assetBase64(asset: IdentityAsset): Promise<string> {
  if (Platform.OS !== "web") {
    const file = new File(asset.uri);
    if (!file.exists || file.size < 8 || file.size > MAX_IDENTITY_BYTES)
      throw new IdentityError(
        "Fișierul nu mai este disponibil. Selectează-l din nou.",
      );
    return file.base64();
  }
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.size < 8 || blob.size > MAX_IDENTITY_BYTES)
    throw new IdentityError(
      "Fișierul nu mai este disponibil sau depășește 2 MB.",
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        new IdentityError("Nu am putut citi fișierul. Selectează-l din nou."),
      );
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
