import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftIcon, ArrowUpRightIcon, CheckCircleIcon, CircleIcon, SquaresFourIcon, PlusIcon } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/instance';
import { clearPosterSession, posterAccount, savePosterSession, type PosterAccount } from '../api/session';
import type { IdentityKind, TaskStatus } from '../api/types';
import { IdentityFields, type IdentityFiles } from '../components/IdentityFields';
import { documentSlots, IdentityError, releaseFile, verifyIdentity } from '../lib/identity';
import { TaskForm } from '../components/TaskForm';
import { PlatformReviews } from '../components/PlatformReviews';
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
    <PlatformReviews canWrite />
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
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<IdentityKind>('ci');
  const [files, setFiles] = useState<IdentityFiles>({});
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') {
        if ([...documentSlots[kind], 'selfie' as const].some(slot => !files[slot])) {
          throw new IdentityError('Adaugă toate fotografiile și documentele necesare pentru verificare.');
        }
        const result = await verifyIdentity(api, { email: email.trim(), kind, files, progress: setProgress });
        setProgress('Se creează contul...');
        await api.register({ role: 'poster', email: email.trim().toLowerCase(), password, display_name: displayName.trim(), phone_number: phone.trim(), identity_proof: result.proof!.token });
        Object.values(files).forEach(releaseFile);
        setFiles({});
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
      setProgress('');
    }
  }

  return <main className="pl" id="main-content">
    <div className="lp-wrap pl-wrap">
    <div className="pl-copy">
      <p className="lp-pill">✦ Cont poster</p>
      <h1 className="lp-display">{mode === 'login' ? <>Intră în<br />spațiul tău</> : <>Creează<br />un cont</>}</h1>
      <p className="lp-lead">Publici sarcini, primești candidaturi și plătești prin Nova. Site-ul folosește contul tău real.</p>
    </div>
    <form className="pl-card" onSubmit={submit}>
      {mode === 'register' && <label className="field">Nume<input value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} autoComplete="name" /></label>}
      <label className="field">Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" required autoComplete="username" /></label>
      <label className="field">Parolă<input value={password} onChange={event => setPassword(event.target.value)} type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode === 'register' && <label className="field">Număr de telefon<input value={phone} onChange={event => setPhone(event.target.value)} type="tel" required minLength={8} maxLength={30} autoComplete="tel" placeholder="+40 712 345 678" /></label>}
      {mode === 'register' && <IdentityFields kind={kind} onKind={setKind} files={files} onFiles={setFiles} disabled={busy} />}
      {mode === 'register' && <div className="legal-accept"><label><input type="checkbox" required /> <span>Accept Termenii și condițiile și confirm că am citit Nota de confidențialitate.</span></label><p>Citește <Link to="/termeni" target="_blank" rel="noopener noreferrer">Termenii și condițiile</Link> și <Link to="/confidentialitate" target="_blank" rel="noopener noreferrer">Nota de confidențialitate</Link>. Actul și selfie-ul se folosesc doar pentru verificarea identității și vârstei.</p></div>}
      {mode === 'login' && <p className="legal-inline">Despre datele contului: <Link to="/confidentialitate">Nota de confidențialitate</Link>.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-bottom">
        <button className="button button-secondary" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Nu am cont' : 'Am deja cont'}</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? (progress || 'Se verifică…') : mode === 'login' ? 'Intră' : 'Verifică și creează contul'}</button>
      </div>
    </form>
    </div>
  </main>;
}
