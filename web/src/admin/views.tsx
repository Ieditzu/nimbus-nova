import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRightIcon, CheckCircleIcon, DownloadSimpleIcon, EyeIcon, EyeSlashIcon, PauseIcon, PlayIcon, PlusIcon, ProhibitIcon, SparkleIcon, TrashIcon,
} from '@phosphor-icons/react';
import { toRfc3339 } from '../api/client';
import type { TaskPublic } from '../api/types';
import { formatInterval } from '../lib/format';
import { categories } from '../lib/labels';
import { adminApi, type AdminApplication, type AdminDispute, type AdminEvent, type AdminLog, type AdminReview, type AdminUser, type IdentitySession, type LedgerEntry, type Partner } from './client';
import { StripePanel } from './stripe';
import { CreateTaskDialog, CreateUserDialog } from './create';
import { sectionMeta, type Desk } from './desk';
import { actionLabel, ago, bytes, day, downloadCsv, duration, fold, leiToBani, money, number, roleLabel, statusLabel, when } from './format';
import { Avatar, BarChart, Chips, DataTable, Dialog, Donut, Field, Meters, Pill, Search, Section, Spark, type Column } from './ui';

type P = { desk: Desk };

const pick = (map: Record<string, number> | undefined, key: string) => map?.[key] ?? 0;
const sum = (map: Record<string, number> | undefined) => Object.values(map ?? {}).reduce((a, b) => a + b, 0);
const label = (map: Record<string, string>, key: string) => map[key] ?? key;
const categoryName = (key: string) => (categories as Record<string, string>)[key] ?? key;

function Person({ name, sub, onClick }: { name: string; sub?: string; onClick?: () => void }) {
  const body = <><Avatar name={name} size="sm" /><span><b>{name}</b>{sub && <small>{sub}</small>}</span></>;
  return onClick
    ? <button type="button" className="dk-person is-button" onClick={onClick}>{body}</button>
    : <span className="dk-person">{body}</span>;
}

function Bar({ children }: { children: ReactNode }) {
  return <div className="dk-bar">{children}</div>;
}

function Kpi({ label: title, value, hint, tone = 'blue', values, onClick }: {
  label: string; value: string; hint?: string; tone?: 'blue' | 'mint' | 'yellow' | 'lavender' | 'pink' | 'orange'; values?: number[]; onClick?: () => void;
}) {
  const body = <>
    <span className="dk-kpi-label">{title}</span>
    <strong>{value}</strong>
    {hint && <small>{hint}</small>}
    {values && <Spark values={values} />}
  </>;
  return onClick
    ? <button type="button" className={`dk-kpi is-${tone} is-button`} onClick={onClick}>{body}</button>
    : <div className={`dk-kpi is-${tone}`}>{body}</div>;
}

/* ---------------------------------------------------------------- overview */

const metrics = [
  { id: 'tasks', label: 'Sarcini' }, { id: 'volume_bani', label: 'Volum' }, { id: 'applications', label: 'Candidaturi' },
  { id: 'signups', label: 'Înscrieri' }, { id: 'messages', label: 'Mesaje' },
] as const;
type Metric = (typeof metrics)[number]['id'];

export function Overview({ desk }: P) {
  const { data, days, setDays, go } = desk;
  const [metric, setMetric] = useState<Metric>('tasks');
  const s = data.stats;
  if (!s) return <p className="dk-muted" role="status">Se încarcă datele…</p>;
  const series = (key: Metric) => s.daily.map(point => point[key]);
  const fmt = metric === 'volume_bani' ? (value: number) => money(value, true) : number;
  const openDisputes = data.disputes.filter(item => item.status === 'open').length;
  const inReview = data.identity.filter(item => item.status === 'review').length;
  const prospects = data.partners.filter(item => item.status === 'prospect').length;
  const queue = [
    { label: 'Dispute deschise', n: openDisputes, to: 'disputes' as const, tone: 'bad' },
    { label: 'Verificări de identitate de revizuit', n: inReview, to: 'identity' as const, tone: 'warn' },
    { label: 'Parteneri în așteptare', n: prospects, to: 'partners' as const, tone: 'warn' },
    { label: 'Conturi suspendate', n: pick(s.users_by_status, 'suspended'), to: 'users' as const, tone: 'neutral' },
    { label: 'Sarcini ascunse', n: pick(s.tasks_by_status, 'hidden'), to: 'tasks' as const, tone: 'neutral' },
  ].filter(item => item.n > 0);
  const totalUsers = sum(s.users_by_role);
  const starRows = ['5', '4', '3', '2', '1'].map(star => ({ label: `${star} ★`, value: pick(s.reviews.stars, star) }));
  const money_ = s.money;
  return <div className="dk-stack">
    <div className="dk-kpis">
      <Kpi label="Oameni" value={number(totalUsers)} hint={`${number(s.daily.reduce((a, p) => a + p.signups, 0))} noi în ${days} zile`} tone="blue" values={series('signups')} onClick={() => go('users')} />
      <Kpi label="Sarcini deschise" value={number(pick(s.tasks_by_status, 'open'))} hint={`${number(sum(s.tasks_by_status))} în total`} tone="mint" values={series('tasks')} onClick={() => go('tasks')} />
      <Kpi label="Volum listat" value={money(money_.listed_bani, true)} hint="fără sarcinile ascunse" tone="yellow" values={series('volume_bani')} />
      <Kpi label="În escrow" value={money(money_.escrow_bani, true)} hint={`${money(money_.released_bani, true)} eliberați`} tone="lavender" onClick={() => go('ledger')} />
      <Kpi label="Venit Nova" value={money(money_.platform_bani, true)} hint={`${money(money_.worker_bani, true)} către lucrători`} tone="pink" />
      <Kpi label="Dispute deschise" value={number(openDisputes)} hint={openDisputes ? 'așteaptă o decizie' : 'nimic de rezolvat'} tone="orange" onClick={() => go('disputes')} />
    </div>

    <div className="dk-grid is-wide">
      <Section title="Activitate" action={<div className="dk-row-gap"><Chips label="Metrică" value={metric} onChange={setMetric} options={metrics.map(item => ({ id: item.id, label: item.label }))} /><Chips label="Perioadă" value={String(days) as '14' | '30'} onChange={value => setDays(value === '30' ? 30 : 14)} options={[{ id: '14', label: '14 zile' }, { id: '30', label: '30 zile' }]} /></div>}>
        <BarChart label={`Activitate: ${metrics.find(item => item.id === metric)?.label}`} format={fmt} points={s.daily.map(point => ({ label: day(point.date), value: point[metric] }))} />
      </Section>
      <Section title="Necesită atenție">
        {queue.length === 0
          ? <div className="dk-allgood"><CheckCircleIcon size={34} weight="fill" aria-hidden="true" /><p>Totul e la zi. Nicio decizie în așteptare.</p></div>
          : <ul className="dk-queue">{queue.map(item => <li key={item.label}><button type="button" onClick={() => go(item.to)}><Pill value={item.tone === 'bad' ? 'suspended' : item.tone === 'warn' ? 'open' : 'hidden'} label={String(item.n)} /><span>{item.label}</span><ArrowRightIcon size={16} aria-hidden="true" /></button></li>)}</ul>}
      </Section>
    </div>

    <div className="dk-grid is-thirds">
      <Section title="Sarcini după stare">
        <Donut label="Sarcini după stare" centre={<><strong>{sum(s.tasks_by_status)}</strong><small>sarcini</small></>} segments={Object.entries(s.tasks_by_status).map(([key, value]) => ({ label: label(statusLabel, key), value }))} />
      </Section>
      <Section title="Oameni după rol">
        <Donut label="Oameni după rol" centre={<><strong>{totalUsers}</strong><small>conturi</small></>} segments={Object.entries(s.users_by_role).map(([key, value]) => ({ label: label(roleLabel, key), value }))} />
      </Section>
      <Section title="Categorii">
        <Meters rows={Object.entries(s.tasks_by_category).map(([key, value]) => ({ label: categoryName(key), value }))} />
      </Section>
    </div>

    <div className="dk-grid is-thirds">
      <Section title="Orașe">
        <Meters rows={s.cities.map(item => ({ label: item.city, value: item.tasks, hint: money(item.volume_bani, true) }))} />
      </Section>
      <Section title="Reputație">
        <div className="dk-rating"><strong>{s.reviews.count ? s.reviews.average.toFixed(1) : '—'}</strong><span>{s.reviews.count} recenzii</span></div>
        <Meters rows={starRows} />
      </Section>
      <Section title="Activitate recentă" action={<button type="button" className="dk-link" onClick={() => go('logs')}>Tot jurnalul</button>}>
        {data.logs.length === 0 ? <p className="dk-muted">Nicio acțiune încă.</p> : <ul className="dk-feed">{data.logs.slice(0, 7).map(log => <li key={log.id}><b>{label(actionLabel, log.action)}</b><span>{desk.userName(log.actor_id)} · {ago(log.created_at)}</span></li>)}</ul>}
      </Section>
    </div>

    <div className="dk-grid is-thirds">
      <Section title="Mesagerie"><dl className="dk-facts"><div><dt>Conversații</dt><dd>{number(s.chat.conversations)}</dd></div><div><dt>Mesaje</dt><dd>{number(s.chat.messages)}</dd></div><div><dt>Sesiuni active</dt><dd>{number(s.active_sessions)}</dd></div></dl></Section>
      <Section title="Candidaturi"><Meters rows={Object.entries(s.applications_by_status).map(([key, value]) => ({ label: label(statusLabel, key), value }))} /></Section>
      <Section title="Comunitate"><dl className="dk-facts"><div><dt>Evenimente</dt><dd>{number(s.events)}</dd></div><div><dt>Înscrieri</dt><dd>{number(s.attendances)}</dd></div><div><dt>Returnat</dt><dd>{money(money_.refunded_bani, true)}</dd></div></dl></Section>
    </div>
  </div>;
}

/* ------------------------------------------------------------------- users */

export function Users({ desk }: P) {
  const { data, token, me } = desk;
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const needle = fold(q.trim());
  const roles = useMemo(() => [...new Set(data.users.map(user => user.role))], [data.users]);
  const rows = useMemo(() => data.users.filter(user => (role === 'all' || user.role === role) && (status === 'all' || user.status === status)
    && (!needle || fold(`${user.display_name} ${user.email} ${user.id}`).includes(needle))), [data.users, role, status, needle]);
  const ids = [...sel].filter(id => id !== me.id && data.users.some(user => user.id === id));

  function toggle(user: AdminUser) {
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    const apply = () => void desk.run(() => adminApi.setUserStatus(token, user.id, next), next === 'active' ? 'Cont reactivat.' : 'Cont suspendat.', () => adminApi.setUserStatus(token, user.id, user.status === 'suspended' ? 'suspended' : 'active'));
    if (next === 'active') apply();
    else desk.confirm({ title: `Suspendă ${user.display_name}?`, body: 'Sesiunile active se închid imediat și persoana nu se mai poate conecta până o reactivezi.', label: 'Suspendă', danger: true, onConfirm: apply });
  }
  function bulk(next: 'active' | 'suspended') {
    const apply = () => { setSel(new Set()); void desk.run(() => Promise.all(ids.map(id => adminApi.setUserStatus(token, id, next))), next === 'active' ? `${ids.length} conturi reactivate.` : `${ids.length} conturi suspendate.`, () => Promise.all(ids.map(id => adminApi.setUserStatus(token, id, next === 'active' ? 'suspended' : 'active')))); };
    if (next === 'active') apply();
    else desk.confirm({ title: `Suspendă ${ids.length} conturi?`, body: 'Toate sesiunile lor active se închid.', label: 'Suspendă toate', danger: true, onConfirm: apply });
  }
  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Persoană', sort: user => user.display_name, cell: user => <Person name={user.display_name} sub={user.email || user.id} /> },
    { key: 'role', header: 'Rol', sort: user => user.role, cell: user => label(roleLabel, user.role) },
    { key: 'status', header: 'Stare', sort: user => user.status, cell: user => <Pill value={user.status} /> },
    { key: 'minor', header: 'Tip', hideSm: true, cell: user => user.volunteer_only ? <Pill value="paused" label="Minor" /> : <span className="dk-muted">Adult</span> },
    { key: 'act', header: '', cell: user => user.id === me.id ? <span className="dk-muted">Tu</span> : <button type="button" className={`dk-btn is-small ${user.status === 'suspended' ? 'is-ghost' : 'is-danger-ghost'}`} onClick={() => toggle(user)}>{user.status === 'suspended' ? <><PlayIcon size={14} aria-hidden="true" />Reactivează</> : <><ProhibitIcon size={14} aria-hidden="true" />Suspendă</>}</button> },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută nume, email sau ID" />
      <Chips label="Rol" value={role} onChange={setRole} options={[{ id: 'all', label: 'Toți', count: data.users.length }, ...roles.map(item => ({ id: item, label: label(roleLabel, item), count: data.users.filter(user => user.role === item).length }))]} />
      <Chips label="Stare" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Orice stare' }, { id: 'active', label: 'Active' }, { id: 'suspended', label: 'Suspendate' }]} />
      <button type="button" className="dk-btn is-ghost is-small" onClick={() => downloadCsv('oameni', ['ID', 'Nume', 'Email', 'Rol', 'Stare'], rows.map(user => [user.id, user.display_name, user.email, user.role, user.status]))}><DownloadSimpleIcon size={15} aria-hidden="true" />CSV</button>
      <button type="button" className="dk-btn is-small" onClick={() => setAdding(true)}><PlusIcon size={14} aria-hidden="true" />Cont nou</button>
    </Bar>
    {ids.length > 0 && <div className="dk-bulk" role="region" aria-label="Acțiuni în masă"><b>{ids.length} selectate</b><button type="button" className="dk-btn is-small is-danger" onClick={() => bulk('suspended')}>Suspendă</button><button type="button" className="dk-btn is-small is-ghost" onClick={() => bulk('active')}>Reactivează</button><button type="button" className="dk-link" onClick={() => setSel(new Set())}>Golește</button></div>}
    <DataTable label="Oameni" rows={rows} columns={columns} rowKey={user => user.id} onOpen={user => desk.openUser(user.id)} selected={sel} onSelect={setSel} />
    <CreateUserDialog desk={desk} open={adding} onClose={() => setAdding(false)} />
  </div>;
}

/* ------------------------------------------------------------------- tasks */

export function Tasks({ desk }: P) {
  const { data, token } = desk;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const needle = fold(q.trim());
  const rows = useMemo(() => data.tasks.filter(task => (status === 'all' || task.status === status) && (category === 'all' || task.category === category)
    && (!needle || fold(`${task.title} ${task.city} ${task.poster_name} ${task.id}`).includes(needle))), [data.tasks, status, category, needle]);
  const ids = [...sel].filter(id => data.tasks.some(task => task.id === id));
  const count = (value: string) => data.tasks.filter(task => task.status === value).length;

  function toggle(task: TaskPublic) {
    const hide = task.status !== 'hidden';
    void desk.run(() => hide ? adminApi.hideTask(token, task.id) : adminApi.unhideTask(token, task.id), hide ? 'Sarcina a fost ascunsă.' : 'Sarcina este din nou publică.', () => hide ? adminApi.unhideTask(token, task.id) : adminApi.hideTask(token, task.id));
  }
  function bulk(hide: boolean) {
    const targets = ids.filter(id => data.tasks.find(task => task.id === id)?.status !== (hide ? 'hidden' : 'open'));
    if (targets.length === 0) return;
    const apply = () => { setSel(new Set()); void desk.run(() => Promise.all(targets.map(id => hide ? adminApi.hideTask(token, id) : adminApi.unhideTask(token, id))), hide ? `${targets.length} sarcini ascunse.` : `${targets.length} sarcini republicate.`, () => Promise.all(targets.map(id => hide ? adminApi.unhideTask(token, id) : adminApi.hideTask(token, id)))); };
    if (!hide) apply();
    else desk.confirm({ title: `Ascunde ${targets.length} sarcini?`, body: 'Dispar din feed și din aplicație. Le poți republica oricând.', label: 'Ascunde', danger: true, onConfirm: apply });
  }
  const columns: Column<TaskPublic>[] = [
    { key: 'title', header: 'Sarcină', sort: task => task.title, cell: task => <span className="dk-cell-main"><b>{task.title}</b><small>{categoryName(task.category)}</small></span> },
    { key: 'poster', header: 'Poster', sort: task => task.poster_name, hideSm: true, cell: task => <button type="button" className="dk-link" onClick={() => desk.openUser(task.poster_id)}>{task.poster_name}</button> },
    { key: 'city', header: 'Oraș', sort: task => task.city, hideSm: true, cell: task => task.city },
    { key: 'when', header: 'Program', sort: task => task.starts_at, hideSm: true, cell: task => <small>{formatInterval(task.starts_at, task.ends_at)}</small> },
    { key: 'amount', header: 'Sumă', numeric: true, sort: task => task.amount_bani, cell: task => money(task.amount_bani) },
    { key: 'status', header: 'Stare', sort: task => task.status, cell: task => <Pill value={task.status} /> },
    { key: 'act', header: '', cell: task => <button type="button" className="dk-btn is-small is-ghost" onClick={() => toggle(task)}>{task.status === 'hidden' ? <><EyeIcon size={14} aria-hidden="true" />Arată</> : <><EyeSlashIcon size={14} aria-hidden="true" />Ascunde</>}</button> },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută titlu, oraș sau poster" />
      <Chips label="Stare" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Toate', count: data.tasks.length }, { id: 'open', label: 'Deschise', count: count('open') }, { id: 'assigned', label: 'Atribuite', count: count('assigned') }, { id: 'completed', label: 'Finalizate', count: count('completed') }, { id: 'hidden', label: 'Ascunse', count: count('hidden') }]} />
      <label className="dk-select"><span className="sr-only">Categorie</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Orice categorie</option>{Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <button type="button" className="dk-btn is-ghost is-small" onClick={() => downloadCsv('sarcini', ['ID', 'Titlu', 'Categorie', 'Poster', 'Oraș', 'Început', 'Sumă (RON)', 'Stare'], rows.map(task => [task.id, task.title, task.category, task.poster_name, task.city, task.starts_at, task.amount_bani / 100, task.status]))}><DownloadSimpleIcon size={15} aria-hidden="true" />CSV</button>
      <button type="button" className="dk-btn is-small" onClick={() => setAdding(true)}><PlusIcon size={14} aria-hidden="true" />Sarcină nouă</button>
    </Bar>
    {ids.length > 0 && <div className="dk-bulk" role="region" aria-label="Acțiuni în masă"><b>{ids.length} selectate</b><button type="button" className="dk-btn is-small is-danger" onClick={() => bulk(true)}>Ascunde</button><button type="button" className="dk-btn is-small is-ghost" onClick={() => bulk(false)}>Republică</button><button type="button" className="dk-link" onClick={() => setSel(new Set())}>Golește</button></div>}
    <DataTable label="Sarcini" rows={rows} columns={columns} rowKey={task => task.id} onOpen={task => desk.openTask(task.id)} selected={sel} onSelect={setSel} />
    <CreateTaskDialog desk={desk} open={adding} onClose={() => setAdding(false)} />
  </div>;
}

/* ------------------------------------------------------------ applications */

export function Applications({ desk }: P) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const needle = fold(q.trim());
  const all = desk.data.applications;
  const rows = useMemo(() => all.filter(item => (status === 'all' || item.status === status) && (!needle || fold(`${item.worker_name} ${item.task_title} ${item.message}`).includes(needle))), [all, status, needle]);
  const columns: Column<AdminApplication>[] = [
    { key: 'worker', header: 'Candidat', sort: item => item.worker_name, cell: item => <Person name={item.worker_name} onClick={() => desk.openUser(item.worker_id)} /> },
    { key: 'task', header: 'Sarcină', sort: item => item.task_title, cell: item => <button type="button" className="dk-link" onClick={() => desk.openTask(item.task_id)}>{item.task_title}</button> },
    { key: 'msg', header: 'Mesaj', hideSm: true, cell: item => <span className="dk-clip" title={item.message}>{item.message}</span> },
    { key: 'status', header: 'Stare', sort: item => item.status, cell: item => <Pill value={item.status} /> },
    { key: 'when', header: 'Când', sort: item => item.created_at, numeric: true, cell: item => <span title={when(item.created_at)}>{ago(item.created_at)}</span> },
    { key: 'act', header: '', cell: item => item.status === 'pending' ? <button type="button" className="dk-btn is-small" onClick={() => void desk.run(() => adminApi.acceptApplication(desk.token, item.id), 'Candidatura a fost acceptată.')}>Acceptă</button> : null },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută candidat, sarcină sau mesaj" />
      <Chips label="Stare" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Toate', count: all.length }, ...(['pending', 'accepted', 'rejected'] as const).map(value => ({ id: value as string, label: label(statusLabel, value), count: all.filter(item => item.status === value).length }))]} />
    </Bar>
    <DataTable label="Candidaturi" rows={rows} columns={columns} rowKey={item => item.id} />
  </div>;
}

/* ----------------------------------------------------------------- reviews */

export function Reviews({ desk }: P) {
  const [q, setQ] = useState('');
  const [stars, setStars] = useState('all');
  const needle = fold(q.trim());
  const all = desk.data.reviews;
  const rows = useMemo(() => all.filter(item => (stars === 'all' || (stars === 'low' ? item.stars <= 3 : item.stars === Number(stars)))
    && (!needle || fold(`${item.text} ${item.author_name} ${item.subject_name} ${item.task_title}`).includes(needle))), [all, stars, needle]);
  function remove(item: AdminReview) {
    desk.confirm({ title: 'Ștergi recenzia?', body: <>Recenzia lui <b>{item.author_name}</b> despre <b>{item.subject_name}</b> dispare definitiv și reputația se recalculează. Acțiunea rămâne în jurnal.</>, label: 'Șterge recenzia', danger: true, onConfirm: () => void desk.run(() => adminApi.removeReview(desk.token, item.id), 'Recenzia a fost ștearsă.') });
  }
  const columns: Column<AdminReview>[] = [
    { key: 'stars', header: 'Notă', sort: item => item.stars, cell: item => <span className="dk-stars" aria-label={`${item.stars} din 5`}>{'★'.repeat(item.stars)}<i>{'★'.repeat(5 - item.stars)}</i></span> },
    { key: 'text', header: 'Recenzie', cell: item => <span className="dk-clip is-wide" title={item.text}>{item.text}</span> },
    { key: 'who', header: 'De la → către', sort: item => item.author_name, hideSm: true, cell: item => <span className="dk-cell-main"><button type="button" className="dk-link" onClick={() => desk.openUser(item.author_id)}>{item.author_name}</button><small>→ {item.subject_name}</small></span> },
    { key: 'task', header: 'Sarcină', hideSm: true, cell: item => <button type="button" className="dk-link" onClick={() => desk.openTask(item.task_id)}>{item.task_title || item.task_id}</button> },
    { key: 'when', header: 'Când', sort: item => item.created_at, numeric: true, cell: item => ago(item.created_at) },
    { key: 'act', header: '', cell: item => <button type="button" className="dk-btn is-small is-danger-ghost" onClick={() => remove(item)}><TrashIcon size={14} aria-hidden="true" />Șterge</button> },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută text, autor sau sarcină" />
      <Chips label="Notă" value={stars} onChange={setStars} options={[{ id: 'all', label: 'Toate', count: all.length }, { id: '5', label: '5 ★' }, { id: '4', label: '4 ★' }, { id: 'low', label: '≤ 3 ★', count: all.filter(item => item.stars <= 3).length }]} />
    </Bar>
    <DataTable label="Recenzii" rows={rows} columns={columns} rowKey={item => item.id} />
  </div>;
}

/* ---------------------------------------------------------------- disputes */

export function Disputes({ desk }: P) {
  const { data, token } = desk;
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [splitFor, setSplitFor] = useState<AdminDispute | null>(null);
  const [workerRon, setWorkerRon] = useState('');
  const [posterRon, setPosterRon] = useState('');
  const [splitError, setSplitError] = useState('');
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const tasks = useMemo(() => new Map(data.tasks.map(task => [task.id, task])), [data.tasks]);
  const rows = data.disputes.filter(item => filter === 'all' || item.status === filter);

  function settle(item: AdminDispute, result: 'release' | 'refund') {
    const task = tasks.get(item.task_id);
    desk.confirm({
      title: result === 'release' ? 'Eliberezi plata lucrătorului?' : 'Returnezi plata posterului?',
      body: <>{task ? <>Sarcina <b>{task.title}</b> ({money(task.amount_bani)}). </> : null}Decizia închide disputa și nu se poate anula.</>,
      label: result === 'release' ? 'Eliberează plata' : 'Returnează plata', danger: result === 'refund',
      onConfirm: () => void desk.run(() => adminApi.resolveDispute(token, item.id, result), result === 'release' ? 'Plata a fost eliberată.' : 'Plata a fost returnată.'),
    });
  }
  function openSplit(item: AdminDispute) {
    const amount = tasks.get(item.task_id)?.amount_bani ?? 0;
    setSplitFor(item); setSplitError('');
    setWorkerRon(amount ? String(amount / 200) : ''); setPosterRon(amount ? String(amount / 200) : '');
  }
  async function submitSplit(event: FormEvent) {
    event.preventDefault();
    if (!splitFor) return;
    const worker = leiToBani(workerRon || '0'), poster = leiToBani(posterRon || '0');
    if (Number.isNaN(worker) || Number.isNaN(poster) || worker + poster <= 0) { setSplitError('Introdu sume valide, cu un total mai mare ca zero.'); return; }
    const ok = await desk.run(() => adminApi.resolveDispute(token, splitFor.id, 'split', worker, poster), 'Disputa a fost împărțită.');
    if (ok) setSplitFor(null);
  }
  const openCount = data.disputes.filter(item => item.status === 'open').length;
  return <div className="dk-stack">
    <Bar><Chips label="Stare" value={filter} onChange={setFilter} options={[{ id: 'open', label: 'Deschise', count: openCount }, { id: 'resolved', label: 'Rezolvate', count: data.disputes.length - openCount }, { id: 'all', label: 'Toate', count: data.disputes.length }]} /></Bar>
    {rows.length === 0
      ? <div className="dk-empty"><span aria-hidden="true">✓</span><p>{filter === 'open' ? 'Nicio dispută deschisă.' : 'Nimic de arătat aici.'}</p></div>
      : <ul className="dk-cards">{rows.map(item => {
        const task = tasks.get(item.task_id);
        return <li key={item.id} className="dk-case">
          <header><Pill value={item.status} /><span className="dk-muted" title={when(item.created_at)}>{ago(item.created_at)}</span></header>
          <blockquote>{item.reason}</blockquote>
          {briefs[item.id] && <p>{briefs[item.id]}</p>}
          <dl className="dk-facts is-inline">
            <div><dt>Deschisă de</dt><dd><button type="button" className="dk-link" onClick={() => desk.openUser(item.opener_id)}>{desk.userName(item.opener_id)}</button></dd></div>
            <div><dt>Sarcină</dt><dd><button type="button" className="dk-link" onClick={() => desk.openTask(item.task_id)}>{task?.title ?? item.task_id}</button></dd></div>
            {task && <div><dt>Sumă</dt><dd>{money(task.amount_bani)}</dd></div>}
          </dl>
          {item.status === 'open' && <footer>
            <button type="button" className="dk-btn is-small is-ghost" onClick={() => void desk.run(async () => {
              const brief = await adminApi.disputeBrief(token, item.id);
              if (brief.summary) setBriefs(current => ({ ...current, [item.id]: brief.summary }));
              if (brief.worker_bani + brief.poster_bani > 0) { setSplitFor(item); setWorkerRon(String(brief.worker_bani / 100)); setPosterRon(String(brief.poster_bani / 100)); }
            }, 'Rezumatul este gata. Împărțirea sugerată nu se salvează singură.')}><SparkleIcon size={14} weight="fill" aria-hidden="true" />Rezumat</button>
            <button type="button" className="dk-btn is-small" onClick={() => settle(item, 'release')}>Eliberează lucrătorului</button>
            <button type="button" className="dk-btn is-small is-ghost" onClick={() => openSplit(item)}>Împarte</button>
            <button type="button" className="dk-btn is-small is-danger-ghost" onClick={() => settle(item, 'refund')}>Returnează posterului</button>
          </footer>}
        </li>;
      })}</ul>}
    <Dialog open={!!splitFor} onClose={() => setSplitFor(null)} title="Împarte suma" footer={<><button type="button" className="dk-btn is-ghost" onClick={() => setSplitFor(null)}>Renunță</button><button type="submit" form="split-form" className="dk-btn">Închide disputa</button></>}>
      <form id="split-form" className="dk-form" onSubmit={event => void submitSplit(event)}>
        <p className="dk-muted">Stabilește cât primește fiecare parte. Disputa se închide după salvare.</p>
        <Field label="Lucrător (RON)"><input inputMode="decimal" value={workerRon} onChange={event => setWorkerRon(event.target.value)} /></Field>
        <Field label="Poster (RON)"><input inputMode="decimal" value={posterRon} onChange={event => setPosterRon(event.target.value)} /></Field>
        {splitError && <p className="dk-alert" role="alert">{splitError}</p>}
      </form>
    </Dialog>
  </div>;
}

/* ---------------------------------------------------------------- identity */

const checkOrder = ['files', 'document', 'cnp', 'selfie', 'face_match', 'pdf'] as const;
const checkLabel: Record<string, string> = { files: 'Fișiere', document: 'Document', cnp: 'CNP', selfie: 'Selfie', face_match: 'Față', pdf: 'PDF' };

export function Identity({ desk }: P) {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const needle = fold(q.trim());
  const all = desk.data.identity;
  const rows = useMemo(() => all.filter(item => (status === 'all' || item.status === status) && (!needle || fold(`${item.email} ${item.id}`).includes(needle))), [all, status, needle]);
  const statuses = [...new Set(all.map(item => item.status))];
  const columns: Column<IdentitySession>[] = [
    { key: 'email', header: 'Email', sort: item => item.email, cell: item => <span className="dk-cell-main"><b>{item.email}</b><small>{item.id}</small></span> },
    { key: 'kind', header: 'Document', sort: item => item.kind, cell: item => item.kind.toUpperCase() },
    { key: 'status', header: 'Stare', sort: item => item.status, cell: item => <Pill value={item.status} /> },
    { key: 'checks', header: 'Verificări', hideSm: true, cell: item => <span className="dk-checks">{checkOrder.filter(key => item.checks?.[key]).map(key => <span key={key} title={`${checkLabel[key]}: ${item.checks[key]}`} className={`dk-check-dot is-${item.checks[key] === 'passed' ? 'good' : item.checks[key] === 'failed' ? 'bad' : 'warn'}`}>{checkLabel[key]}</span>)}{Object.keys(item.checks ?? {}).length === 0 && <span className="dk-muted">—</span>}</span> },
    { key: 'when', header: 'Început', sort: item => item.created_at, numeric: true, cell: item => <span title={when(item.created_at)}>{ago(item.created_at)}</span> },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută email sau ID" />
      <Chips label="Stare" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Toate', count: all.length }, ...statuses.map(value => ({ id: value, label: label(statusLabel, value), count: all.filter(item => item.status === value).length }))]} />
    </Bar>
    <p className="dk-note">Documentele și selfie-urile nu se păstrează după verificare; aici apar doar rezultatele fiecărei etape.</p>
    <DataTable label="Verificări de identitate" rows={rows} columns={columns} rowKey={item => item.id} />
  </div>;
}

/* ------------------------------------------------------------------ ledger */

export function Ledger({ desk }: P) {
  const { entries, tasks } = desk.data;
  const [account, setAccount] = useState('all');
  const [q, setQ] = useState('');
  const needle = fold(q.trim());
  const titles = useMemo(() => new Map(tasks.map(task => [task.id, task.title])), [tasks]);
  const net = (name: string) => entries.filter(entry => entry.account === name).reduce((acc, entry) => acc + (entry.direction === 'credit' ? entry.amount_bani : -entry.amount_bani), 0);
  const rows = useMemo(() => entries.filter(entry => (account === 'all' || entry.account === account) && (!needle || fold(`${entry.task_id} ${titles.get(entry.task_id) ?? ''}`).includes(needle))).slice().reverse(), [entries, account, needle, titles]);
  const accounts = [...new Set(entries.map(entry => entry.account))];
  const columns: Column<LedgerEntry>[] = [
    { key: 'when', header: 'Când', sort: entry => entry.created_at, cell: entry => when(entry.created_at) },
    { key: 'account', header: 'Cont', sort: entry => entry.account, cell: entry => <span className="dk-cap">{entry.account}</span> },
    { key: 'dir', header: 'Sens', sort: entry => entry.direction, cell: entry => <Pill value={entry.direction} /> },
    { key: 'amount', header: 'Sumă', numeric: true, sort: entry => entry.amount_bani, cell: entry => <b className={entry.direction === 'credit' ? 'dk-pos' : 'dk-neg'}>{entry.direction === 'credit' ? '+' : '−'}{money(entry.amount_bani)}</b> },
    { key: 'task', header: 'Sarcină', cell: entry => <button type="button" className="dk-link" onClick={() => desk.openTask(entry.task_id)}>{titles.get(entry.task_id) ?? entry.task_id}</button> },
  ];
  return <div className="dk-stack">
    <div className="dk-kpis is-four">
      <Kpi label="Acum în escrow" value={money(net('escrow'), true)} tone="lavender" />
      <Kpi label="Plătit lucrătorilor" value={money(net('worker'), true)} tone="mint" />
      <Kpi label="Venit platformă" value={money(net('platform'), true)} tone="yellow" />
      <Kpi label="Debitat de la postere" value={money(-net('poster'), true)} tone="blue" />
    </div>
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută sarcină" />
      <Chips label="Cont" value={account} onChange={setAccount} options={[{ id: 'all', label: 'Toate', count: entries.length }, ...accounts.map(name => ({ id: name, label: name, count: entries.filter(entry => entry.account === name).length }))]} />
      <button type="button" className="dk-btn is-ghost is-small" onClick={() => downloadCsv('registru', ['ID', 'Când', 'Cont', 'Sens', 'Sumă (RON)', 'Sarcină'], rows.map(entry => [entry.id, entry.created_at, entry.account, entry.direction, entry.amount_bani / 100, entry.task_id]))}><DownloadSimpleIcon size={15} aria-hidden="true" />CSV</button>
    </Bar>
    <DataTable label="Registru" rows={rows} columns={columns} rowKey={entry => entry.id} pageSize={25} />
  </div>;
}

/* ---------------------------------------------------------------- partners */

export function Partners({ desk }: P) {
  const { data, token } = desk;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  async function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) { setError('Numele trebuie să aibă cel puțin 2 caractere.'); return; }
    const ok = await desk.run(() => adminApi.createPartner(token, name.trim()), 'Partener adăugat.');
    if (ok) { setAdding(false); setName(''); setError(''); }
  }
  const columns: Column<Partner>[] = [
    { key: 'name', header: 'Partener', sort: item => item.name, cell: item => <Person name={item.name} sub={item.id} /> },
    { key: 'status', header: 'Stare', sort: item => item.status, cell: item => <Pill value={item.status} /> },
    { key: 'act', header: '', cell: item => <span className="dk-row-gap">
      {item.status !== 'active' && <button type="button" className="dk-btn is-small" onClick={() => void desk.run(() => adminApi.activatePartner(token, item.id), 'Partener activat.', () => adminApi.pausePartner(token, item.id))}><PlayIcon size={14} aria-hidden="true" />Activează</button>}
      {item.status === 'active' && <button type="button" className="dk-btn is-small is-ghost" onClick={() => void desk.run(() => adminApi.pausePartner(token, item.id), 'Partener pus în pauză.', () => adminApi.activatePartner(token, item.id))}><PauseIcon size={14} aria-hidden="true" />Pauză</button>}
    </span> },
  ];
  return <div className="dk-stack">
    <Bar><button type="button" className="dk-btn is-small" onClick={() => setAdding(true)}><PlusIcon size={14} aria-hidden="true" />Adaugă partener</button></Bar>
    <DataTable label="Parteneri" rows={data.partners} columns={columns} rowKey={item => item.id} empty="Niciun partener încă. Adaugă primul." />
    <Dialog open={adding} onClose={() => setAdding(false)} title="Partener nou" footer={<><button type="button" className="dk-btn is-ghost" onClick={() => setAdding(false)}>Renunță</button><button type="submit" form="partner-form" className="dk-btn">Adaugă</button></>}>
      <form id="partner-form" className="dk-form" onSubmit={event => void create(event)}>
        <Field label="Nume" hint="Apare ca prospect până îl activezi."><input value={name} onChange={event => setName(event.target.value)} maxLength={80} autoFocus /></Field>
        {error && <p className="dk-alert" role="alert">{error}</p>}
      </form>
    </Dialog>
  </div>;
}

/* ------------------------------------------------------------------ events */

const blankEvent = { title: '', city: 'București', starts_at: '', ends_at: '', slots: '10', min_age: '14', description: '' };

export function Events({ desk }: P) {
  const { data, token } = desk;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankEvent);
  const [error, setError] = useState('');
  const set = (key: keyof typeof blankEvent) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  async function create(event: FormEvent) {
    event.preventDefault();
    const slots = Number(form.slots), minAge = Number(form.min_age);
    if (form.title.trim().length < 3) return setError('Titlul trebuie să aibă cel puțin 3 caractere.');
    if (form.city.trim().length < 2) return setError('Orașul trebuie să aibă cel puțin 2 caractere.');
    if (!form.starts_at || !form.ends_at || Date.parse(toRfc3339(form.ends_at)) <= Date.parse(toRfc3339(form.starts_at))) return setError('Ora de final trebuie să fie după cea de început.');
    if (!Number.isInteger(slots) || slots < 1) return setError('Locurile trebuie să fie cel puțin 1.');
    if (!Number.isInteger(minAge) || minAge < 0) return setError('Vârsta minimă nu este validă.');
    const ok = await desk.run(() => adminApi.createEvent(token, { title: form.title.trim(), city: form.city.trim(), starts_at: toRfc3339(form.starts_at), ends_at: toRfc3339(form.ends_at), slots, min_age: minAge, description: form.description.trim() }), 'Eveniment creat.');
    if (ok) { setOpen(false); setForm(blankEvent); setError(''); }
  }
  function remove(item: AdminEvent) {
    desk.confirm({ title: `Ștergi „${item.title}”?`, body: `${item.attendees} înscrieri se șterg odată cu evenimentul. Nu se poate anula.`, label: 'Șterge evenimentul', danger: true, onConfirm: () => void desk.run(() => adminApi.deleteEvent(token, item.id), 'Eveniment șters.') });
  }
  return <div className="dk-stack">
    <Bar><button type="button" className="dk-btn is-small" onClick={() => setOpen(true)}><PlusIcon size={14} aria-hidden="true" />Eveniment nou</button></Bar>
    {data.events.length === 0 ? <div className="dk-empty"><span aria-hidden="true">∅</span><p>Niciun eveniment încă.</p></div> : <ul className="dk-cards">{data.events.map(item => {
      const fill = item.slots ? Math.min(1, item.attendees / item.slots) : 0;
      return <li key={item.id} className="dk-case">
        <header><b>{item.title}</b><Pill value={Date.parse(item.ends_at) < Date.now() ? 'completed' : 'open'} label={Date.parse(item.ends_at) < Date.now() ? 'Încheiat' : 'Programat'} /></header>
        <p className="dk-muted">{item.city} · {formatInterval(item.starts_at, item.ends_at)} · de la {item.min_age} ani</p>
        {item.description && <p>{item.description}</p>}
        <div className="dk-fill" aria-label={`${item.attendees} din ${item.slots} locuri`}><span style={{ '--w': fill } as React.CSSProperties} /></div>
        <dl className="dk-facts is-inline"><div><dt>Înscriși</dt><dd>{item.attendees}/{item.slots}</dd></div><div><dt>Prezenți</dt><dd>{item.checked_in}</dd></div><div><dt>Diplome</dt><dd>{item.completed}</dd></div></dl>
        <footer><button type="button" className="dk-btn is-small is-danger-ghost" onClick={() => remove(item)}><TrashIcon size={14} aria-hidden="true" />Șterge</button></footer>
      </li>;
    })}</ul>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Eveniment nou" footer={<><button type="button" className="dk-btn is-ghost" onClick={() => setOpen(false)}>Renunță</button><button type="submit" form="event-form" className="dk-btn">Creează</button></>}>
      <form id="event-form" className="dk-form" onSubmit={event => void create(event)}>
        <Field label="Titlu"><input value={form.title} onChange={set('title')} maxLength={80} autoFocus /></Field>
        <Field label="Oraș"><input value={form.city} onChange={set('city')} maxLength={80} /></Field>
        <div className="dk-form-row"><Field label="Începe"><input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} /></Field><Field label="Se termină"><input type="datetime-local" value={form.ends_at} onChange={set('ends_at')} /></Field></div>
        <div className="dk-form-row"><Field label="Locuri"><input type="number" min={1} value={form.slots} onChange={set('slots')} /></Field><Field label="Vârsta minimă"><input type="number" min={0} value={form.min_age} onChange={set('min_age')} /></Field></div>
        <Field label="Descriere" hint="Voluntariatul nu se plătește."><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
        {error && <p className="dk-alert" role="alert">{error}</p>}
      </form>
    </Dialog>
  </div>;
}

/* -------------------------------------------------------------------- logs */

export function Logs({ desk }: P) {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const needle = fold(q.trim());
  const all = desk.data.logs;
  const actions = [...new Set(all.map(log => log.action))];
  const rows = useMemo(() => all.filter(log => (action === 'all' || log.action === action) && (!needle || fold(`${log.action} ${log.target} ${log.detail} ${desk.userName(log.actor_id)}`).includes(needle))), [all, action, needle, desk]);
  function openTarget(target: string) {
    if (target.startsWith('task_')) desk.openTask(target);
    else if (desk.data.users.some(user => user.id === target)) desk.openUser(target);
  }
  const columns: Column<AdminLog>[] = [
    { key: 'when', header: 'Când', sort: log => log.created_at, cell: log => <span title={when(log.created_at)}>{when(log.created_at)}</span> },
    { key: 'actor', header: 'Autor', cell: log => desk.userName(log.actor_id) },
    { key: 'action', header: 'Acțiune', sort: log => log.action, cell: log => <b>{label(actionLabel, log.action)}</b> },
    { key: 'target', header: 'Țintă', cell: log => <button type="button" className="dk-link" onClick={() => openTarget(log.target)}>{log.target}</button> },
    { key: 'detail', header: 'Detaliu', hideSm: true, cell: log => <span className="dk-clip" title={log.detail}>{log.detail || '—'}</span> },
  ];
  return <div className="dk-stack">
    <Bar>
      <Search value={q} onChange={setQ} placeholder="Caută acțiune, țintă sau detaliu" />
      <label className="dk-select"><span className="sr-only">Acțiune</span><select value={action} onChange={event => setAction(event.target.value)}><option value="all">Orice acțiune</option>{actions.map(item => <option key={item} value={item}>{label(actionLabel, item)}</option>)}</select></label>
      <button type="button" className="dk-btn is-ghost is-small" onClick={() => downloadCsv('jurnal', ['Când', 'Autor', 'Acțiune', 'Țintă', 'Detaliu'], rows.map(log => [log.created_at, desk.userName(log.actor_id), log.action, log.target, log.detail]))}><DownloadSimpleIcon size={15} aria-hidden="true" />CSV</button>
    </Bar>
    <DataTable label="Jurnal" rows={rows} columns={columns} rowKey={log => log.id} pageSize={25} />
  </div>;
}

/* ------------------------------------------------------------------ system */

export function System({ desk }: P) {
  const info = desk.data.system;
  if (!info) return <p className="dk-muted" role="status">Se încarcă datele…</p>;
  const tables = Object.entries(info.tables).sort((a, b) => b[1] - a[1]);
  return <div className="dk-stack">
    <div className="dk-kpis is-four">
      <Kpi label="Funcționează de" value={duration(info.uptime_seconds)} hint={`din ${when(info.started_at)}`} tone="mint" />
      <Kpi label="Baza de date" value={bytes(info.db_bytes)} hint="SQLite" tone="blue" />
      <Kpi label="Memorie" value={bytes(info.memory_bytes)} hint={`${info.goroutines} goroutines`} tone="yellow" />
      <Kpi label="Rulează" value={info.go_version} hint={`ora serverului ${when(info.server_time)}`} tone="lavender" />
    </div>
    <div className="dk-grid is-thirds">
      <Section title="Configurație">
        <dl className="dk-facts">
          <div><dt>Mod demo</dt><dd><Pill value={info.demo_mode ? 'open' : 'active'} label={info.demo_mode ? 'Pornit' : 'Oprit'} /></dd></div>
          <div><dt>Verificare identitate (ID Analyzer)</dt><dd><Pill value={info.identity_provider ? 'active' : 'suspended'} label={info.identity_provider ? 'Configurat' : 'Lipsește'} /></dd></div>
          <div><dt>Plăți</dt><dd>Simulate până se salvează o cheie Stripe</dd></div>
        </dl>
      </Section>
      <Section title="Rânduri pe tabel" className="span-2"><Meters rows={tables.map(([name, value]) => ({ label: name, value }))} format={number} /></Section>
    </div>
    <Section title="Stripe"><StripePanel desk={desk} /></Section>
  </div>;
}

export { sectionMeta };
export type { AdminLog };
