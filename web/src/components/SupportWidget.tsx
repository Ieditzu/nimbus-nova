import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SparkleIcon, XIcon } from '@phosphor-icons/react';
import { NovaError, type SupportMessage } from '../api/client';
import { api } from '../api/instance';
import { posterAccount, posterToken } from '../api/session';

export function SupportWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [human, setHuman] = useState(false);
  if (pathname.startsWith('/admin')) return null;
  const signedIn = Boolean(posterToken());

  async function send() {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      const thread = ticketId ? await api.sendSupportMessage(ticketId, value) : await api.openSupportTicket(value);
      setTicketId(thread.ticket.id);
      setMessages(thread.messages);
      setHuman(thread.ticket.needs_human);
      setText('');
    } catch (cause) {
      setError(cause instanceof NovaError ? cause.message : 'Mesajul nu a plecat.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="support-dock">
    {open && <section className="support-panel" aria-label="Suport Nova">
      <header>
        <strong>Suport</strong>
        <button type="button" aria-label="Închide suportul" onClick={() => setOpen(false)}><XIcon size={16} aria-hidden="true" /></button>
      </header>
      {!signedIn ? <p>Intră în cont ca să vorbim. Eu știu unde sunt butoanele; un om preia doar dacă nu pot rezolva.</p> : <>
        <div className="support-log" aria-live="polite">
          {messages.length === 0 && <p>Spune ce nu găsești. Îți arăt butonul, nu inventez o plată.</p>}
          {messages.map(item => <p key={item.id} className={item.author === 'user' ? 'is-user' : 'is-bot'}><b>{item.author === 'user' ? 'Tu' : item.author === 'admin' ? 'Echipa' : 'Nova'}</b>{item.text}</p>)}
        </div>
        {human && <p className="support-human">Echipa a fost anunțată. Răspunsul apare aici.</p>}
        {error && <p className="support-error" role="alert">{error}</p>}
        <form onSubmit={event => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="support-text">Mesaj</label>
          <textarea id="support-text" value={text} maxLength={2000} placeholder="Unde este butonul?" onChange={event => setText(event.target.value)} />
          <button type="submit" className="lp-btn is-small" disabled={busy || text.trim().length < 2}>{busy ? 'Se trimite' : 'Trimite'}</button>
        </form>
      </>}
      {!signedIn && <Link className="lp-btn is-small" to="/poster">Intră în cont</Link>}
      {signedIn && posterAccount() && <p className="support-who">{posterAccount()?.display_name}</p>}
    </section>}
    <button type="button" className="support-open" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <SparkleIcon size={18} weight="fill" aria-hidden="true" />Suport
    </button>
  </div>;
}
