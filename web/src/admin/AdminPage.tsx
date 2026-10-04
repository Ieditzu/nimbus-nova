import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/format';
import { adminApi, type AdminDispute, type AdminLog, type AdminUser } from './client';
import './admin.css';

const TOKEN_KEY = 'nova-admin-token';
const sections = ['overview', 'users', 'tasks', 'disputes', 'ledger', 'partners', 'events', 'logs'] as const;
type Section = (typeof sections)[number];
const titles: Record<Section, string> = {
  overview: 'Rezumat',
  users: 'Utilizatori',
  tasks: 'Sarcini',
  disputes: 'Dispute',
  ledger: 'Registru',
  partners: 'Parteneri',
  events: 'Evenimente',
  logs: 'Jurnal',
};
const statusLabel: Record<string, string> = {
  active: 'Activ', suspended: 'Suspendat', open: 'Deschisă', hidden: 'Ascunsă',
  assigned: 'Atribuită', completed: 'Finalizată', resolved: 'Rezolvată',
};

function cell(value: unknown) {
  return value == null || value === '' ? '—' : String(value);
}
function money(bani: unknown) {
  const amount = Number(bani);
  if (!Number.isFinite(amount)) return '—';
  return `${(amount / 100).toFixed(2)} RON`;
}
function when(value: unknown) {
  const date = new Date(cell(value));
  if (Number.isNaN(date.getTime())) return cell(value);
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(date);
}

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: Section = sections.includes(requested as Section) ? requested as Section : 'overview';
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<null | (() => Promise<unknown>)>(null);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [partners, setPartners] = useState<Record<string, unknown>[]>([]);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);

  async function load(next = token) {
    setLoading(true);
    setError('');
    const me = await adminApi.me(next);
    if (me.user.role !== 'admin') throw new Error('Contul nu este de administrator.');
    setName(me.user.display_name);
    const [userRows, taskRows, disputeRows, ledgerRows, partnerRows, eventRows, logRows] = await Promise.all([
      adminApi.users(next), adminApi.tasks(next), adminApi.disputes(next), adminApi.ledger(next),
      adminApi.partners(next), adminApi.events(next), adminApi.logs(next),
    ]);
    setUsers(userRows.users || []);
    setTasks(taskRows.tasks || []);
    setDisputes(disputeRows.disputes || []);
    setEntries(ledgerRows.entries || []);
    setPartners(partnerRows.partners || []);
    setEvents(eventRows.events || []);
    setLogs(logRows.logs || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!token) return;
    void load(token).catch(cause => {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
      setError(errorMessage(cause));
      setLoading(false);
    });
  }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await adminApi.login(email.trim(), password);
      if (result.user.role !== 'admin') throw new Error('Contul nu este de administrator.');
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPassword('');
    } catch (cause) {
      setError(errorMessage(cause));
      setLoading(false);
    }
  }

  async function run(action: () => Promise<unknown>, done: string, reverse?: () => Promise<unknown>) {
    setError('');
    setNotice('');
    setUndo(null);
    setConfirmId('');
    setLoading(true);
    try {
      await action();
      setNotice(done);
      setUndo(() => reverse || null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
      setLoading(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const shownUsers = useMemo(() => users.filter(user => `${user.display_name} ${user.email} ${user.role}`.toLowerCase().includes(needle)), [users, needle]);
  const shownTasks = useMemo(() => tasks.filter(task => `${cell(task.title)} ${cell(task.city)} ${cell(task.poster_name)}`.toLowerCase().includes(needle)), [tasks, needle]);
  const shownDisputes = useMemo(() => disputes.filter(item => `${item.reason} ${item.task_id} ${item.status}`.toLowerCase().includes(needle)), [disputes, needle]);
  const openTasks = tasks.filter(task => task.status === 'open');
  const openDisputes = disputes.filter(item => item.status === 'open').length;

  if (!token) {
    return <main className="ops-login" id="main-content">
      <form className="ops-card" onSubmit={login}>
        <div className="ops-mark" aria-hidden="true">n</div>
        <h1>Intrare în birou</h1>
        <p>Contul de administrator pentru sarcinile, oamenii și plățile Nova. Modul demo este oprit.</p>
        <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required placeholder="admin@nimbusnova.cc" /></label>
        <label>Parolă<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
        {error && <p className="ops-alert" role="alert">{error}</p>}
        <button className="ops-btn" type="submit" disabled={loading}>{loading ? 'Se verifică…' : 'Intră'}</button>
      </form>
    </main>;
  }

  return <div className="ops">
    <aside className="ops-side">
      <a className="ops-brand" href="/admin"><span className="ops-mark" aria-hidden="true">n</span><span><strong>Nova birou</strong><span>{name}</span></span></a>
      <nav className="ops-nav" aria-label="Secțiuni">
        {sections.map(item => <button key={item} type="button" aria-current={item === section ? 'page' : undefined} onClick={() => { setQuery(''); setParams({ section: item }); }}>{titles[item]}{item === 'disputes' && openDisputes > 0 ? <span className="ops-count">{openDisputes}</span> : null}</button>)}
      </nav>
      <div className="ops-side-foot">
        <button className="ops-btn-quiet" type="button" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); void adminApi.logout(token).catch(() => undefined); setToken(''); }}>Ieși</button>
      </div>
    </aside>
    <main className="ops-main" id="main-content">
      <header className="ops-head">
        <div>
          <h1>{titles[section]}</h1>
          <p>{section === 'overview' ? 'Ce este deschis acum, apoi oamenii din baza live.' : 'Filtrează lista. Suspendarea și ascunderea se pot anula din aviz.'}</p>
        </div>
      </header>
      {notice && <p className="ops-note" role="status">{notice} {undo && <button className="ops-btn-quiet" type="button" onClick={() => void run(undo, 'Anulat.')}>Anulează</button>}</p>}
      {error && <p className="ops-alert" role="alert">{error}</p>}
      {section === 'overview' && <>
        <p className="ops-lead"><strong>{openDisputes}</strong><span>{openDisputes === 1 ? 'dispută deschisă' : 'dispute deschise'}</span></p>
        <div className="ops-split">
          <section>
            <h2>Sarcini deschise</h2>
            <Grid headers={['Sarcină', 'Oraș', 'Sumă', 'Stare']} numeric={[2]} rows={openTasks.map(task => [cell(task.title), cell(task.city), money(task.amount_bani), <Pill key={cell(task.id)} value={cell(task.status)} />])} />
          </section>
          <section>
            <h2>Oameni</h2>
            <Grid headers={['Nume', 'Rol', 'Stare']} rows={users.map(user => [user.display_name, user.role, <Pill key={user.id} value={user.status} />])} />
          </section>
        </div>
      </>}
      {section !== 'overview' && <input className="ops-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Caută nume, oraș sau motiv" aria-label="Caută în secțiune" />}
      {section === 'users' && <Grid headers={['Nume', 'Email', 'Rol', 'Stare', '']} rows={shownUsers.map(user => [user.display_name, user.email || '—', user.role, <Pill key={user.id} value={user.status} />, <button key={`${user.id}-a`} className="ops-btn-quiet" type="button" disabled={loading} onClick={() => void run(() => adminApi.setUserStatus(token, user.id, user.status === 'suspended' ? 'active' : 'suspended'), user.status === 'suspended' ? 'Cont reactivat.' : 'Cont suspendat.', () => adminApi.setUserStatus(token, user.id, user.status === 'suspended' ? 'suspended' : 'active'))}>{user.status === 'suspended' ? 'Reactivează' : 'Suspendă'}</button>])} />}
      {section === 'tasks' && <Grid headers={['Sarcină', 'Poster', 'Oraș', 'Sumă', 'Stare', '']} numeric={[3]} rows={shownTasks.map(task => [cell(task.title), cell(task.poster_name), cell(task.city), money(task.amount_bani), <Pill key={cell(task.id)} value={cell(task.status)} />, task.status === 'hidden'
        ? <button key={`${cell(task.id)}-u`} className="ops-btn-quiet" type="button" disabled={loading} onClick={() => void run(() => adminApi.unhideTask(token, cell(task.id)), 'Sarcina este din nou publică.', () => adminApi.hideTask(token, cell(task.id)))}>Arată</button>
        : <button key={`${cell(task.id)}-h`} className="ops-btn-quiet" type="button" disabled={loading} onClick={() => void run(() => adminApi.hideTask(token, cell(task.id)), 'Sarcina a fost ascunsă.', () => adminApi.unhideTask(token, cell(task.id)))}>Ascunde</button>])} />}
      {section === 'disputes' && <Grid headers={['Motiv', 'Sarcină', 'Stare', '']} rows={shownDisputes.map(item => [item.reason, item.task_id, <Pill key={item.id} value={item.status} />, item.status !== 'open' ? '—' : confirmId === item.id
        ? <button key={item.id} className="ops-btn-danger is-solid" type="button" disabled={loading} onClick={() => void run(() => adminApi.resolveDispute(token, item.id, 'refund'), 'Plata a fost returnată.')}>Confirmă returnarea</button>
        : <span key={item.id}><button className="ops-btn-quiet" type="button" disabled={loading} onClick={() => void run(() => adminApi.resolveDispute(token, item.id, 'release'), 'Plata a fost eliberată.')}>Eliberează</button> <button className="ops-btn-danger" type="button" disabled={loading} onClick={() => setConfirmId(item.id)}>Returnează</button></span>])} />}
      {section === 'ledger' && <Grid headers={['Cont', 'Direcție', 'Sumă', 'Sarcină', 'Când']} numeric={[2]} rows={entries.filter(entry => `${cell(entry.account)} ${cell(entry.task_id)}`.toLowerCase().includes(needle)).map(entry => [cell(entry.account), cell(entry.direction), money(entry.amount_bani), cell(entry.task_id), when(entry.created_at)])} />}
      {section === 'partners' && <Grid headers={['Nume', 'Stare', '']} rows={partners.filter(partner => cell(partner.name).toLowerCase().includes(needle)).map(partner => [cell(partner.name), <Pill key={cell(partner.id)} value={cell(partner.status)} />, partner.status === 'active' ? 'Activ' : <button key={cell(partner.id)} className="ops-btn-quiet" type="button" disabled={loading} onClick={() => void run(() => adminApi.activatePartner(token, cell(partner.id)), 'Partener activat.')}>Activează</button>])} />}
      {section === 'events' && <Grid headers={['Titlu', 'Oraș', 'Începe', 'Locuri']} numeric={[3]} rows={events.filter(event => cell(event.title).toLowerCase().includes(needle)).map(event => [cell(event.title), cell(event.city), when(event.starts_at), cell(event.slots)])} />}
      {section === 'logs' && <Grid headers={['Când', 'Acțiune', 'Țintă', 'Detaliu']} rows={logs.filter(log => `${log.action} ${log.target} ${log.detail}`.toLowerCase().includes(needle)).map(log => [when(log.created_at), log.action, log.target, log.detail || '—'])} />}
    </main>
  </div>;
}

function Pill({ value }: { value: string }) {
  return <span className={`ops-pill ${value}`}>{statusLabel[value] || value || '—'}</span>;
}

function Grid({ headers, rows, numeric = [] }: { headers: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  if (rows.length === 0) return <p className="ops-empty">Nimic de arătat aici.</p>;
  return <div className="ops-table-wrap"><table className="ops-table">
    <thead><tr>{headers.map((header, index) => <th key={header || index} className={numeric.includes(index) ? 'num' : undefined}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((item, cellIndex) => <td key={cellIndex} className={numeric.includes(cellIndex) ? 'num' : 'ops-clip'}>{item}</td>)}</tr>)}</tbody>
  </table></div>;
}
