import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import { ronToBani, toRfc3339 } from '../api/client';
import { api } from '../api/instance';
import type { Category } from '../api/types';
import { amountCaption, errorMessage } from '../lib/format';
import { categories } from '../lib/labels';
import { ErrorNotice } from './Feedback';

type Draft = { title: string; category: string; city: string; amount: string; description: string; safety_note: string };

export function TaskForm({ onCreated, onClose }: { onCreated: () => Promise<void>; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function current() {
    const data = new FormData(formRef.current ?? undefined);
    const value = (key: string) => String(data.get(key) || '').trim();
    return value;
  }

  async function sketch() {
    setError(''); setWarning(''); setAssistBusy(true);
    try {
      const result = await api.draftTask({ brief });
      setDraft({
        title: result.draft.title,
        category: result.draft.category,
        city: result.draft.city || 'București',
        amount: result.draft.amount_bani ? (result.draft.amount_bani / 100).toFixed(2) : '',
        description: result.draft.description,
        safety_note: result.draft.safety_note,
      });
      setWarning(result.warning);
    } catch (failure) { setError(errorMessage(failure)); } finally { setAssistBusy(false); }
  }

  async function checkSafety() {
    const value = current();
    setError(''); setAssistBusy(true);
    try {
      const result = await api.checkSafety({ title: value('title'), description: value('description'), safety_note: value('safety_note') });
      setWarning(result.warning);
      if (result.safety_note) setDraft(currentDraft => ({ ...(currentDraft ?? { title: value('title'), category: value('category'), city: value('city'), amount: value('amount'), description: value('description'), safety_note: '' }), safety_note: result.safety_note }));
    } catch (failure) { setError(errorMessage(failure)); } finally { setAssistBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) || '').trim();
    setError(''); setFields({});
    let amount: number;
    try { amount = ronToBani(value('amount')); } catch (failure) { setFields({ amount: errorMessage(failure) }); form.elements.namedItem('amount') && (form.elements.namedItem('amount') as HTMLInputElement).focus(); return; }
    const start = toRfc3339(value('starts_at')), end = toRfc3339(value('ends_at'));
    const duration = new Date(end).getTime() - new Date(start).getTime();
    if (duration <= 0 || duration > 12 * 60 * 60 * 1000) {
      setFields({ ends_at: duration <= 0 ? 'Ora de final trebuie să fie după ora de început.' : 'Durata trebuie să fie de cel mult 12 ore.' });
      (form.elements.namedItem('ends_at') as HTMLInputElement).focus(); return;
    }
    setBusy(true);
    try {
      await api.createTask({ title: value('title'), category: value('category') as Category, city: value('city'), starts_at: start, ends_at: end, amount_bani: amount, description: value('description'), safety_note: value('safety_note') });
      form.reset();
      setDraft(null);
      setBrief('');
      await onCreated();
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="composer" aria-labelledby="composer-title"><div className="composer-heading"><div><h2 id="composer-title">O sarcină nouă</h2><p>Spune ce ai nevoie, sau completează câmpurile.</p></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Închide formularul"><XIcon size={22} aria-hidden="true" /></button></div>
    <form ref={formRef} key={draft ? draft.title + draft.safety_note : 'blank'} onSubmit={submit}>
      <fieldset disabled={busy || assistBusy}>
        <div className="form-grid">
          <label className="field field-wide">Spune cu cuvintele tale<textarea value={brief} onChange={event => setBrief(event.target.value)} rows={2} maxLength={800} placeholder="De exemplu: am nevoie de doi oameni sâmbătă în București să mute o masă, în jur de 150 lei, fără să intre în casă." /></label>
          <div className="field field-wide form-bottom"><button className="button button-secondary" type="button" disabled={assistBusy || brief.trim().length < 8} onClick={() => void sketch()}>{assistBusy ? 'Se gândește...' : 'Schițează anunțul'}</button></div>
          <label className="field field-wide">Titlu<input name="title" required minLength={3} maxLength={80} defaultValue={draft?.title} placeholder="De exemplu: Amenajare mese pentru un eveniment" /></label>
          <label className="field">Categorie<select name="category" defaultValue={draft?.category || 'event_setup'}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="field">Oraș<input name="city" required minLength={2} maxLength={80} defaultValue={draft?.city || 'București'} autoComplete="address-level2" /></label>
          <label className="field">Începe la<input type="datetime-local" name="starts_at" required aria-describedby="time-note" /></label>
          <label className="field">Se termină la<input type="datetime-local" name="ends_at" required aria-invalid={!!fields.ends_at} aria-describedby={fields.ends_at ? 'end-error time-note' : 'time-note'} />{fields.ends_at && <span className="field-error" id="end-error" role="alert">{fields.ends_at}</span>}</label>
          <p className="field-note field-wide" id="time-note">Orele sunt pe fusul Europe/Bucharest, UTC+03:00. Maximum 12 ore. Schița nu alege ora.</p>
          <div className="field field-wide amount-field"><label htmlFor="task-amount">Sumă propusă (RON)</label><div className="input-unit"><input id="task-amount" name="amount" inputMode="decimal" required placeholder="100,00" defaultValue={draft?.amount} aria-invalid={!!fields.amount} aria-describedby={fields.amount ? 'amount-error amount-note' : 'amount-note'} /><span aria-hidden="true">RON</span></div>{fields.amount && <span id="amount-error" className="field-error" role="alert">{fields.amount}</span>}<span className="field-note" id="amount-note">{amountCaption}</span></div>
          <label className="field field-wide">Descriere<textarea name="description" rows={3} required minLength={10} maxLength={500} defaultValue={draft?.description} placeholder="Ce trebuie făcut? Ce ar trebui să știe persoana care aplică?" /></label>
          <label className="field field-wide">Notă de siguranță <span className="optional">Opțional</span><input name="safety_note" maxLength={200} defaultValue={draft?.safety_note} placeholder="De exemplu: Doar obiecte ușoare, fără acces în locuințe." /></label>
          <div className="field field-wide"><button className="button button-secondary" type="button" disabled={assistBusy} onClick={() => void checkSafety()}>Verifică siguranța</button></div>
        </div>
      </fieldset>
      <div className="legal-accept"><label><input type="checkbox" required disabled={busy} /> <span>Confirm că anunțul respectă Termenii și condițiile și nu conține date personale ale altor persoane.</span></label><p>Titlul, orașul, suma și descrierea pot fi vizibile public. Citește <Link to="/termeni" target="_blank" rel="noopener noreferrer">Termenii</Link> și <Link to="/confidentialitate" target="_blank" rel="noopener noreferrer">Nota de confidențialitate</Link>.</p></div>
      {warning && <p className="success-notice" role="status">{warning}</p>}
      {error && <ErrorNotice message={error} />}
      <div className="form-bottom"><span>Sarcina va fi vizibilă în aplicația mobilă.</span><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Se publică...' : 'Publică sarcina'}<ArrowRightIcon size={18} aria-hidden="true" /></button></div>
    </form>
  </section>;
}
