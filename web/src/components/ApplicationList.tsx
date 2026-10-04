import { ArrowRightIcon, UsersIcon } from '@phosphor-icons/react';
import type { ApplicationView, TaskPublic } from '../api/types';
import { applicationStatuses } from '../lib/labels';
import { ErrorNotice, Loading } from './Feedback';

interface Props {
  applications: ApplicationView[];
  task: TaskPublic;
  loading: boolean;
  error: string;
  busy: boolean;
  onRetry: () => void;
  onAccept: (id: string) => void;
}
export function ApplicationList({ applications, task, loading, error, busy, onRetry, onAccept }: Props) {
  return <>{loading ? <Loading /> : error ? <ErrorNotice message={error} retry={onRetry} /> : applications.length === 0 ? <div className="inline-empty"><UsersIcon size={25} aria-hidden="true" /><div><strong>Nicio candidatură încă.</strong><p>Când cineva aplică din aplicația mobilă, candidatura apare aici.</p></div></div> : <ul className="applicants">{applications.map(application => <li key={application.id}><div className="avatar" aria-hidden="true">{application.worker_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</div><div className="applicant-content"><div className="applicant-heading"><strong>{application.worker_name}</strong><span className={`badge badge-${application.status}`}>{applicationStatuses[application.status]}</span></div><p className="applicant-meta">{application.city} · {application.skills.join(', ')}</p><p>{application.message}</p></div><button className="button button-secondary" disabled={busy || application.status !== 'pending' || task.status !== 'open'} onClick={() => onAccept(application.id)}>Acceptă<ArrowRightIcon size={17} aria-hidden="true" /></button></li>)}</ul>}</>;
}
