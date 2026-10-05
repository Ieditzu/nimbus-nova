import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/instance';
import { errorMessage } from '../lib/format';

type PlatformReview = { id: string; author_name: string; role: string; stars: number; text: string; created_at: string };

export function PlatformReviews({ canWrite = false }: { canWrite?: boolean }) {
  const [reviews, setReviews] = useState<PlatformReview[]>([]);
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.listPlatformReviews().then(result => { if (live) setReviews(result.reviews ?? []); }).catch(() => { if (live) setReviews([]); });
    return () => { live = false; };
  }, [done]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setDone(''); setBusy(true);
    try {
      await api.createPlatformReview({ stars, text: text.trim() });
      setText('');
      setDone('Recenzia ta este pe pagina principală.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="lp-section" id="recenzii">
    <div className="lp-wrap">
      <div className="lp-head" data-reveal>
        <p className="lp-eyebrow">Recenzii</p>
        <h2 className="lp-display">Ce spun<br />oamenii</h2>
      </div>
      <div className="lp-reviews">
        {reviews.map(review => <article key={review.id} className="lp-review" data-reveal>
          <p className="lp-stars" aria-label={`${review.stars} din 5`}>{'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}</p>
          <p>{review.text}</p>
          <small>{review.author_name} · {review.role === 'poster' ? 'a postat' : 'a lucrat'}</small>
        </article>)}
      </div>
      {canWrite && <form className="lp-review-form" onSubmit={event => void submit(event)}>
        <p>Ai încheiat o sarcină? Lasă o recenzie pentru Nova.</p>
        <label>Stele
          <select value={stars} onChange={event => setStars(Number(event.target.value))} disabled={busy}>
            {[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Text
          <textarea value={text} onChange={event => setText(event.target.value)} minLength={8} maxLength={400} required disabled={busy} placeholder="Ce a mers, ce ai vrea schimbat" />
        </label>
        {error && <p role="alert">{error}</p>}
        {done && <p role="status">{done}</p>}
        <button className="lp-btn" type="submit" disabled={busy}>Publică recenzia</button>
      </form>}
    </div>
  </section>;
}
