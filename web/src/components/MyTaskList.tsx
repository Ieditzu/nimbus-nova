import { Fragment, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowsClockwiseIcon, ArrowUpRightIcon, CaretDownIcon, ClipboardTextIcon, MagnifyingGlassIcon, MapPinIcon, CalendarBlankIcon, SquaresFourIcon, ListIcon } from '@phosphor-icons/react';
import { api } from '../api/instance';
import { formatBani } from '../api/client';
import type { Category, TaskPublic, TaskStatus } from '../api/types';
import { amountCaption, errorMessage, formatInterval } from '../lib/format';
import { categories, statuses } from '../lib/labels';
import { ErrorNotice, Loading } from './Feedback';
import { TaskDetail } from './TaskDetail';

export function useMyTasks() {
  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError('');
    try { const data = await api.listMyTasks(); if (current === requestId.current) setTasks(data.tasks); }
    catch (failure) { if (current === requestId.current) setError(errorMessage(failure)); }
    finally { if (current === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { ++requestId.current; }; }, [refresh]);
  return { tasks, loading, error, refresh };
}

interface Props {
  tasks: TaskPublic[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  filter: 'all' | TaskStatus;
  setFilter: Dispatch<SetStateAction<'all' | TaskStatus>>;
  expanded: string | null;
  setExpanded: Dispatch<SetStateAction<string | null>>;
  onCreate: () => void;
  onNotice: (message: string) => void;
}
export function MyTaskList({ tasks, loading, error, refresh, filter, setFilter, expanded, setExpanded, onCreate, onNotice }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro');
  const visible = tasks.filter(task => (filter === 'all' || task.status === filter) && (category === 'all' || task.category === category) && normalize(`${task.title} ${task.city} ${categories[task.category]}`).includes(normalize(query.trim())));
  const resetFilters = () => { setFilter('all'); setCategory('all'); setQuery(''); };
  return (<section className="tasks-section" aria-labelledby="tasks-title"><div className="tasks-toolbar"><h2 id="tasks-title">Toate sarcinile <span className="count">{error || loading ? '…' : tasks.length}</span></h2><button className="button button-small button-secondary" onClick={() => void refresh()} disabled={loading}><ArrowsClockwiseIcon size={17} aria-hidden="true" />Actualizează</button></div>
      <div className="filters" aria-label="Filtrează sarcinile">{(['all', 'open', 'assigned', 'completed'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'Toate' : value === 'open' ? 'Deschise' : value === 'assigned' ? 'Atribuite' : 'Finalizate'}</button>)}</div>
      <div className="task-discovery"><label className="task-search"><MagnifyingGlassIcon size={21} aria-hidden="true" /><span className="sr-only">Caută în sarcinile mele</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Caută după titlu sau oraș" /></label><div className="view-switch" role="group" aria-label="Afișarea sarcinilor"><button aria-label="Afișează carduri" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><SquaresFourIcon size={21} aria-hidden="true" /></button><button aria-label="Afișează lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><ListIcon size={21} aria-hidden="true" /></button></div></div>
      <div className="category-chips" role="group" aria-label="Categorie"><button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Orice categorie</button>{(Object.keys(categories) as Category[]).map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{categories[value]}</button>)}</div>
      {loading && tasks.length === 0 ? <Loading /> : error ? <ErrorNotice message={error} retry={() => void refresh()} /> : tasks.length === 0 ? <div className="empty-state"><span className="empty-icon"><ClipboardTextIcon size={35} aria-hidden="true" /></span><h3>Nu ai sarcini încă.</h3><p>Începe cu o sarcină scurtă. Oamenii cu timp liber o vor vedea în aplicația mobilă.</p><button className="text-button" onClick={onCreate}>Publică prima sarcină<ArrowUpRightIcon size={18} aria-hidden="true" /></button></div> : visible.length === 0 ? <div className="empty-state"><h3>Nicio sarcină pentru filtrele alese.</h3><button className="text-button" onClick={resetFilters}>Resetează filtrele</button></div> : view === 'cards' ? <div className="task-card-grid">{visible.map(task => <article className={`task-card ${expanded === task.id ? 'is-expanded' : ''}`} key={task.id}>
        <div className="task-card-top"><span className="task-category">{categories[task.category]}</span><span className={`badge badge-${task.status}`}>{statuses[task.status]}</span></div>
        <p className="task-card-date"><CalendarBlankIcon size={17} aria-hidden="true" />{formatInterval(task.starts_at, task.ends_at)}</p>
        <h3>{task.title}</h3>
        <p className="task-card-place"><MapPinIcon size={17} aria-hidden="true" />{task.city}</p>
        <div className="task-card-bottom"><strong className="money">{formatBani(task.amount_bani)}</strong><button className="expand-button" aria-expanded={expanded === task.id} aria-controls={expanded === task.id ? `details-${task.id}` : undefined} aria-label={`${expanded === task.id ? 'Închide' : 'Vezi'} detaliile: ${task.title}`} onClick={() => setExpanded(current => current === task.id ? null : task.id)}>Detalii<CaretDownIcon size={18} aria-hidden="true" /></button></div>
        {expanded === task.id && <TaskDetail task={task} onChanged={refresh} onNotice={onNotice} />}
      </article>)}</div> : <div className="task-table-wrapper"><table className="task-table"><thead><tr><th scope="col">Sarcină / categorie</th><th scope="col">Oraș și interval</th><th scope="col">Sumă propusă</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Detalii</span></th></tr></thead><tbody>{visible.map(task => <Fragment key={task.id}><tr className={expanded === task.id ? 'task-row is-expanded' : 'task-row'}><td><strong className="task-title">{task.title}</strong><span className="cell-secondary">{categories[task.category]}</span></td><td><span>{task.city}</span><span className="cell-secondary">{formatInterval(task.starts_at, task.ends_at)}</span></td><td><strong className="money">{formatBani(task.amount_bani)}</strong></td><td><span className={`badge badge-${task.status}`}>{statuses[task.status]}</span></td><td><button className="expand-button" aria-expanded={expanded === task.id} aria-controls={expanded === task.id ? `details-${task.id}` : undefined} aria-label={`${expanded === task.id ? 'Închide' : 'Vezi'} detaliile: ${task.title}`} onClick={() => setExpanded(current => current === task.id ? null : task.id)}><span>Detalii</span><CaretDownIcon size={18} aria-hidden="true" /></button></td></tr>{expanded === task.id && <tr className="detail-row"><td colSpan={5}><TaskDetail task={task} onChanged={refresh} onNotice={onNotice} /></td></tr>}</Fragment>)}</tbody></table></div>}
      <p className="amount-caption">{amountCaption}</p>
    </section>);
}
