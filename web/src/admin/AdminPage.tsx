import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../lib/format';
import { adminApi, type AdminDispute, type AdminLog, type AdminUser } from './client';

const TOKEN_KEY = 'nova-admin-token';
const sections = ['overview', 'users', 'tasks', 'disputes', 'ledger', 'partners', 'events', 'logs'] as const;
type Section = (typeof sections)[number];

const labels: Record<Section, string> = {
  overview: 'Rezumat',
  users: 'Utilizatori',
  tasks: 'Sarcini',
  disputes: 'Dispute',
  ledger: 'Registru',
  partners: 'Parteneri',
  events: 'Evenimente',
  logs: 'Jurnal',
};

function text(value: unknown) {
  if (value == null) return '';
  return String(value);
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
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
    try {
      const me = await adminApi.me(next);
      if (me.user.role !== 'admin') throw new Error('Contul nu este de administrator.');
      setName(me.user.display_name);
      const [userRows, taskRows, disputeRows, ledgerRows, partnerRows, eventRows, logRows] = await Promise.all([
        adminApi.users(next),
        adminApi.tasks(next),
        adminApi.disputes(next),
        adminApi.ledger(next),
        adminApi.partners(next),
        adminApi.events(next),
        adminApi.logs(next),
      ]);
      setUsers(userRows.users || []);
      setTasks(taskRows.tasks || []);
      setDisputes(disputeRows.disputes || []);
      setEntries(ledgerRows.entries || []);
      setPartners(partnerRows.partners || []);
      setEvents(eventRows.events || []);
      setLogs(logRows.logs || []);
    } catch (cause) {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load(token);
  }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await adminApi.login(email, password);
      if (result.user.role !== 'admin') throw new Error('Contul nu este de administrator.');
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPassword('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await action();
      setNotice(done);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
      setLoading(false);
    }
  }

  if (!token) {
    return <main className="dashboard page-width" id="main-content">
      <form className="workspace-content" onSubmit={login}>
        <p className="eyebrow">Producție</p>
        <h1>Intrare administrator</h1>
        <p>Modul demo este oprit. Folosește contul de administrator, nu actorul demo.</p>
        <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required /></label>
        <label>Parolă<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={loading}>Intră</button>
      </form>
    </main>;
  }

  return <main className="dashboard page-width" id="main-content">
    <div className="workspace-content">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Producție</p>
          <h1>Panou administrator</h1>
          <p>{name}. Baza live este volumul SQLite de pe server. Resetul demo este oprit.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); void adminApi.logout(token).catch(() => undefined); setToken(''); }} disabled={loading}>Ieși</button>
      </div>
      <nav aria-label="Secțiuni administrator" className="filter-row">
        {sections.map(item => <button key={item} className={item === section ? 'button button-primary button-small' : 'button button-secondary button-small'} type="button" onClick={() => setSection(item)}>{labels[item]}</button>)}
      </nav>
      {notice && <p className="success-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p>Se încarcă...</p>}
      {section === 'overview' && <ul>
        <li>{users.length} utilizatori, {users.filter(user => user.status === 'suspended').length} suspendați</li>
        <li>{tasks.length} sarcini, {tasks.filter(task => task.status === 'hidden').length} ascunse</li>
        <li>{disputes.filter(item => item.status === 'open').length} dispute deschise</li>
        <li>{partners.length} parteneri, {entries.length} înregistrări în registru, {events.length} evenimente, {logs.length} acțiuni în jurnal</li>
      </ul>}
      {section === 'users' && <Table headers={['Nume', 'Email', 'Rol', 'Stare', 'Acțiune']} rows={users.map(user => [user.display_name, user.email || '—', user.role, user.status, <button key={user.id} className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.setUserStatus(token, user.id, user.status === 'suspended' ? 'active' : 'suspended'), user.status === 'suspended' ? 'Cont reactivat.' : 'Cont suspendat.')}>{user.status === 'suspended' ? 'Reactivează' : 'Suspendă'}</button>])} />}
      {section === 'tasks' && <Table headers={['Sarcină', 'Poster', 'Oraș', 'Stare', 'Acțiune']} rows={tasks.map(task => [text(task.title), text(task.poster_name), text(task.city), text(task.status), task.status === 'hidden'
        ? <button key={text(task.id)} className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.unhideTask(token, text(task.id)), 'Sarcina este din nou publică.')}>Arată</button>
        : <button key={text(task.id)} className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.hideTask(token, text(task.id)), 'Sarcina a fost ascunsă.')}>Ascunde</button>])} />}
      {section === 'disputes' && <Table headers={['Sarcină', 'Motiv', 'Stare', 'Acțiune']} rows={disputes.map(item => [item.task_id, item.reason, item.status, item.status === 'open' ? <span key={item.id}><button className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.resolveDispute(token, item.id, 'release'), 'Plata a fost eliberată.')}>Eliberează</button> <button className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.resolveDispute(token, item.id, 'refund'), 'Plata a fost returnată.')}>Returnează</button></span> : '—'])} />}
      {section === 'ledger' && <Table headers={['Înregistrare', 'Sarcină', 'Sumă', 'Detaliu']} rows={entries.map(entry => [text(entry.id), text(entry.task_id), text(entry.amount_bani || entry.worker_bani), text(entry.kind || entry.status || entry.note)])} />}
      {section === 'partners' && <Table headers={['Nume', 'Stare', 'Acțiune']} rows={partners.map(partner => [text(partner.name), text(partner.status), partner.status === 'active' ? 'Activ' : <button key={text(partner.id)} className="button button-secondary button-small" type="button" disabled={loading} onClick={() => void run(() => adminApi.activatePartner(token, text(partner.id)), 'Partener activat.')}>Activează</button>])} />}
      {section === 'events' && <Table headers={['Titlu', 'Oraș', 'Începe', 'Locuri']} rows={events.map(event => [text(event.title), text(event.city), text(event.starts_at), text(event.slots)])} />}
      {section === 'logs' && <Table headers={['Când', 'Actor', 'Acțiune', 'Țintă', 'Detaliu']} rows={logs.map(log => [log.created_at, log.actor_id, log.action, log.target, log.detail || '—'])} />}
    </div>
  </main>;
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p>Nu există rânduri.</p>;
  return <div className="task-table-wrapper"><table className="task-table">
    <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr className="task-row" key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}
