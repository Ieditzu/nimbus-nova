import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowUpRightIcon, CheckCircleIcon, CircleIcon, SquaresFourIcon, PlusIcon } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import type { TaskStatus } from '../api/types';
import { TaskForm } from '../components/TaskForm';
import { MyTaskList, useMyTasks } from '../components/MyTaskList';

export default function PosterPage() {
  const [searchParams] = useSearchParams();
  const { tasks, loading, error, refresh } = useMyTasks();
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1');
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => { if (showForm) { composer.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); composer.current?.querySelector('input')?.focus({ preventScroll: true }); } }, [showForm]);
  return <main className="dashboard page-width" id="main-content">
    <aside className="workspace-sidebar" aria-label="Spațiul de lucru"><div className="workspace-identity"><span className="avatar">A</span><div><strong>Andrei</strong><span>Cont demonstrativ</span></div></div><p className="eyebrow">Spațiul meu</p><button className="workspace-link" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><SquaresFourIcon size={19} aria-hidden="true" />Toate sarcinile</button><button className="workspace-link" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}><CircleIcon size={19} aria-hidden="true" />Deschise</button><button className="workspace-link" aria-pressed={filter === 'assigned'} onClick={() => setFilter('assigned')}><ArrowUpRightIcon size={19} aria-hidden="true" />Atribuite</button><button className="workspace-link" aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}><CheckCircleIcon size={19} aria-hidden="true" />Finalizate</button><div className="sidebar-note"><span>Demo pentru adulți</span><p>Publici aici. Candidaturile vin din aplicația mobilă.</p></div><Link className="workspace-back" to="/"><ArrowLeftIcon size={17} aria-hidden="true" />Înapoi la Nova</Link></aside>
    <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">Privire de ansamblu</p><h1>Sarcinile mele</h1><p>Salut, Andrei. Ce ai de rezolvat astăzi?</p></div><button className="button button-primary" onClick={() => { setShowForm(true); setMessage(''); }}><PlusIcon size={20} aria-hidden="true" />Postează o sarcină</button></div>
    <div className="task-overview" aria-label="Situația sarcinilor">{(['open', 'assigned', 'completed'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}><span>{status === 'open' ? 'Deschise' : status === 'assigned' ? 'În lucru' : 'Finalizate'}</span><strong>{loading || error ? '—' : tasks.filter(task => task.status === status).length}</strong><ArrowUpRightIcon size={18} aria-hidden="true" /></button>)}</div>
    {message && <p className="success-notice" role="status">{message}</p>}
    <div ref={composer}>{showForm && <TaskForm onClose={() => setShowForm(false)} onCreated={async () => { setMessage('Sarcina a fost publicată. Este disponibilă în aplicația mobilă.'); setFilter('all'); await refresh(); }} />}</div>
    <MyTaskList tasks={tasks} loading={loading} error={error} refresh={refresh} filter={filter} setFilter={setFilter} expanded={expanded} setExpanded={setExpanded} onCreate={() => setShowForm(true)} onNotice={setMessage} />
    <aside className="dashboard-help"><h3>Candidaturile vin de pe mobil.</h3><p>Folosește „Actualizează” pentru a vedea sarcinile curente și „Actualizează candidaturile” din detalii pentru persoanele care au aplicat.</p></aside>
    </div>
  </main>;
}
