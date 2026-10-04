import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import { ronToBani, toRfc3339 } from '../api/client';
import { api } from '../api/instance';
import type { Category } from '../api/types';
import { amountCaption, errorMessage } from '../lib/format';
import { categories } from '../lib/labels';
import { ErrorNotice } from './Feedback';

export function TaskForm({ onCreated, onClose }: { onCreated: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
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
      await onCreated();
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="composer" aria-labelledby="composer-title"><div className="composer-heading"><div><h2 id="composer-title">O sarcină nouă</h2><p>Câteva detalii clare fac diferența.</p></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Închide formularul"><XIcon size={22} aria-hidden="true" /></button></div>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label className="field field-wide">Titlu<input name="title" required minLength={3} maxLength={80} placeholder="De exemplu: Amenajare mese pentru un eveniment" /></label>
          <label className="field">Categorie<select name="category" defaultValue="event_setup">{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="field">Oraș<input name="city" required minLength={2} maxLength={80} defaultValue="București" autoComplete="address-level2" /></label>
          <label className="field">Începe la<input type="datetime-local" name="starts_at" required aria-describedby="time-note" /></label>
          <label className="field">Se termină la<input type="datetime-local" name="ends_at" required aria-invalid={!!fields.ends_at} aria-describedby={fields.ends_at ? 'end-error time-note' : 'time-note'} />{fields.ends_at && <span className="field-error" id="end-error" role="alert">{fields.ends_at}</span>}</label>
          <p className="field-note field-wide" id="time-note">Orele sunt pe fusul Europe/Bucharest, UTC+03:00. Maximum 12 ore.</p>
          <div className="field field-wide amount-field"><label htmlFor="task-amount">Sumă propusă (RON)</label><div className="input-unit"><input id="task-amount" name="amount" inputMode="decimal" required placeholder="100,00" aria-invalid={!!fields.amount} aria-describedby={fields.amount ? 'amount-error amount-note' : 'amount-note'} /><span aria-hidden="true">RON</span></div>{fields.amount && <span id="amount-error" className="field-error" role="alert">{fields.amount}</span>}<span className="field-note" id="amount-note">{amountCaption}</span></div>
          <label className="field field-wide">Descriere<textarea name="description" rows={3} required minLength={10} maxLength={500} placeholder="Ce trebuie făcut? Ce ar trebui să știe persoana care aplică?" /></label>
          <label className="field field-wide">Notă de siguranță <span className="optional">Opțional</span><input name="safety_note" maxLength={200} placeholder="De exemplu: Doar obiecte ușoare, fără acces în locuințe." /></label>
        </div>
      </fieldset>
      <div className="legal-accept"><label><input type="checkbox" required disabled={busy} /> <span>Confirm că anunțul respectă Termenii și condițiile și nu conține date personale ale altor persoane.</span></label><p>Titlul, orașul, suma și descrierea pot fi vizibile public. Citește <Link to="/termeni" target="_blank" rel="noopener noreferrer">Termenii</Link> și <Link to="/confidentialitate" target="_blank" rel="noopener noreferrer">Nota de confidențialitate</Link>.</p></div>
      {error && <ErrorNotice message={error} />}
      <div className="form-bottom"><span>Sarcina va fi vizibilă în aplicația mobilă.</span><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Se publică...' : 'Publică sarcina'}<ArrowRightIcon size={18} aria-hidden="true" /></button></div>
    </form>
  </section>;
}
