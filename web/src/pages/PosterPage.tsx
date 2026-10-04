import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from '@phosphor-icons/react';
import type { TaskStatus } from '../api/types';
import { TaskForm } from '../components/TaskForm';
import { MyTaskList, useMyTasks } from '../components/MyTaskList';

export default function PosterPage() {
  const { tasks, loading, error, refresh } = useMyTasks();
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => { if (showForm) { composer.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); composer.current?.querySelector('input')?.focus({ preventScroll: true }); } }, [showForm]);
  return <main className="dashboard page-width" id="main-content">
    <div className="dashboard-heading"><div><p className="eyebrow">Spațiul tău de organizare</p><h1>Sarcinile mele</h1><p>Salut, Andrei. Ce ai de rezolvat astăzi?</p></div><button className="button button-primary" onClick={() => { setShowForm(true); setMessage(''); }}><PlusIcon size={20} aria-hidden="true" />Postează o sarcină</button></div>
    <div className="dashboard-note"><span className="note-mark">n</span><p>Tu publici pe website. Lucrătorii aplică din mobil. <strong>Nova ține legătura.</strong></p><span className="note-tag">Demo pentru adulți</span></div>
    {message && <p className="success-notice" role="status">{message}</p>}
    <div ref={composer}>{showForm && <TaskForm onClose={() => setShowForm(false)} onCreated={async () => { setMessage('Sarcina a fost publicată. Este disponibilă în aplicația mobilă.'); setFilter('all'); await refresh(); }} />}</div>
    <MyTaskList tasks={tasks} loading={loading} error={error} refresh={refresh} filter={filter} setFilter={setFilter} expanded={expanded} setExpanded={setExpanded} onCreate={() => setShowForm(true)} />
    <aside className="dashboard-help"><h3>Candidaturile vin de pe mobil.</h3><p>Folosește „Actualizează” pentru a vedea sarcinile curente și „Actualizează candidaturile” din detalii pentru persoanele care au aplicat.</p></aside>
  </main>;
}
