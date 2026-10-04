import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { EyeIcon, EyeSlashIcon, PencilSimpleIcon, PlayIcon, ProhibitIcon, SignOutIcon, TrashIcon } from '@phosphor-icons/react';
import type { TaskPublic } from '../api/types';
import { errorMessage, formatInterval } from '../lib/format';
import { categories } from '../lib/labels';
import { adminApi, type AdminLog, type AdminNote } from './client';
import type { Desk } from './desk';
import { actionLabel, ago, money, roleLabel, statusLabel, when } from './format';
import { Avatar, Dialog, Field, Pill } from './ui';
import type { AdminUserDetail } from './client';

function useDetail<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    load().then(result => { if (live) setData(result); }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
    // The loader closes over the same inputs that are listed in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="dk-facts is-grid">{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="dk-block"><h3>{title}{count !== undefined && <span>{count}</span>}</h3>{children}</section>;
}

function TaskRows({ desk, tasks, empty }: { desk: Desk; tasks: TaskPublic[]; empty: string }) {
  if (tasks.length === 0) return <p className="dk-muted">{empty}</p>;
  return <ul className="dk-list">{tasks.map(task => <li key={task.id}>
    <button type="button" onClick={() => desk.openTask(task.id)}>
      <span className="dk-cell-main"><b>{task.title}</b><small>{task.city} · {formatInterval(task.starts_at, task.ends_at)}</small></span>
      <span className="dk-list-end"><b>{money(task.amount_bani)}</b><Pill value={task.status} /></span>
    </button>
  </li>)}</ul>;
}

function Timeline({ desk, logs }: { desk: Desk; logs: AdminLog[] }) {
  if (logs.length === 0) return <p className="dk-muted">Nicio acțiune de administrare încă.</p>;
  return <ul className="dk-timeline">{logs.map(log => <li key={log.id}>
    <b>{actionLabel[log.action] ?? log.action}</b>
    <span>{desk.userName(log.actor_id)} · <span title={when(log.created_at)}>{ago(log.created_at)}</span>{log.detail ? ` · ${log.detail}` : ''}</span>
  </li>)}</ul>;
}

function Notes({ desk, target, notes, refresh }: { desk: Desk; target: string; notes: AdminNote[]; refresh: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.addNote(desk.token, target, text.trim());
      setText('');
      refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return <Block title="Note interne" count={notes.length}>
    <form className="dk-notes-form" onSubmit={event => void submit(event)}>
      <textarea aria-label="Notă internă" rows={2} maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Doar echipa vede notele. Ce ar trebui să știe următorul moderator?" />
      <button type="submit" className="dk-btn is-small" disabled={busy || !text.trim()}>{busy ? 'Se salvează…' : 'Adaugă nota'}</button>
    </form>
    {error && <p className="dk-alert" role="alert">{error}</p>}
    {notes.length > 0 && <ul className="dk-notes">{notes.map(note => <li key={note.id}>
      <p>{note.text}</p>
      <small>{note.author_name || desk.userName(note.author_id)} · <span title={when(note.created_at)}>{ago(note.created_at)}</span></small>
    </li>)}</ul>}
  </Block>;
}

function Stars({ value }: { value: number }) {
  return <span className="dk-stars" aria-label={`${value} din 5`}>{'★'.repeat(value)}<i>{'★'.repeat(5 - value)}</i></span>;
}

/* -------------------------------------------------------------------- user */

function EditUser({ desk, detail, self, done }: { desk: Desk; detail: AdminUserDetail; self: boolean; done: () => void }) {
  const u = detail.user;
  const [form, setForm] = useState({
    display_name: u.display_name, email: u.email, phone_number: u.phone_number, birth_date: u.birth_date,
    guardian_email: u.guardian_email, role: u.role, identity_verified: u.identity_verified,
  });
  const [profile, setProfile] = useState({
    skills: (detail.profile?.skills ?? []).join(', '), city: detail.profile?.city ?? '',
    availability: detail.profile?.availability ?? '', bio: detail.profile?.bio ?? '',
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = (key: 'display_name' | 'email' | 'phone_number' | 'birth_date' | 'guardian_email') =>
    (event: React.ChangeEvent<HTMLInputElement>) => setForm(value => ({ ...value, [key]: event.target.value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const patch: Record<string, string | boolean> = {};
      (Object.keys(form) as Array<keyof typeof form>).forEach(key => {
        if (form[key] !== u[key]) patch[key] = form[key];
      });
      if (Object.keys(patch).length) await adminApi.updateUser(desk.token, u.id, patch);
      if (detail.profile || profile.city.trim()) {
        const skills = profile.skills.split(',').map(item => item.trim()).filter(Boolean);
        const before = detail.profile;
        const changed = !before || before.city !== profile.city.trim() || before.availability !== profile.availability.trim()
          || before.bio !== profile.bio.trim() || before.skills.join(',') !== skills.join(',');
        if (changed) await adminApi.updateProfile(desk.token, u.id, { skills, city: profile.city, availability: profile.availability, bio: profile.bio });
      }
      if (password) await adminApi.setUserPassword(desk.token, u.id, password);
      await desk.run(async () => undefined, 'Datele au fost salvate.');
      done();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <form className="dk-form dk-block" onSubmit={event => void save(event)}>
    <h3>Modifică contul</h3>
    <div className="dk-form-row">
      <Field label="Nume"><input value={form.display_name} onChange={text('display_name')} minLength={2} maxLength={80} required /></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={text('email')} required /></Field>
    </div>
    <div className="dk-form-row">
      <Field label="Telefon" hint="Format +40712345678"><input value={form.phone_number} onChange={text('phone_number')} /></Field>
      <Field label="Data nașterii" hint="Vârsta recalculează dreptul la joburi plătite (16+)"><input type="date" value={form.birth_date} onChange={text('birth_date')} /></Field>
    </div>
    <div className="dk-form-row">
      <Field label="Email tutore"><input type="email" value={form.guardian_email} onChange={text('guardian_email')} /></Field>
      <Field label="Rol" hint={self ? 'Nu îți poți schimba propriul rol' : undefined}>
        <select value={form.role} disabled={self} onChange={event => setForm(value => ({ ...value, role: event.target.value }))}>
          {Object.entries(roleLabel).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select>
      </Field>
    </div>
    <label className="dk-field"><span><input type="checkbox" checked={form.identity_verified} onChange={event => setForm(value => ({ ...value, identity_verified: event.target.checked }))} /> Identitate verificată</span>
      <small>Marcaj manual. Nu rulează verificarea cu documente.</small></label>
    <h3>Profil de lucrător</h3>
    <Field label="Competențe" hint="Separate prin virgulă, 1–8"><input value={profile.skills} onChange={event => setProfile(value => ({ ...value, skills: event.target.value }))} /></Field>
    <div className="dk-form-row">
      <Field label="Oraș"><input value={profile.city} onChange={event => setProfile(value => ({ ...value, city: event.target.value }))} /></Field>
      <Field label="Disponibilitate"><input value={profile.availability} onChange={event => setProfile(value => ({ ...value, availability: event.target.value }))} /></Field>
    </div>
    <Field label="Bio"><textarea rows={3} maxLength={280} value={profile.bio} onChange={event => setProfile(value => ({ ...value, bio: event.target.value }))} /></Field>
    {!self && <Field label="Parolă nouă" hint="Lasă gol pentru a nu o schimba. Închide toate sesiunile.">
      <input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} />
    </Field>}
    {error && <p className="dk-alert" role="alert">{error}</p>}
    <div className="dk-actions">
      <button type="submit" className="dk-btn is-small" disabled={busy}>{busy ? 'Se salvează…' : 'Salvează'}</button>
      <button type="button" className="dk-btn is-small is-ghost" disabled={busy} onClick={done}>Renunță</button>
    </div>
  </form>;
}

export function UserDrawer({ desk, id, onClose }: { desk: Desk; id: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const { data: detail, error } = useDetail(() => adminApi.user(desk.token, id), [id, desk.data, tick]);
  const user = detail?.user;
  const self = id === desk.me.id;

  function toggle() {
    if (!user) return;
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    const apply = () => void desk.run(() => adminApi.setUserStatus(desk.token, id, next), next === 'active' ? 'Cont reactivat.' : 'Cont suspendat.', () => adminApi.setUserStatus(desk.token, id, next === 'active' ? 'suspended' : 'active'));
    if (next === 'active') apply();
    else desk.confirm({ title: `Suspendă ${user.display_name}?`, body: 'Sesiunile active se închid imediat și persoana nu se mai poate conecta până o reactivezi.', label: 'Suspendă', danger: true, onConfirm: apply });
  }
  function revoke() {
    if (!user) return;
    desk.confirm({ title: 'Închizi toate sesiunile?', body: `${user.display_name} va trebui să se conecteze din nou pe fiecare dispozitiv.`, label: 'Închide sesiunile', danger: true, onConfirm: () => void desk.run(() => adminApi.revokeSessions(desk.token, id), 'Sesiunile au fost închise.') });
  }
  const taskTitle = (taskId: string) => desk.data.tasks.find(task => task.id === taskId)?.title ?? taskId;

  return <Dialog open onClose={onClose} variant="drawer" title={user?.display_name ?? 'Profil'}>
    {error && <p className="dk-alert" role="alert">{error}</p>}
    {!detail && !error && <p className="dk-muted" role="status">Se încarcă…</p>}
    {detail && user && <div className="dk-stack">
      <header className="dk-hero">
        <Avatar name={user.display_name} size="lg" />
        <div>
          <h3>{user.display_name}</h3>
          <p className="dk-muted">{user.email || user.id}</p>
          <div className="dk-row-gap"><Pill value="assigned" label={roleLabel[user.role] ?? user.role} /><Pill value={user.status} />{user.volunteer_only && <Pill value="paused" label="Sub 16" />}{user.identity_verified && <Pill value="verified" />}</div>
        </div>
      </header>
      <div className="dk-actions">
        <button type="button" className="dk-btn is-small" onClick={() => setEditing(value => !value)}><PencilSimpleIcon size={14} aria-hidden="true" />{editing ? 'Închide editarea' : 'Modifică'}</button>
      </div>
      {editing && <EditUser key={tick} desk={desk} detail={detail} self={self} done={() => { setEditing(false); setTick(value => value + 1); }} />}
      {!self && <div className="dk-actions">
        <button type="button" className={`dk-btn is-small ${user.status === 'suspended' ? '' : 'is-danger-ghost'}`} onClick={toggle}>{user.status === 'suspended' ? <><PlayIcon size={14} aria-hidden="true" />Reactivează</> : <><ProhibitIcon size={14} aria-hidden="true" />Suspendă contul</>}</button>
        <button type="button" className="dk-btn is-small is-ghost" onClick={revoke} disabled={detail.active_sessions === 0}><SignOutIcon size={14} aria-hidden="true" />Închide sesiunile ({detail.active_sessions})</button>
      </div>}
      <Facts rows={[
        ['Telefon', user.phone_number || '—'],
        ['Data nașterii', user.birth_date || '—'],
        ['Înscris', user.created_at ? ago(user.created_at) : 'înainte de urmărire'],
        ['Reputație', detail.reputation.count ? `${detail.reputation.average.toFixed(1)} ★ (${detail.reputation.count})` : 'Fără recenzii'],
        ...(user.guardian_email ? [['Tutore', user.guardian_email] as [string, ReactNode]] : []),
        ['ID', <code key="id">{user.id}</code>],
      ]} />
      {detail.profile && <Block title="Profil de lucrător">
        <p>{detail.profile.bio || <span className="dk-muted">Fără bio.</span>}</p>
        <div className="dk-row-gap">{detail.profile.skills.map(skill => <span key={skill} className="dk-tag">{skill}</span>)}</div>
        <p className="dk-muted">{detail.profile.city} · {detail.profile.availability}</p>
      </Block>}
      <Block title="Sarcini publicate" count={detail.tasks_posted.length}><TaskRows desk={desk} tasks={detail.tasks_posted} empty="Nu a publicat nicio sarcină." /></Block>
      <Block title="Sarcini atribuite" count={detail.tasks_assigned.length}><TaskRows desk={desk} tasks={detail.tasks_assigned} empty="Nu are sarcini atribuite." /></Block>
      <Block title="Candidaturi" count={detail.applications.length}>
        {detail.applications.length === 0 ? <p className="dk-muted">Nicio candidatură.</p> : <ul className="dk-list">{detail.applications.map(item => <li key={item.id}>
          <button type="button" onClick={() => desk.openTask(item.task_id)}>
            <span className="dk-cell-main"><b>{taskTitle(item.task_id)}</b><small className="dk-clip is-wide">{item.message}</small></span>
            <span className="dk-list-end"><Pill value={item.status} /></span>
          </button>
        </li>)}</ul>}
      </Block>
      <Block title="Recenzii primite" count={detail.reviews_about.length}>
        {detail.reviews_about.length === 0 ? <p className="dk-muted">Nicio recenzie primită.</p> : <ul className="dk-list is-static">{detail.reviews_about.map(review => <li key={review.id}>
          <div><Stars value={review.stars} /><p>{review.text}</p><small className="dk-muted">{review.author_name} · {ago(review.created_at)}</small></div>
          <button type="button" className="dk-icon-btn" aria-label="Șterge recenzia" onClick={() => desk.confirm({ title: 'Ștergi recenzia?', body: 'Reputația se recalculează. Acțiunea rămâne în jurnal.', label: 'Șterge recenzia', danger: true, onConfirm: () => void desk.run(() => adminApi.removeReview(desk.token, review.id), 'Recenzia a fost ștearsă.') })}><TrashIcon size={16} aria-hidden="true" /></button>
        </li>)}</ul>}
      </Block>
      <Block title="Recenzii scrise" count={detail.reviews_by.length}>
        {detail.reviews_by.length === 0 ? <p className="dk-muted">Nu a scris recenzii.</p> : <ul className="dk-list is-static">{detail.reviews_by.map(review => <li key={review.id}><div><Stars value={review.stars} /><p>{review.text}</p><small className="dk-muted">despre {review.subject_name} · {ago(review.created_at)}</small></div></li>)}</ul>}
      </Block>
      <Notes desk={desk} target={id} notes={detail.notes} refresh={() => setTick(value => value + 1)} />
      <Block title="Istoric administrare" count={detail.logs.length}><Timeline desk={desk} logs={detail.logs} /></Block>
    </div>}
  </Dialog>;
}

/* -------------------------------------------------------------------- task */

export function TaskDrawer({ desk, id, onClose }: { desk: Desk; id: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const { data: detail, error } = useDetail(() => adminApi.task(desk.token, id), [id, desk.data, tick]);
  const task = detail?.task;

  function toggle() {
    if (!task) return;
    const hide = task.status !== 'hidden';
    void desk.run(() => hide ? adminApi.hideTask(desk.token, id) : adminApi.unhideTask(desk.token, id), hide ? 'Sarcina a fost ascunsă.' : 'Sarcina este din nou publică.', () => hide ? adminApi.unhideTask(desk.token, id) : adminApi.hideTask(desk.token, id));
  }

  return <Dialog open onClose={onClose} variant="drawer" title={task?.title ?? 'Sarcină'}>
    {error && <p className="dk-alert" role="alert">{error}</p>}
    {!detail && !error && <p className="dk-muted" role="status">Se încarcă…</p>}
    {detail && task && <div className="dk-stack">
      <header className="dk-hero is-task">
        <div>
          <h3>{task.title}</h3>
          <p className="dk-muted">{(categories as Record<string, string>)[task.category] ?? task.category} · {task.city}{task.sector ? `, ${task.sector}` : ''}</p>
          <div className="dk-row-gap"><Pill value={task.status} />{detail.pay_status !== 'unpaid' && <Pill value={detail.pay_status} />}</div>
        </div>
        <strong className="dk-hero-amount">{money(task.amount_bani)}</strong>
      </header>
      <div className="dk-actions">
        <button type="button" className={`dk-btn is-small ${task.status === 'hidden' ? '' : 'is-danger-ghost'}`} onClick={toggle}>{task.status === 'hidden' ? <><EyeIcon size={14} aria-hidden="true" />Arată în feed</> : <><EyeSlashIcon size={14} aria-hidden="true" />Ascunde din feed</>}</button>
      </div>
      <Facts rows={[
        ['Poster', <button key="p" type="button" className="dk-link" onClick={() => desk.openUser(task.poster_id)}>{task.poster_name}</button>],
        ['Atribuită', task.assignee_id ? <button key="a" type="button" className="dk-link" onClick={() => desk.openUser(task.assignee_id as string)}>{task.assignee_name}</button> : '—'],
        ['Program', formatInterval(task.starts_at, task.ends_at)],
        ['Publicată', ago(task.created_at)],
        ['Conversații', String(detail.conversations)],
        ['Tip', detail.kind],
      ]} />
      <Block title="Descriere"><p>{task.description}</p>{task.safety_note && <p className="dk-note"><b>Siguranță:</b> {task.safety_note}</p>}</Block>
      {detail.payment && <Block title="Plată">
        <Facts rows={[
          ['Furnizor', detail.payment.provider],
          ['Stare', <Pill key="s" value={detail.payment.status} />],
          ['Sumă', money(detail.payment.amount_bani)],
          ['Comision Nova', money(detail.payment.platform_fee_bani)],
          ['Către lucrător', money(detail.payment.worker_payout_bani)],
        ]} />
      </Block>}
      {detail.disputes.length > 0 && <Block title="Dispute" count={detail.disputes.length}>
        <ul className="dk-list is-static">{detail.disputes.map(item => <li key={item.id}><div><Pill value={item.status} /><p>{item.reason}</p><small className="dk-muted">{desk.userName(item.opener_id)} · {ago(item.created_at)}</small></div></li>)}</ul>
      </Block>}
      <Block title="Candidaturi" count={detail.applications.length}>
        {detail.applications.length === 0 ? <p className="dk-muted">Nicio candidatură încă.</p> : <ul className="dk-list is-static">{detail.applications.map(item => <li key={item.id}>
          <div><div className="dk-row-gap"><button type="button" className="dk-link" onClick={() => desk.openUser(item.worker_id)}>{item.worker_name}</button><Pill value={item.status} label={statusLabel[item.status]} /></div><p>{item.message}</p></div>
        </li>)}</ul>}
      </Block>
      {detail.reviews.length > 0 && <Block title="Recenzii" count={detail.reviews.length}>
        <ul className="dk-list is-static">{detail.reviews.map(review => <li key={review.id}><div><Stars value={review.stars} /><p>{review.text}</p><small className="dk-muted">{review.author_name} → {review.subject_name}</small></div></li>)}</ul>
      </Block>}
      {detail.ledger.length > 0 && <Block title="Registru" count={detail.ledger.length}>
        <ul className="dk-list is-static">{detail.ledger.map(entry => <li key={entry.id}>
          <span className="dk-cap">{entry.account}</span>
          <span className="dk-list-end"><b className={entry.direction === 'credit' ? 'dk-pos' : 'dk-neg'}>{entry.direction === 'credit' ? '+' : '−'}{money(entry.amount_bani)}</b><small className="dk-muted">{when(entry.created_at)}</small></span>
        </li>)}</ul>
      </Block>}
      <Notes desk={desk} target={id} notes={detail.notes} refresh={() => setTick(value => value + 1)} />
      <Block title="Istoric administrare" count={detail.logs.length}><Timeline desk={desk} logs={detail.logs} /></Block>
    </div>}
  </Dialog>;
}
