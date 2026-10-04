import type { NovaClient } from '../api/client';
import type { IdentityKind, IdentityProof, IdentityVerification } from '../api/types';

export const MAX_IDENTITY_BYTES = 2_000_000;
export type IdentitySlotKey = 'ci_front' | 'cei_front' | 'cei_back' | 'cei_pdf' | 'selfie';
export type IdentityFile = { blob: Blob; contentType: 'image/jpeg' | 'application/pdf'; name: string; preview?: string };

export const documentSlots: Record<IdentityKind, IdentitySlotKey[]> = {
  ci: ['ci_front'],
  cei: ['cei_front', 'cei_back', 'cei_pdf'],
};
export const slotLabels: Record<IdentitySlotKey, string> = {
  ci_front: 'CI · față',
  cei_front: 'CEI · față',
  cei_back: 'CEI · verso',
  cei_pdf: 'PDF din RO CEI Reader',
  selfie: 'Selfie',
};

export class IdentityError extends Error {}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Re-encodes any photo as JPEG under the 2 MB upload limit, keeping as much resolution as possible. */
export async function prepareImage(file: File): Promise<IdentityFile> {
  if (!file.type.startsWith('image/')) throw new IdentityError('Alege o fotografie (JPEG sau PNG).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new IdentityError('Nu am putut citi fotografia. Încearcă alt fișier.');
  }
  try {
    for (const edge of [3200, 2400, 1800, 1200]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new IdentityError('Browserul nu poate procesa fotografia.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.94, 0.88, 0.8]) {
        const blob = await canvasBlob(canvas, quality);
        if (blob && blob.size >= 8 && blob.size <= MAX_IDENTITY_BYTES) {
          return { blob, contentType: 'image/jpeg', name: 'fotografie.jpg', preview: URL.createObjectURL(blob) };
        }
      }
    }
  } finally {
    bitmap.close();
  }
  throw new IdentityError('Fotografia depășește limita de 2 MB. Încearcă alta.');
}

export async function preparePdf(file: File): Promise<IdentityFile> {
  if (file.size > MAX_IDENTITY_BYTES) throw new IdentityError('PDF-ul este prea mare. Alege exportul original, de maximum 2 MB.');
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') {
    throw new IdentityError('Alege fișierul PDF original din RO CEI Reader, nu o fotografie sau o captură de ecran.');
  }
  return { blob: file, contentType: 'application/pdf', name: file.name };
}

export function releaseFile(file?: IdentityFile) {
  if (file?.preview) URL.revokeObjectURL(file.preview);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new IdentityError('Nu am putut citi fișierul. Selectează-l din nou.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

// A CNP/file check alone is not proof that the person owns the document.
export function identityApproved(result: { verification?: IdentityVerification; proof: IdentityProof | null }, email: string): boolean {
  const checks = result.verification?.checks;
  return Boolean(
    result.verification?.status === 'verified' && checks?.files === 'passed' && checks?.cnp === 'passed'
    && checks?.selfie === 'passed' && checks?.face_match === 'passed' && checks?.document === 'passed'
    && result.proof?.token && result.proof.email.toLowerCase().trim() === email.toLowerCase().trim()
    && Date.parse(result.proof.expires_at) > Date.now(),
  );
}

export async function verifyIdentity(
  client: Pick<NovaClient, 'startIdentity' | 'uploadIdentityFile' | 'completeIdentity'>,
  input: { email: string; kind: IdentityKind; files: Partial<Record<IdentitySlotKey, IdentityFile>>; progress: (message: string) => void },
) {
  const slots: IdentitySlotKey[] = [...documentSlots[input.kind], 'selfie'];
  if (slots.some(slot => !input.files[slot])) throw new IdentityError('Adaugă toate fotografiile și documentele necesare.');
  const email = input.email.toLowerCase().trim();
  input.progress('Se pornește verificarea...');
  const { verification } = await client.startIdentity({ email, kind: input.kind });
  if (!verification?.id || verification.email !== email || verification.kind !== input.kind || verification.status !== 'collecting') {
    throw new IdentityError('Răspuns neașteptat de la server. Încearcă din nou.');
  }
  // Documents are never sent unless the server says the face check is available.
  if (!['pending', 'passed'].includes(verification.checks?.face_match ?? '')) {
    throw new IdentityError('Verificarea facială nu este disponibilă momentan. Fotografiile nu au fost trimise și contul nu a fost creat. Reîncearcă mai târziu.');
  }
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const file = input.files[slot]!;
    input.progress(`Se trimite ${slotLabels[slot]} (${i + 1}/${slots.length})...`);
    await client.uploadIdentityFile(verification.id, { slot, content_type: file.contentType, content_base64: await toBase64(file.blob) });
  }
  input.progress('Se verifică documentele și identitatea...');
  const result = await client.completeIdentity(verification.id);
  if (!identityApproved(result, email) || result.verification.id !== verification.id) {
    if (result.verification?.checks?.face_match === 'not_available') {
      throw new IdentityError('Verificarea facială nu este disponibilă momentan. Contul nu a fost creat. Reîncearcă mai târziu.');
    }
    throw new IdentityError(result.verification?.message ?? 'Identitatea nu a fost confirmată. Verifică fotografiile și încearcă din nou.');
  }
  return result;
}
