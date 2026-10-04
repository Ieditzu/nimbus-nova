import type { NovaClient } from "../api/client";
import type { IdentityKind } from "../api/types";
import type { IdentityAsset } from "./files";
import { IdentityError } from "./errors.ts";
import {
  documentSlots,
  identityApproved,
  secureIdentityUrl,
  slotLabels,
  type CaptureSlot,
} from "./policy.ts";

export type IdentityFlowInput = {
  email: string;
  kind: IdentityKind;
  assets: Partial<Record<CaptureSlot, IdentityAsset>>;
  cancelled: () => boolean;
  progress: (message: string) => void;
};
type IdentityServices = {
  baseUrl: string;
  client: Pick<
    NovaClient,
    "startIdentity" | "uploadIdentityFile" | "completeIdentity"
  >;
  readAsset: (asset: IdentityAsset) => Promise<string>;
};

/** Keep the upload boundary testable without a camera, real documents or secrets. */
export async function verifyIdentityFlow(
  { email, kind, assets, cancelled, progress }: IdentityFlowInput,
  { baseUrl, client, readAsset }: IdentityServices,
) {
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
  const normalizedEmail = email.toLowerCase().trim();
  progress("Se pornește verificarea...");
  const { verification } = await client.startIdentity({
    email: normalizedEmail,
    kind,
  });
  assertActive();
  if (
    !verification ||
    !verification.id ||
    verification.email !== normalizedEmail ||
    verification.kind !== kind ||
    verification.status !== "collecting"
  )
    throw new IdentityError(
      "Răspuns neașteptat de la server. Încearcă din nou.",
    );
  // Missing checks are unavailable too: older servers must never receive documents.
  if (!["pending", "passed"].includes(verification.checks?.face_match ?? ""))
    throw new IdentityError(
      "Verificarea facială nu este disponibilă momentan. Fotografiile nu au fost trimise și contul nu a fost creat. Reîncearcă mai târziu.",
    );
  if (!(Date.parse(verification.expires_at) > Date.now()))
    throw new IdentityError("Verificarea a expirat. Încearcă din nou.");
  for (let i = 0; i < slots.length; i++) {
    assertActive();
    const slot = slots[i];
    progress(`Se trimite ${slotLabels[slot]} (${i + 1}/${slots.length})...`);
    const asset = assets[slot]!;
    const content_base64 = await readAsset(asset);
    assertActive();
    await client.uploadIdentityFile(verification.id, {
      slot,
      content_type: asset.contentType,
      content_base64,
    });
  }
  assertActive();
  progress("Se verifică documentele și identitatea...");
  const result = await client.completeIdentity(verification.id);
  assertActive();
  if (
    !identityApproved(result, normalizedEmail) ||
    result.verification.id !== verification.id
  ) {
    if (result.verification?.checks?.face_match === "not_available")
      throw new IdentityError(
        "Verificarea facială nu este disponibilă momentan. Contul nu a fost creat. Reîncearcă mai târziu.",
      );
    throw new IdentityError(
      "Identitatea nu a fost confirmată. Verifică fotografiile și încearcă din nou.",
    );
  }
  return result;
}
