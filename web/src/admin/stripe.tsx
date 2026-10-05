import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type StripeSettings } from './client';
import type { Desk } from './desk';
import { Field, Pill } from './ui';

const empty: StripeSettings = { mode: 'simulated', enabled: false, secret_set: false, publishable_set: false, webhook_set: false, publishable_key: '', secret_hint: '' };

export function StripePanel({ desk }: { desk: Desk }) {
  const [settings, setSettings] = useState<StripeSettings>(empty);
  const [secret, setSecret] = useState('');
  const [publishable, setPublishable] = useState('');
  const [webhook, setWebhook] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void adminApi.stripe(desk.token).then(next => {
      setSettings(next);
      setEnabled(next.enabled);
      setPublishable(next.publishable_key);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Stripe nu s-a încărcat.'));
  }, [desk.token]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const ok = await desk.run(() => adminApi.saveStripe(desk.token, {
      secret_key: secret,
      publishable_key: publishable,
      webhook_secret: webhook,
      enabled,
    }), enabled ? 'Stripe este pornit. Plățile noi merg la Checkout.' : 'Cheia e salvată, dar plățile rămân simulate.');
    if (!ok) return;
    setSecret('');
    setWebhook('');
    const next = await adminApi.stripe(desk.token);
    setSettings(next);
    setEnabled(next.enabled);
  }

  function clear() {
    desk.confirm({
      title: 'Ștergi cheile Stripe?',
      body: 'Plățile revin imediat la modul simulat. Nu se pierde niciun registru deja scris.',
      label: 'Șterge cheile',
      danger: true,
      onConfirm: () => void desk.run(() => adminApi.saveStripe(desk.token, { clear: true }), 'Plățile sunt din nou simulate.').then(ok => {
        if (!ok) return;
        setSettings(empty);
        setEnabled(false);
        setSecret('');
        setPublishable('');
        setWebhook('');
      }),
    });
  }

  const mode = settings.mode === 'stripe_live' ? 'Live' : settings.mode === 'stripe_test' ? 'Test' : 'Simulat';
  return <form className="dk-form" onSubmit={event => void save(event)}>
    <div className="dk-row-gap">
      <Pill value={settings.mode === 'simulated' ? 'paused' : 'active'} label={mode} />
      <span className="dk-muted">{settings.secret_set ? `Cheie salvată ${settings.secret_hint}` : 'Nicio cheie. Plățile rămân simulate.'}</span>
    </div>
    <p className="dk-muted">Cheia se scrie doar aici, pe server. Nu se pune în git și nu se mai afișează întreagă. Fără cheie pornită, butonul Plătește ține registrul simulat.</p>
    <Field label="Cheie secretă" hint="sk_test_ sau sk_live_. Lasă gol ca să o păstrezi."><input type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} placeholder={settings.secret_set ? 'Salvată' : 'sk_test_…'} /></Field>
    <Field label="Cheie publică" hint="pk_test_ sau pk_live_."><input autoComplete="off" value={publishable} onChange={event => setPublishable(event.target.value)} placeholder="pk_test_…" /></Field>
    <Field label="Webhook" hint="whsec_… din Stripe, ca plata confirmată să intre în registru."><input type="password" autoComplete="off" value={webhook} onChange={event => setWebhook(event.target.value)} placeholder={settings.webhook_set ? 'Salvat' : 'whsec_…'} /></Field>
    <label className="dk-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Pornește Stripe. Debifat, plățile rămân simulate chiar dacă cheia e salvată.</label>
    {error && <p className="dk-alert" role="alert">{error}</p>}
    <div className="dk-row-gap">
      <button type="submit" className="dk-btn">Salvează</button>
      {settings.secret_set && <button type="button" className="dk-btn is-danger-ghost" onClick={clear}>Șterge cheile</button>}
    </div>
  </form>;
}
