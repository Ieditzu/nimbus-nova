import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircleIcon, StarIcon } from '@phosphor-icons/react';
import { api } from '../api/instance';
import type { ApplicationView, Review, TaskPublic } from '../api/types';
import { errorMessage } from '../lib/format';
import { ApplicationList } from './ApplicationList';
import { ErrorNotice, Loading } from './Feedback';

export function TaskDetail({ task, onChanged }: { task: TaskPublic; onChanged: () => Promise<void> }) {
  const [applications, setApplications] = useState<ApplicationView[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.listTaskApplications(task.id).then(data => { if (active) setApplications(data.applications); }).catch(failure => { if (active) setError(errorMessage(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [task.id, task.status, attempt]);
  useEffect(() => {
    if (task.status !== 'completed') return;
    let active = true;
    setReviewLoading(true); setReviewError('');
    api.listReviews(task.id).then(data => { if (active) setReviews(data.reviews); }).catch(failure => { if (active) setReviewError(errorMessage(failure)); }).finally(() => { if (active) setReviewLoading(false); });
    return () => { active = false; };
  }, [task.id, task.status, reviewAttempt]);
  async function act(kind: 'accept' | 'complete', applicationId?: string) {
    setBusy(true); setActionError(''); setMessage('');
    try {
      if (kind === 'accept' && applicationId) await api.acceptApplication(applicationId);
      else await api.completeTask(task.id);
      setMessage(kind === 'accept' ? 'Candidatura a fost acceptată. Nova a atribuit sarcina.' : 'Sarcina a fost finalizată. Poți lăsa o recenzie.');
      await onChanged();
      setAttempt(value => value + 1);
    } catch (failure) { setActionError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true); setActionError(''); setMessage('');
    try {
      await api.createReview(task.id, { stars: Number(data.get('stars')), text: String(data.get('text')).trim() });
      form.reset(); setMessage('Recenzia a fost trimisă. Mulțumim!');
      setReviewAttempt(value => value + 1);
    } catch (failure) { setActionError(errorMessage(failure)); } finally { setBusy(false); }
  }
  const reviewed = reviews.some(review => review.author_id === 'poster-1');
  return <div className="task-detail" id={`details-${task.id}`}>
    <div className="task-description"><div><h3>Despre sarcină</h3><p>{task.description}</p>{task.safety_note && <p className="safety-note"><strong>Notă de siguranță:</strong> {task.safety_note}</p>}{task.assignee_name && <p className="assignee"><CheckCircleIcon size={18} aria-hidden="true" />Persoana aleasă: <strong>{task.assignee_name}</strong></p>}</div><button className="button button-secondary" disabled={busy || task.status !== 'assigned'} onClick={() => void act('complete')}><CheckCircleIcon size={19} aria-hidden="true" />Finalizează</button></div>
    {actionError && <ErrorNotice message={actionError} />}
    {message && <p className="success-notice" role="status"><CheckCircleIcon size={20} aria-hidden="true" />{message}</p>}
    <div className="detail-heading"><h3>Candidaturi {(!loading && !error) && <span className="count">{applications.length}</span>}</h3><button className="text-button" disabled={loading || busy} onClick={() => setAttempt(value => value + 1)}>Actualizează candidaturile</button></div>
    <ApplicationList applications={applications} task={task} loading={loading} error={error} busy={busy} onRetry={() => setAttempt(value => value + 1)} onAccept={id => void act('accept', id)} />
    {task.status === 'completed' && <section className="reviews-region" aria-labelledby={`review-title-${task.id}`}><h3 id={`review-title-${task.id}`}>Cum a fost experiența?</h3>{reviewLoading ? <Loading /> : reviewError ? <ErrorNotice message={reviewError} retry={() => setReviewAttempt(value => value + 1)} /> : <>
      {!reviewed && <form className="review-form" onSubmit={submitReview}><label className="field">Notă<select name="stars" defaultValue="5">{[1, 2, 3, 4, 5].map(stars => <option value={stars} key={stars}>{stars} {stars === 1 ? 'stea' : 'stele'}</option>)}</select></label><label className="field">Recenzie<textarea name="text" required minLength={1} maxLength={280} rows={2} placeholder="Spune pe scurt cum a fost colaborarea." /></label><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Se trimite...' : 'Trimite recenzia'}</button></form>}
      {reviews.length === 0 ? <p className="muted">Nu există recenzii încă.</p> : <ul className="review-list">{reviews.map(review => <li key={review.id}><div><strong>{review.author_name}</strong><span className="review-stars"><StarIcon size={16} weight="fill" aria-hidden="true" />{review.stars}/5</span></div><p>{review.text}</p></li>)}</ul>}
    </>}</section>}
  </div>;
}
