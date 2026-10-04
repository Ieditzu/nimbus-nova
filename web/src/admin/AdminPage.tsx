import { useCallback, useEffect, useState } from 'react';
import { createNovaClient } from '../api/client';
import { apiBaseUrl } from '../api/instance';
import type { TaskPublic } from '../api/types';
import { errorMessage } from '../lib/format';
import { statuses } from '../lib/labels';

const api = createNovaClient(apiBaseUrl(), 'admin-1');

export default function AdminPage() {
  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTasks((await api.listAdminTasks()).tasks);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function hide(task: TaskPublic) {
    setPending(task.id);
    setNotice('');
    setError('');
    try {
      await api.hideTask(task.id);
      setNotice(`„${task.title}” este ascunsă.`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending('');
    }
  }

  async function reset() {
    if (!window.confirm('Resetezi datele demo?')) return;
    setPending('reset');
    setNotice('');
    setError('');
    try {
      await api.resetDemo();
      setNotice('Datele demo au fost restaurate.');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending('');
    }
  }

  return <main className="dashboard page-width" id="main-content">
    <div className="workspace-content">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Moderare</p>
          <h1>Administrare</h1>
          <p>Sarcinile demo, inclusiv cele ascunse. Nu se editează utilizatori.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void reset()} disabled={pending !== ''}>Resetează demo</button>
      </div>
      {notice && <p className="success-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p>Se încarcă...</p> : tasks.length === 0 ? <p>Nu există sarcini.</p> : <div className="task-table-wrapper"><table className="task-table">
        <thead><tr><th>Sarcină</th><th>Poster</th><th>Oraș</th><th>Stare</th><th><span className="sr-only">Acțiuni</span></th></tr></thead>
        <tbody>{tasks.map(task => <tr className="task-row" key={task.id}>
          <td><strong className="task-title">{task.title}</strong></td>
          <td>{task.poster_name}</td>
          <td>{task.city}</td>
          <td><span className={`badge badge-${task.status}`}>{statuses[task.status]}</span></td>
          <td><button className="button button-secondary button-small" type="button" onClick={() => void hide(task)} disabled={pending !== '' || task.status === 'hidden'}>{task.status === 'hidden' ? 'Ascunsă' : 'Ascunde'}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  </main>;
}
