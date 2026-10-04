import { IdentityError } from "./errors";
import { api, baseUrl } from "../api";
import { NovaError } from "../api/client";
import type { IdentityKind } from "../api/types";
import { assetBase64, type IdentityAsset } from "./files";
import {
  documentSlots,
  identityApproved,
  secureIdentityUrl,
  slotLabels,
  type CaptureSlot,
} from "./policy";

export async function submitIdentity({
  email,
  kind,
  assets,
  cancelled,
  progress,
}: {
  email: string;
  kind: IdentityKind;
  assets: Partial<Record<CaptureSlot, IdentityAsset>>;
  cancelled: () => boolean;
  progress: (message: string) => void;
}) {
  function assertActive() {
    if (cancelled()) throw new IdentityError("Verificarea a fost anulată.");
  }
  if (!secureIdentityUrl(baseUrl))
    throw new IdentityError(
      "Verificarea identității necesită o conexiune securizată. Fotografiile nu au fost trimise. Poți folosi un cont existent până când verificarea este disponibilă.",
    );
  const slots: CaptureSlot[] = [...documentSlots[kind], "selfie"];
  if (slots.some((slot) => !assets[slot]))
    throw new IdentityError(
      "Adaugă toate fotografiile și documentele necesare.",
    );
  assertActive();
  progress("Se pornește verificarea...");
  const { verification } = await api.startIdentity({
    email: email.toLowerCase().trim(),
    kind,
  });
  assertActive();
  if (verification.checks?.face_match === "not_available")
    throw new IdentityError(
      "Verificarea facială nu este disponibilă momentan. Fotografiile nu au fost trimise și contul nu a fost creat. Reîncearcă mai târziu.",
    );
  if (!(Date.parse(verification.expires_at) > Date.now()))
    throw new IdentityError("Verificarea a expirat. Încearcă din nou.");
  for (let i = 0; i < slots.length; i++) {
    assertActive();
    const slot = slots[i];
    progress(`Se trimite ${slotLabels[slot]} (${i + 1}/${slots.length})...`);
    const content_base64 = await assetBase64(assets[slot]!);
    assertActive();
    await api.uploadIdentityFile(verification.id, {
      slot,
      content_type: assets[slot]!.contentType,
      content_base64,
    });
  }
  assertActive();
  progress("Se verifică documentele și identitatea...");
  const result = await api.completeIdentity(verification.id);
  assertActive();
  if (!identityApproved(result, email)) {
    if (result.verification.checks?.face_match === "not_available")
      throw new IdentityError(
        "Verificarea facială nu este disponibilă momentan. Contul nu a fost creat. Reîncearcă mai târziu.",
      );
    throw new NovaError(
      409,
      "identity_not_verified",
      "Identitatea nu a fost confirmată. Verifică fotografiile și încearcă din nou.",
    );
  }
  return result;
}
