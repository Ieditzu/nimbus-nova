import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowClockwiseIcon, ArrowUpRightIcon, ListIcon, MagnifyingGlassIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import { NovaError } from '../api/client';
import { errorMessage } from '../lib/format';
import { adminApi } from './client';
import { emptyData, sectionMeta, sections, type ConfirmRequest, type Desk, type DeskData, type Section } from './desk';
import { TaskDrawer, UserDrawer } from './drawers';
import { ago, fold, roleLabel } from './format';
import { Dialog } from './ui';
import { Applications, Disputes, Events, Identity, Ledger, Logs, Overview, Partners, Reviews, System, Tasks, Users } from './views';
import './admin.css';

const TOKEN_KEY = 'nova-admin-token';
const REFRESH_MS = 60_000;

const views: Record<Section, (props: { desk: Desk }) => ReactNode> = {
  overview: Overview, users: Users, tasks: Tasks, applications: Applications, reviews: Reviews, disputes: Disputes,
  identity: Identity, ledger: Ledger, partners: Partners, events: Events, logs: Logs, system: System,
};

type Toast = { id: number; kind: 'ok' | 'error'; text: string; undo?: () => Promise<unknown> };
type Drawer = { kind: 'user' | 'task'; id: string } | null;

function isSection(value: string | null): value is Section {
  return !!value && (sections as readonly string[]).includes(value);
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [loginError, setLoginError] = useState('');
  const signOut = useCallback((reason = '') => {
    const old = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (old) void adminApi.logout(old).catch(() => undefined);
    setToken('');
    setLoginError(reason);
  }, []);
  if (!token) return <Login error={loginError} onToken={value => { sessionStorage.setItem(TOKEN_KEY, value); setLoginError(''); setToken(value); }} />;
  return <Desk key={token} token={token} onExit={signOut} />;
}

/* ------------------------------------------------------------------- login */

function Login({ onToken, error: initial }: { onToken: (token: string) => void; error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(initial), [initial]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.login(email.trim(), password);
      if (result.user.role !== 'admin') {
        void adminApi.logout(result.token).catch(() => undefined);
        throw new Error('Contul nu este de administrator.');
      }
      setPassword('');
      onToken(result.token);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return <main className="dk-login" id="main-content">
    <div className="dk-login-art" aria-hidden="true">
      <span className="dk-login-word">NOVA</span>
      <span className="dk-login-dot is-a" /><span className="dk-login-dot is-b" /><span className="dk-login-dot is-c" />
    </div>
    <form className="dk-login-card" onSubmit={event => void submit(event)}>
      <span className="dk-mark" aria-hidden="true">N</span>
      <h1>Biroul Nova</h1>
      <p>Intră cu contul de administrator. Sesiunea se închide odată cu fila.</p>
      <label className="dk-field"><span>Email</span><input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required autoFocus placeholder="admin@nimbusnova.cc" /></label>
      <label className="dk-field"><span>Parolă</span><input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
      {error && <p className="dk-alert" role="alert">{error}</p>}
      <button className="dk-btn is-block" type="submit" disabled={busy}>{busy ? 'Se verifică…' : 'Intră în birou'}</button>
      <Link className="dk-link" to="/">← Înapoi la site</Link>
    </form>
  </main>;
}

/* -------------------------------------------------------------------- desk */

function Desk({ token, onExit }: { token: string; onExit: (reason?: string) => void }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: Section = isSection(requested) ? requested : 'overview';
  const [me, setMe] = useState<{ id: string; display_name: string } | null>(null);
  const [data, setData] = useState<DeskData>(emptyData);
  const [days, setDays] = useState<14 | 30>(14);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [partial, setPartial] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const request = useRef(0);
  const toastId = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async (silent = false) => {
    const current = ++request.current;
    if (!silent) setLoading(true);
    const settled = await Promise.allSettled([
      adminApi.stats(token, days), adminApi.system(token), adminApi.users(token), adminApi.tasks(token), adminApi.applications(token),
      adminApi.disputes(token), adminApi.reviews(token), adminApi.ledger(token), adminApi.partners(token), adminApi.events(token),
      adminApi.identity(token), adminApi.logs(token),
    ]);
    if (current !== request.current) return;
    const expired = settled.find(item => item.status === 'rejected' && item.reason instanceof NovaError && (item.reason.status === 401 || item.reason.status === 403));
    if (expired) { onExit('Sesiunea a expirat. Intră din nou.'); return; }
    const value = <T,>(index: number): T | undefined => {
      const item = settled[index];
      return item.status === 'fulfilled' ? item.value as T : undefined;
    };
    const failed = settled.filter(item => item.status === 'rejected').length;
    setData(previous => ({
      stats: value<{ stats: DeskData['stats'] }>(0)?.stats ?? previous.stats,
      system: value<{ system: DeskData['system'] }>(1)?.system ?? previous.system,
      users: value<{ users: DeskData['users'] }>(2)?.users ?? previous.users,
      tasks: value<{ tasks: DeskData['tasks'] }>(3)?.tasks ?? previous.tasks,
      applications: value<{ applications: DeskData['applications'] }>(4)?.applications ?? previous.applications,
      disputes: value<{ disputes: DeskData['disputes'] }>(5)?.disputes ?? previous.disputes,
      reviews: value<{ reviews: DeskData['reviews'] }>(6)?.reviews ?? previous.reviews,
      entries: value<{ entries: DeskData['entries'] }>(7)?.entries ?? previous.entries,
      partners: value<{ partners: DeskData['partners'] }>(8)?.partners ?? previous.partners,
      events: value<{ events: DeskData['events'] }>(9)?.events ?? previous.events,
      identity: value<{ sessions: DeskData['identity'] }>(10)?.sessions ?? previous.identity,
      logs: value<{ logs: DeskData['logs'] }>(11)?.logs ?? previous.logs,
    }));
    setPartial(failed ? `${failed} din 12 surse nu s-au putut încărca. Datele afișate pot fi vechi.` : '');
    setLoadedAt(new Date().toISOString());
    setLoading(false);
  }, [token, days, onExit]);

  useEffect(() => {
    let live = true;
    adminApi.me(token).then(result => {
      if (!live) return;
      if (result.user.role !== 'admin') onExit('Contul nu este de administrator.');
      else setMe({ id: result.user.id, display_name: result.user.display_name });
    }).catch(cause => { if (live) onExit(errorMessage(cause)); });
    return () => { live = false; };
  }, [token, onExit]);

  useEffect(() => { if (me) void load(); }, [me, load]);

  useEffect(() => {
    if (!me) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [me, load]);

  const showToast = useCallback((next: Omit<Toast, 'id'>) => {
    window.clearTimeout(timer.current);
    toastId.current += 1;
    setToast({ ...next, id: toastId.current });
    timer.current = window.setTimeout(() => setToast(null), next.undo ? 9000 : 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = useCallback(async (action: () => Promise<unknown>, done: string, undo?: () => Promise<unknown>) => {
    try {
      await action();
      showToast({ kind: 'ok', text: done, undo });
      await load(true);
      return true;
    } catch (cause) {
      showToast({ kind: 'error', text: errorMessage(cause) });
      return false;
    }
  }, [load, showToast]);

  const go = useCallback((next: Section) => { setDrawer(null); setNavOpen(false); setParams(next === 'overview' ? {} : { section: next }); }, [setParams]);

  const names = useMemo(() => new Map(data.users.map(user => [user.id, user.display_name])), [data.users]);
  const userName = useCallback((id: string) => names.get(id) ?? (id === 'system' ? 'Sistem' : id), [names]);

  const desk: Desk | null = me ? {
    token, me, data, loading, days, setDays, run, go, reload: () => load(true), userName,
    confirm: setConfirmReq,
    openUser: id => setDrawer({ kind: 'user', id }),
    openTask: id => setDrawer({ kind: 'task', id }),
  } : null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(value => !value); return; }
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('[data-desk-search]')?.focus(); return; }
      const match = sections.find(item => sectionMeta[item].key === event.key);
      if (match) go(match);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!desk) return <div className="dk-boot" role="status"><span className="dk-spinner" aria-hidden="true" />Se deschide biroul…</div>;

  const meta = sectionMeta[section];
  const View = views[section];
  const openDisputes = data.disputes.filter(item => item.status === 'open').length;
  const inReview = data.identity.filter(item => item.status === 'review').length;
  const badge: Partial<Record<Section, number>> = { disputes: openDisputes, identity: inReview };
  const groups = [...new Set(sections.map(item => sectionMeta[item].group))];

  return <div className="dk">
    <a className="skip-link" href="#desk-main">Mergi la conținut</a>
    <aside className={`dk-side${navOpen ? ' is-open' : ''}`}>
      <div className="dk-side-top">
        <Link className="dk-brand" to="/admin" onClick={() => go('overview')}><span className="dk-mark" aria-hidden="true">N</span><span><strong>Nova birou</strong><small>{desk.me.display_name}</small></span></Link>
        <button type="button" className="dk-icon-btn dk-nav-toggle" aria-expanded={navOpen} aria-label="Meniu" onClick={() => setNavOpen(value => !value)}>{navOpen ? <XIcon size={20} aria-hidden="true" /> : <ListIcon size={20} aria-hidden="true" />}</button>
      </div>
      <button type="button" className="dk-palette-trigger" onClick={() => setPalette(true)}><MagnifyingGlassIcon size={16} aria-hidden="true" />Caută<kbd>Ctrl K</kbd></button>
      <nav className="dk-nav" aria-label="Secțiuni">
        {groups.map(group => <div key={group} className="dk-nav-group">
          <span>{group}</span>
          {sections.filter(item => sectionMeta[item].group === group).map(item => {
            const Icon = sectionMeta[item].icon;
            const count = badge[item] ?? 0;
            return <button key={item} type="button" aria-current={item === section ? 'page' : undefined} onClick={() => go(item)}>
              <Icon size={18} weight={item === section ? 'fill' : 'regular'} aria-hidden="true" />{sectionMeta[item].title}
              {count > 0 && <b className="dk-count">{count}</b>}
            </button>;
          })}
        </div>)}
      </nav>
      <div className="dk-side-foot">
        <Link className="dk-side-link" to="/" target="_blank">Deschide site-ul<ArrowUpRightIcon size={14} aria-hidden="true" /></Link>
        <button type="button" className="dk-side-link" onClick={() => onExit()}><SignOutIcon size={16} aria-hidden="true" />Ieși</button>
      </div>
    </aside>

    <main className="dk-main" id="desk-main" tabIndex={-1}>
      <header className="dk-head">
        <div><h1>{meta.title}</h1><p>{meta.blurb}</p></div>
        <div className="dk-head-tools">
          {loadedAt && <span className="dk-muted" title={loadedAt}>Actualizat {ago(loadedAt)}</span>}
          <button type="button" className="dk-btn is-ghost is-small" onClick={() => void load()} disabled={loading}><ArrowClockwiseIcon size={15} className={loading ? 'is-spinning' : undefined} aria-hidden="true" />Reîncarcă</button>
        </div>
      </header>
      {partial && <p className="dk-alert" role="alert">{partial}</p>}
      <div key={section} className="dk-view"><View desk={desk} /></div>
    </main>

    <div className="dk-toasts" aria-live="polite">
      {toast && <div key={toast.id} className={`dk-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
        <span>{toast.text}</span>
        {toast.undo && <button type="button" onClick={() => { const undo = toast.undo; setToast(null); if (undo) void run(undo, 'Anulat.'); }}>Anulează</button>}
        <button type="button" className="dk-toast-x" aria-label="Închide" onClick={() => setToast(null)}><XIcon size={14} aria-hidden="true" /></button>
      </div>}
    </div>

    {drawer?.kind === 'user' && <UserDrawer key={drawer.id} desk={desk} id={drawer.id} onClose={() => setDrawer(null)} />}
    {drawer?.kind === 'task' && <TaskDrawer key={drawer.id} desk={desk} id={drawer.id} onClose={() => setDrawer(null)} />}

    <Dialog open={!!confirmReq} onClose={() => setConfirmReq(null)} title={confirmReq?.title ?? ''}
      footer={confirmReq && <><button type="button" className="dk-btn is-ghost" onClick={() => setConfirmReq(null)}>Renunță</button><button type="button" className={`dk-btn${confirmReq.danger ? ' is-danger' : ''}`} autoFocus onClick={() => { const action = confirmReq.onConfirm; setConfirmReq(null); action(); }}>{confirmReq.label}</button></>}>
      {confirmReq && <p>{confirmReq.body}</p>}
    </Dialog>

    <Palette open={palette} onClose={() => setPalette(false)} desk={desk} />
  </div>;
}

/* ----------------------------------------------------------------- palette */

type Hit = { key: string; label: string; hint: string; run: () => void };

function Palette({ open, onClose, desk }: { open: boolean; onClose: () => void; desk: Desk }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const needle = fold(q.trim());
  const hits = useMemo<Hit[]>(() => {
    const close = (fn: () => void) => () => { onClose(); fn(); };
    const list: Hit[] = sections
      .filter(item => !needle || fold(sectionMeta[item].title).includes(needle))
      .map(item => ({ key: `s-${item}`, label: sectionMeta[item].title, hint: 'Secțiune', run: close(() => desk.go(item)) }));
    if (needle.length >= 2) {
      desk.data.users.filter(user => fold(`${user.display_name} ${user.email} ${user.id}`).includes(needle)).slice(0, 6)
        .forEach(user => list.push({ key: `u-${user.id}`, label: user.display_name, hint: `${roleLabel[user.role] ?? user.role} · ${user.email || user.id}`, run: close(() => desk.openUser(user.id)) }));
      desk.data.tasks.filter(task => fold(`${task.title} ${task.city} ${task.id}`).includes(needle)).slice(0, 6)
        .forEach(task => list.push({ key: `t-${task.id}`, label: task.title, hint: `Sarcină · ${task.city}`, run: close(() => desk.openTask(task.id)) }));
    }
    return list;
  }, [needle, desk, onClose]);
  useEffect(() => setActive(0), [needle]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  function onKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(hits.length - 1, value + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); hits[active]?.run(); }
  }
  return <Dialog open={open} onClose={onClose} variant="palette" title="Caută în birou">
    <div className="dk-palette" onKeyDown={onKey}>
      <input autoFocus value={q} onChange={event => setQ(event.target.value)} placeholder="Caută oameni, sarcini sau secțiuni…" aria-label="Caută" role="combobox" aria-expanded="true" aria-controls="palette-list" />
      <ul id="palette-list" role="listbox">{hits.length === 0
        ? <li className="dk-muted">Niciun rezultat.</li>
        : hits.map((hit, index) => <li key={hit.key} role="option" aria-selected={index === active}><button type="button" tabIndex={-1} className={index === active ? 'is-active' : undefined} onMouseEnter={() => setActive(index)} onClick={hit.run}><b>{hit.label}</b><small>{hit.hint}</small></button></li>)}</ul>
    </div>
  </Dialog>;
}
