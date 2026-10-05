import { useState, type FormEvent } from 'react';
import { adminApi, type AdminTicket, type AdminTicketMessage } from './client';
import type { Desk } from './desk';
import { ago, when } from './format';
import { Field, Pill } from './ui';


export function Tickets({ desk }: { desk: Desk }) {
  const [openId, setOpenId] = useState('');
  const [messages, setMessages] = useState<AdminTicketMessage[]>([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const waiting = desk.data.tickets.filter(item => item.needs_human);

  async function open(item: AdminTicket) {
    setOpenId(item.id);
    setError('');
    const detail = await adminApi.ticket(desk.token, item.id);
    setMessages(detail.messages);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!openId || text.length < 2) return;
    const ok = await desk.run(() => adminApi.replyTicket(desk.token, openId, text), 'Răspunsul a plecat. Tichetul nu mai cere un om.');
    if (!ok) return;
    setReply('');
    const detail = await adminApi.ticket(desk.token, openId);
    setMessages(detail.messages);
  }

  return <div className="dk-stack">
    {waiting.length > 0 && <p className="dk-alert" role="status">{waiting.length} {waiting.length === 1 ? 'tichet cere' : 'tichete cer'} un om. Badge-ul portocaliu rămâne până răspunzi.</p>}
    {desk.data.tickets.length === 0 ? <div className="dk-empty"><span aria-hidden="true">✓</span><p>Niciun tichet.</p></div> : <ul className="dk-cards">
      {desk.data.tickets.map(item => <li key={item.id} className="dk-case">
        <header>
          <Pill value={item.needs_human ? 'waiting' : item.status} />
          <span className="dk-muted" title={when(item.updated_at)}>{ago(item.updated_at)}</span>
        </header>
        <strong>{item.subject}</strong>
        <p>{item.user_name || item.user_id}</p>
        <footer>
          <button type="button" className="dk-btn is-small" onClick={() => void open(item).catch(() => setError('Tichetul nu s-a deschis.'))}>Deschide</button>
          {item.status !== 'closed' && <button type="button" className="dk-btn is-small is-ghost" onClick={() => void desk.run(() => adminApi.closeTicket(desk.token, item.id), 'Tichetul a fost închis.')}>Închide</button>}
        </footer>
        {openId === item.id && <div>
          {messages.map(message => <p key={message.id}><b>{message.author === 'user' ? 'Utilizator' : message.author === 'admin' ? 'Echipă' : 'Nova'}: </b>{message.text}</p>)}
          {item.status !== 'closed' && <form className="dk-form" onSubmit={event => void send(event)}>
            <Field label="Răspuns"><input value={reply} maxLength={2000} onChange={event => setReply(event.target.value)} /></Field>
            <button type="submit" className="dk-btn is-small" disabled={reply.trim().length < 2}>Trimite</button>
          </form>}
        </div>}
      </li>)}
    </ul>}
    {error && <p className="dk-alert" role="alert">{error}</p>}
  </div>;
}
