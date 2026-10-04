import { useState } from 'react';
import { LockKeyIcon, XIcon } from '@phosphor-icons/react';
import type { IdentityKind } from '../api/types';
import { documentSlots, IdentityError, prepareImage, preparePdf, releaseFile, slotLabels, type IdentityFile, type IdentitySlotKey } from '../lib/identity';

export type IdentityFiles = Partial<Record<IdentitySlotKey, IdentityFile>>;

export function IdentityFields({ kind, onKind, files, onFiles, disabled }: {
  kind: IdentityKind; onKind: (kind: IdentityKind) => void;
  files: IdentityFiles; onFiles: (files: IdentityFiles) => void; disabled: boolean;
}) {
  const [error, setError] = useState('');
  const slots: IdentitySlotKey[] = [...documentSlots[kind], 'selfie'];

  function changeKind(next: IdentityKind) {
    if (next === kind || disabled) return;
    Object.values(files).forEach(releaseFile);
    onFiles({});
    setError('');
    onKind(next);
  }
  async function pick(slot: IdentitySlotKey, list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setError('');
    try {
      const prepared = slot === 'cei_pdf' ? await preparePdf(file) : await prepareImage(file);
      releaseFile(files[slot]);
      onFiles({ ...files, [slot]: prepared });
    } catch (cause) {
      setError(cause instanceof IdentityError ? cause.message : 'Nu am putut importa fișierul. Selectează-l din nou.');
    }
  }
  function remove(slot: IdentitySlotKey) {
    releaseFile(files[slot]);
    const next = { ...files };
    delete next[slot];
    onFiles(next);
  }

  return <fieldset className="identity-fields" disabled={disabled}>
    <legend>Verifică-ți identitatea</legend>
    <p className="field-note">Conturile sunt create doar după verificarea unui act european și a unui selfie. Vârsta se stabilește din act: postarea și joburile plătite sunt de la 16 ani.</p>
    <div className="identity-kinds" role="radiogroup" aria-label="Tipul actului">
      {(['ci', 'cei'] as const).map(value => <label key={value} className="identity-kind" data-checked={kind === value}>
        <input type="radio" name="identity-kind" checked={kind === value} onChange={() => changeKind(value)} />
        <strong>{value.toUpperCase()}</strong>
        <span>{value === 'ci' ? 'Carte de identitate clasică' : 'Carte electronică de identitate'}</span>
      </label>)}
    </div>
    <p className="field-note">{kind === 'ci'
      ? 'Fotografiază fața CI-ului complet, cu toate colțurile vizibile. Spatele nu este necesar.'
      : 'Fotografiază față și verso, inclusiv portretul de pe card, apoi importă PDF-ul exportat din RO CEI Reader.'}</p>
    {slots.map(slot => {
      const file = files[slot];
      const isPdf = slot === 'cei_pdf';
      return <div key={slot} className="identity-slot">
        <div className="identity-slot-head">
          <strong>{slotLabels[slot]}</strong>
          {file && <button type="button" className="icon-button" onClick={() => remove(slot)} aria-label={`Elimină ${slotLabels[slot]}`}><XIcon size={18} aria-hidden="true" /></button>}
        </div>
        {file?.preview && <img className="identity-preview" src={file.preview} alt={`Previzualizare ${slotLabels[slot]}`} />}
        {file && !file.preview && <p className="field-note">{file.name} · {(file.blob.size / 1_000_000).toFixed(1)} MB</p>}
        <label className="button button-secondary button-small identity-pick">
          {file ? 'Înlocuiește' : isPdf ? 'Alege PDF-ul' : slot === 'selfie' ? 'Fă un selfie' : 'Alege fotografia'}
          <input
            type="file"
            accept={isPdf ? 'application/pdf' : 'image/*'}
            capture={slot === 'selfie' ? 'user' : undefined}
            onChange={event => { void pick(slot, event.target.files); event.target.value = ''; }}
          />
        </label>
      </div>;
    })}
    <p className="field-note identity-privacy"><LockKeyIcon size={16} aria-hidden="true" /> Fotografiile sunt trimise către ID Analyzer, în regiunea UE, doar pentru verificare, și se șterg după finalizare.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </fieldset>;
}
