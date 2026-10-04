import type { NovaClient } from "../api/client";
import type { IdentityKind, IdentitySlot } from "../api/types";

export const MAX_IDENTITY_BYTES = 2_000_000;
export type CaptureSlot = Exclude<IdentitySlot, "ci_scan_text">;
export type IdentityResult = Awaited<
  ReturnType<NovaClient["completeIdentity"]>
>;
export const documentSlots: Record<IdentityKind, CaptureSlot[]> = {
  ci: ["ci_front", "ci_back"],
  cei: ["cei_front", "cei_back", "cei_pdf"],
};
export const slotLabels: Record<CaptureSlot, string> = {
  ci_front: "CI · față",
  ci_back: "CI · verso",
  cei_front: "CEI · față",
  cei_back: "CEI · verso",
  cei_pdf: "PDF din RO CEI Reader",
  selfie: "Selfie",
};

export function secureIdentityUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).protocol === "https:";
  } catch {
    return false;
  }
}

// A CNP/file check alone is not proof that the person owns the document.
export function identityApproved(
  result: IdentityResult,
  email: string,
  now = Date.now(),
): boolean {
  const checks = result.verification?.checks;
  return Boolean(
    result.verification?.status === "verified" &&
      checks?.files === "passed" &&
      checks?.cnp === "passed" &&
      checks?.selfie === "passed" &&
      checks?.face_match === "passed" &&
      checks?.document === "passed" &&
      typeof result.proof?.token === "string" &&
      result.proof.token.trim().length > 0 &&
      typeof result.proof.email === "string" &&
      result.proof.email.toLowerCase().trim() === email.toLowerCase().trim() &&
      typeof result.proof.expires_at === "string" &&
      Date.parse(result.proof.expires_at) > now,
  );
}
