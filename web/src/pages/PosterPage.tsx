import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftIcon, ArrowUpRightIcon, CheckCircleIcon, CircleIcon, SquaresFourIcon, PlusIcon } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/instance';
import { clearPosterSession, posterAccount, savePosterSession, type PosterAccount } from '../api/session';
import type { TaskStatus } from '../api/types';
import { TaskForm } from '../components/TaskForm';
import { MyTaskList, useMyTasks } from '../components/MyTaskList';
import { errorMessage } from '../lib/format';

export default function PosterPage() {
  const [searchParams] = useSearchParams();
  const { tasks, loading, error, refresh } = useMyTasks();
  const [account, setAccount] = useState<PosterAccount | null>(() => posterAccount());
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1');
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => { if (showForm && account) { composer.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); composer.current?.querySelector('input')?.focus({ preventScroll: true }); } }, [showForm, account]);
  if (!account) return <PosterLogin onReady={user => { setAccount(user); void refresh(); }} />;
  const initial = account.display_name.trim().charAt(0).toUpperCase() || 'N';
  const firstName = account.display_name.split(' ')[0];
  return <main className="dashboard page-width" id="main-content">
    <aside className="workspace-sidebar" aria-label="Spațiul de lucru"><div className="workspace-identity"><span className="avatar">{initial}</span><div><strong>{account.display_name}</strong><span>Cont poster</span></div></div><p className="eyebrow">Spațiul meu</p><button className="workspace-link" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><SquaresFourIcon size={19} aria-hidden="true" />Toate sarcinile</button><button className="workspace-link" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}><CircleIcon size={19} aria-hidden="true" />Deschise</button><button className="workspace-link" aria-pressed={filter === 'assigned'} onClick={() => setFilter('assigned')}><ArrowUpRightIcon size={19} aria-hidden="true" />Atribuite</button><button className="workspace-link" aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}><CheckCircleIcon size={19} aria-hidden="true" />Finalizate</button><div className="sidebar-note"><span>Cont real</span><p>Publici aici. Candidaturile vin din aplicația mobilă.</p></div><Link className="workspace-back" to="/"><ArrowLeftIcon size={17} aria-hidden="true" />Înapoi la Nova</Link></aside>
    <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">Privire de ansamblu</p><h1>Sarcinile mele</h1><p>Salut, {firstName}. Ce ai de rezolvat astăzi?</p></div><button className="button button-primary" onClick={() => { setShowForm(true); setMessage(''); }}><PlusIcon size={20} aria-hidden="true" />Postează o sarcină</button></div>
    <div className="task-overview" aria-label="Situația sarcinilor">{(['open', 'assigned', 'completed'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}><span>{status === 'open' ? 'Deschise' : status === 'assigned' ? 'În lucru' : 'Finalizate'}</span><strong>{loading || error ? '—' : tasks.filter(task => task.status === status).length}</strong><ArrowUpRightIcon size={18} aria-hidden="true" /></button>)}</div>
    {message && <p className="success-notice" role="status">{message}</p>}
    <div ref={composer}>{showForm && <TaskForm onClose={() => setShowForm(false)} onCreated={async () => { setMessage('Sarcina a fost publicată. Este disponibilă în aplicația mobilă.'); setFilter('all'); await refresh(); }} />}</div>
    <MyTaskList tasks={tasks} loading={loading} error={error} refresh={refresh} filter={filter} setFilter={setFilter} expanded={expanded} setExpanded={setExpanded} onCreate={() => setShowForm(true)} onNotice={setMessage} />
    <aside className="dashboard-help"><h3>Candidaturile vin de pe mobil.</h3><p>Folosește „Actualizează” pentru a vedea sarcinile curente și „Actualizează candidaturile” din detalii pentru persoanele care au aplicat.</p></aside>
    </div>
  </main>;
}

function PosterLogin({ onReady }: { onReady: (user: PosterAccount) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('1990-01-01');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') {
        await api.register({ role: 'poster', email: email.trim(), password, display_name: displayName.trim(), birth_date: birthDate });
      }
      const result = await api.login({ email: email.trim(), password });
      if (result.user.role !== 'poster') throw new Error('Acest cont nu este de poster.');
      const user = { id: result.user.id, display_name: result.user.display_name, role: result.user.role };
      savePosterSession(result.token, user);
      onReady(user);
    } catch (cause) {
      clearPosterSession();
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="dashboard page-width" id="main-content">
    <form className="workspace-content" onSubmit={submit}>
      <p className="eyebrow">Cont poster</p>
      <h1>{mode === 'login' ? 'Intră în spațiul tău' : 'Creează un cont poster'}</h1>
      <p>Site-ul folosește contul tău, nu un actor demo.</p>
      {mode === 'register' && <label className="field">Nume<input value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} autoComplete="name" /></label>}
      <label className="field">Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" required autoComplete="username" /></label>
      <label className="field">Parolă<input value={password} onChange={event => setPassword(event.target.value)} type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode === 'register' && <label className="field">Data nașterii<input value={birthDate} onChange={event => setBirthDate(event.target.value)} type="date" required /></label>}
      {mode === 'register' && <div className="legal-accept"><label><input type="checkbox" required /> <span>Accept Termenii și condițiile și confirm că am citit Nota de confidențialitate.</span></label><p>Citește <Link to="/termeni" target="_blank" rel="noopener noreferrer">Termenii și condițiile</Link> și <Link to="/confidentialitate" target="_blank" rel="noopener noreferrer">Nota de confidențialitate</Link>. Acesta este un demo; nu trimite acte reale până la completarea informațiilor despre operator.</p></div>}
      {mode === 'login' && <p className="legal-inline">Despre datele contului: <Link to="/confidentialitate">Nota de confidențialitate</Link>.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-bottom">
        <button className="button button-secondary" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Nu am cont' : 'Am deja cont'}</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Se verifică…' : mode === 'login' ? 'Intră' : 'Creează contul'}</button>
      </div>
    </form>
  </main>;
}
