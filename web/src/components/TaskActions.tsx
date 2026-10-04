import { useState, type FormEvent } from 'react';
import { CreditCardIcon, FlagIcon, XCircleIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { api } from '../api/instance';
import { formatBani } from '../api/client';
import type { TaskPublic } from '../api/types';
import { errorMessage } from '../lib/format';
import { ErrorNotice } from './Feedback';

type Payment = Awaited<ReturnType<typeof api.pay>>['payment'];

export function TaskActions({ task, busy, setBusy, onChanged, onNotice }: {
  task: TaskPublic; busy: boolean; setBusy: (value: boolean) => void; onChanged: () => Promise<void>; onNotice: (message: string) => void;
}) {
  const [panel, setPanel] = useState<'cancel' | 'dispute' | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [disputeId, setDisputeId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canCancel = (task.status === 'open' || task.status === 'assigned') && Date.parse(task.starts_at) > Date.now();

  async function act(kind: 'pay' | 'cancel' | 'dispute') {
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'pay') {
        const result = await api.pay(task.id);
        setPayment(result.payment);
        setMessage('Plata a fost înregistrată.');
      } else if (kind === 'cancel') {
        await api.cancelTask(task.id);
        setPanel(null);
        setMessage('Sarcina a fost anulată și ascunsă.');
        onNotice('Sarcina a fost anulată și ascunsă.');
      } else {
        const result = await api.openDispute(task.id, { reason: reason.trim() });
        setDisputeId(result.dispute.id); setReason(''); setPanel(null);
        setMessage('Disputa a fost deschisă.');
      }
      await onChanged();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  function submitDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim()) void act('dispute');
  }
  return <section className="task-actions" aria-label="Gestionarea sarcinii">
    <div className="task-actions-heading"><div><h3>Gestionare</h3><p>Plată, anulare sau raportarea unei probleme.</p></div></div>
    <div className="task-action-buttons">
      {task.status === 'assigned' && <button className="button button-primary" disabled={busy || !!payment} onClick={() => void act('pay')}><CreditCardIcon size={19} aria-hidden="true" />{payment ? 'Plată înregistrată' : 'Plătește'}</button>}
      {canCancel && <button className="button button-secondary" disabled={busy} aria-expanded={panel === 'cancel'} onClick={() => { setPanel(panel === 'cancel' ? null : 'cancel'); setError(''); }}><XCircleIcon size={19} aria-hidden="true" />Anulează sarcina</button>}
      <button className="button button-secondary" disabled={busy || !!disputeId} aria-expanded={panel === 'dispute'} onClick={() => { setPanel(panel === 'dispute' ? null : 'dispute'); setError(''); }}><FlagIcon size={19} aria-hidden="true" />{disputeId ? 'Dispută deschisă' : 'Raportează o problemă'}</button>
    </div>
    {panel === 'cancel' && <div className="action-confirmation"><h4>Anulezi această sarcină?</h4><p>Sarcina va fi ascunsă. Dacă plata este reținută, serverul o marchează ca restituită.</p><div><button className="button button-danger" disabled={busy} onClick={() => void act('cancel')}>{busy ? 'Se anulează…' : 'Confirmă anularea'}</button><button className="button button-secondary" disabled={busy} onClick={() => setPanel(null)}>Păstrează sarcina</button></div></div>}
    {panel === 'dispute' && <form className="dispute-form" onSubmit={submitDispute}><label className="field">Ce s-a întâmplat?<textarea value={reason} onChange={event => setReason(event.target.value)} required rows={3} placeholder="Descrie concret problema legată de această sarcină." /></label><div><button className="button button-primary" disabled={busy || !reason.trim()}>{busy ? 'Se trimite…' : 'Deschide disputa'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPanel(null)}>Închide</button></div></form>}
    {error && <ErrorNotice message={error} />}
    {message && <p className="success-notice" role="status"><CheckCircleIcon size={19} aria-hidden="true" />{message}</p>}
    {payment && <div className="payment-receipt"><h4>Rezumatul plății</h4><dl><div><dt>Sumă</dt><dd>{formatBani(payment.amount_bani)}</dd></div><div><dt>Comision Nova</dt><dd>{formatBani(payment.platform_fee_bani)}</dd></div><div><dt>Pentru lucrător</dt><dd>{formatBani(payment.worker_payout_bani)}</dd></div></dl><p>Valorile sunt confirmate de server.</p></div>}
    {disputeId && <p className="dispute-reference">Referință dispută: <strong>{disputeId}</strong></p>}
  </section>;
}
