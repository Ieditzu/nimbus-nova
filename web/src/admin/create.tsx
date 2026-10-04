import { useState, type FormEvent } from 'react';
import { adminApi } from './client';
import type { Desk } from './desk';
import { leiToBani, roleLabel } from './format';
import { Dialog, Field } from './ui';
import { toRfc3339 } from '../api/client';
import { categories } from '../lib/labels';

const roles = ['worker', 'poster', 'admin'] as const;
const jobTypes = [
  { id: 'short_term', label: 'Termen scurt' },
  { id: 'long_term', label: 'Termen lung' },
  { id: 'volunteer', label: 'Voluntariat' },
] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start);
  end.setHours(16, 0, 0, 0);
  return { starts_at: localInput(start), ends_at: localInput(end) };
}

const blankUser = {
  display_name: '', email: '', password: '', phone_number: '', birth_date: '2000-01-01',
  role: 'worker', guardian_email: '', identity_verified: true,
};

export function CreateUserDialog({ desk, open, onClose }: { desk: Desk; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(blankUser);
  const [error, setError] = useState('');
  const set = (key: keyof typeof blankUser) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.display_name.trim().length < 2) return setError('Numele trebuie să aibă cel puțin 2 caractere.');
    if (!form.email.includes('@')) return setError('Emailul nu este valid.');
    if (form.password.length < 8) return setError('Parola trebuie să aibă cel puțin 8 caractere.');
    if (!form.birth_date) return setError('Data nașterii este obligatorie.');
    let created = '';
    const ok = await desk.run(async () => {
      const detail = await adminApi.createUser(desk.token, {
        role: form.role,
        email: form.email.trim(),
        password: form.password,
        display_name: form.display_name.trim(),
        phone_number: form.phone_number.trim(),
        birth_date: form.birth_date,
        guardian_email: form.guardian_email.trim(),
        identity_verified: form.identity_verified,
      });
      created = detail.user.id;
    }, 'Cont creat. Persoana se poate conecta cu emailul și parola.');
    if (!ok) return;
    setForm(blankUser);
    setError('');
    onClose();
    if (created) desk.openUser(created);
  }

  return <Dialog open={open} onClose={onClose} title="Cont nou" footer={<><button type="button" className="dk-btn is-ghost" onClick={onClose}>Renunță</button><button type="submit" form="user-create" className="dk-btn">Creează contul</button></>}>
    <form id="user-create" className="dk-form" onSubmit={event => void submit(event)}>
      <Field label="Nume"><input value={form.display_name} onChange={set('display_name')} maxLength={80} autoFocus required /></Field>
      <div className="dk-form-row">
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Parolă" hint="Cel puțin 8 caractere. O vei putea schimba din profil."><input type="text" value={form.password} onChange={set('password')} minLength={8} autoComplete="off" required /></Field>
      </div>
      <div className="dk-form-row">
        <Field label="Telefon" hint="Opțional. Exemplu: 0722 000 111."><input value={form.phone_number} onChange={set('phone_number')} inputMode="tel" /></Field>
        <Field label="Data nașterii"><input type="date" value={form.birth_date} onChange={set('birth_date')} required /></Field>
      </div>
      <div className="dk-form-row">
        <Field label="Rol"><select value={form.role} onChange={set('role')}>{roles.map(role => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></Field>
        <Field label="Email tutore" hint="Obligatoriu sub 16 ani."><input type="email" value={form.guardian_email} onChange={set('guardian_email')} /></Field>
      </div>
      <label className="dk-toggle"><input type="checkbox" checked={form.identity_verified} onChange={event => setForm(current => ({ ...current, identity_verified: event.target.checked }))} />Marchează identitatea ca verificată</label>
      {error && <p className="dk-alert" role="alert">{error}</p>}
    </form>
  </Dialog>;
}

export function CreateTaskDialog({ desk, open, onClose }: { desk: Desk; open: boolean; onClose: () => void }) {
  const posters = desk.data.users.filter(user => user.role === 'poster' && user.status === 'active');
  const [form, setForm] = useState(() => ({
    poster_id: posters[0]?.id ?? '', title: '', category: 'event_setup', job_type: 'short_term', city: 'București',
    amount: '100', description: '', safety_note: '', ...defaultWindow(),
  }));
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  const volunteer = form.job_type === 'volunteer';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.poster_id) return setError('Alege un poster.');
    if (form.title.trim().length < 3) return setError('Titlul trebuie să aibă cel puțin 3 caractere.');
    if (form.city.trim().length < 2) return setError('Orașul trebuie să aibă cel puțin 2 caractere.');
    if (form.description.trim().length < 10) return setError('Descrierea trebuie să aibă cel puțin 10 caractere.');
    const amount = volunteer ? 0 : leiToBani(form.amount);
    if (!volunteer && (!Number.isFinite(amount) || amount <= 0)) return setError('Pentru un job plătit introdu o sumă mai mare decât zero.');
    if (!form.starts_at || !form.ends_at) return setError('Alege intervalul.');
    let created = '';
    const ok = await desk.run(async () => {
      const result = await adminApi.createTask(desk.token, {
        poster_id: form.poster_id,
        job_type: form.job_type as 'short_term' | 'long_term' | 'volunteer',
        title: form.title.trim(),
        category: form.category as 'event_setup' | 'light_moving' | 'shop_cover' | 'other',
        city: form.city.trim(),
        starts_at: toRfc3339(form.starts_at),
        ends_at: toRfc3339(form.ends_at),
        amount_bani: amount,
        description: form.description.trim(),
        safety_note: form.safety_note.trim(),
      });
      created = result.task.id;
    }, 'Sarcină publicată.');
    if (!ok) return;
    setError('');
    onClose();
    if (created) desk.openTask(created);
  }

  return <Dialog open={open} onClose={onClose} title="Sarcină nouă" footer={<><button type="button" className="dk-btn is-ghost" onClick={onClose}>Renunță</button><button type="submit" form="task-create" className="dk-btn">Publică</button></>}>
    <form id="task-create" className="dk-form" onSubmit={event => void submit(event)}>
      <Field label="Poster" hint={posters.length === 0 ? 'Creează mai întâi un cont de poster.' : 'Sarcina apare în contul acestui poster.'}>
        <select value={form.poster_id} onChange={set('poster_id')} required>
          {posters.length === 0 && <option value="">Niciun poster activ</option>}
          {posters.map(user => <option key={user.id} value={user.id}>{user.display_name}</option>)}
        </select>
      </Field>
      <Field label="Titlu"><input value={form.title} onChange={set('title')} maxLength={80} autoFocus required /></Field>
      <div className="dk-form-row">
        <Field label="Categorie"><select value={form.category} onChange={set('category')}>{Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></Field>
        <Field label="Tip"><select value={form.job_type} onChange={set('job_type')}>{jobTypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      </div>
      <div className="dk-form-row">
        <Field label="Oraș"><input value={form.city} onChange={set('city')} maxLength={80} required /></Field>
        <Field label="Sumă (RON)" hint={volunteer ? 'Voluntariatul este fără plată.' : 'Maxim 5.000 RON.'}><input inputMode="decimal" value={volunteer ? '0' : form.amount} onChange={set('amount')} disabled={volunteer} /></Field>
      </div>
      <div className="dk-form-row">
        <Field label="Începe"><input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} required /></Field>
        <Field label="Se termină"><input type="datetime-local" value={form.ends_at} onChange={set('ends_at')} required /></Field>
      </div>
      <Field label="Descriere" hint="Cel puțin 10 caractere."><textarea rows={3} maxLength={500} value={form.description} onChange={set('description')} required /></Field>
      <Field label="Notă de siguranță" hint="Opțional."><input value={form.safety_note} onChange={set('safety_note')} maxLength={200} /></Field>
      {error && <p className="dk-alert" role="alert">{error}</p>}
    </form>
  </Dialog>;
}
