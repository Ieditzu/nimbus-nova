import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SparkleIcon, XIcon } from '@phosphor-icons/react';
import { NovaError, type SupportMessage } from '../api/client';
import { api } from '../api/instance';

const STORAGE = 'nova-support-ticket';

type Saved = { id: string; key: string };

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const item = parsed as Saved;
    return item.id && item.key ? item : null;
  } catch {
    return null;
  }
}

export function SupportChat({ page = false }: { page?: boolean }) {
  const [ticketId, setTicketId] = useState('');
  const [guestKey, setGuestKey] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [human, setHuman] = useState(false);

  useEffect(() => {
    const saved = readSaved();
    if (!saved) return;
    setTicketId(saved.id);
    setGuestKey(saved.key);
    void api.getSupportTicket(saved.id, saved.key).then(thread => {
      setMessages(thread.messages);
      setHuman(thread.ticket.needs_human);
    }).catch(() => undefined);
  }, []);

  async function send() {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    try {
      if (ticketId) {
        const thread = await api.sendSupportMessage(ticketId, value, guestKey || undefined);
        setMessages(thread.messages);
        setHuman(thread.ticket.needs_human);
      } else {
        const thread = await api.openSupportTicket(value);
        setTicketId(thread.ticket.id);
        setMessages(thread.messages);
        setHuman(thread.ticket.needs_human);
        if (thread.guest_key) {
          setGuestKey(thread.guest_key);
          localStorage.setItem(STORAGE, JSON.stringify({ id: thread.ticket.id, key: thread.guest_key }));
        }
      }
      setText("");
    } catch (cause) {
      setError(cause instanceof NovaError ? cause.message : 'Mesajul nu a plecat.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={page ? 'support-panel is-page' : 'support-panel'} aria-label="Suport Nova">
    <header>
      <span className="support-mark" aria-hidden="true"><SparkleIcon size={16} weight="fill" /></span>
      <div>
        <strong>Suport</strong>
        <small>Fără cont</small>
      </div>
    </header>
    <div className="support-log" aria-live="polite">
      {messages.length === 0 && <p className="support-empty">Spune ce nu găsești. Dacă nu pot rezolva, tichetul ajunge la echipă.</p>}
      {messages.map(item => {
        const who = item.author === 'user' ? 'Tu' : item.author === 'admin' ? 'Echipă' : 'Nova';
        return <p key={item.id} className={`support-bubble is-${item.author === 'user' ? 'user' : item.author === 'admin' ? 'team' : 'bot'}`}><b>{who}</b>{item.text}</p>;
      })}
    </div>
    {human && <p className="support-human">Echipa a fost anunțată. Răspunsul apare aici.</p>}
    {error && <p className="support-error" role="alert">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="sr-only" htmlFor={page ? 'support-page-text' : 'support-text'}>Mesaj</label>
      <textarea id={page ? 'support-page-text' : 'support-text'} value={text} maxLength={2000} placeholder="Unde este butonul?" onChange={event => setText(event.target.value)} />
      <button type="submit" className="support-send" disabled={busy || text.trim().length < 2}>{busy ? 'Se trimite' : 'Trimite'}</button>
    </form>
  </section>;
}

export function SupportPage() {
  return <main id="main-content" className="support-page">
    <div className="support-hero">
      <p>Suport</p>
      <h1>Întreabă Nova</h1>
      <span>Nu îți trebuie cont. Scrii aici, iar dacă Nova nu poate rezolva, tichetul ajunge în birou.</span>
    </div>
    <SupportChat page />
  </main>;
}

export function SupportWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith('/admin') || pathname === '/suport') return null;
  return <div className="support-dock">
    {open && <SupportChat />}
    <button type="button" className="support-open" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <XIcon size={18} aria-hidden="true" /> : <SparkleIcon size={18} weight="fill" aria-hidden="true" />}Suport
    </button>
  </div>;
}
