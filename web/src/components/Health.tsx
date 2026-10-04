import { useEffect, useState } from 'react';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { api } from '../api/instance';

export function Health() {
  const [status, setStatus] = useState<'loading' | 'on' | 'off'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.getHealth().then(result => { if (active) setStatus(result.ok === true ? 'on' : 'off'); }).catch(() => { if (active) setStatus('off'); });
    return () => { active = false; };
  }, [attempt]);
  return <div className={`health health-${status}`}><span className="status-dot" aria-hidden="true" /><span role="status">{status === 'loading' ? 'Se încarcă...' : status === 'on' ? 'API pornit' : 'API oprit'}</span><button className="icon-button" aria-label="Verifică din nou API-ul" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }} disabled={status === 'loading'}><ArrowsClockwiseIcon size={16} aria-hidden="true" /></button></div>;
}
