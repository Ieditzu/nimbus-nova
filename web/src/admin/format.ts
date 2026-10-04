export const roleLabel: Record<string, string> = {
  worker: 'Lucrător', poster: 'Poster', admin: 'Admin', partner_user: 'Partener', organizer: 'Organizator', guardian: 'Tutore',
};

export const statusLabel: Record<string, string> = {
  active: 'Activ', suspended: 'Suspendat', open: 'Deschisă', hidden: 'Ascunsă', assigned: 'Atribuită', completed: 'Finalizată',
  resolved: 'Rezolvată', pending: 'În așteptare', accepted: 'Acceptată', rejected: 'Respinsă', prospect: 'Prospect', paused: 'Pauză',
  held: 'Reținută', released: 'Eliberată', refunded: 'Returnată', unpaid: 'Neplătită', collecting: 'Colectare', processing: 'Procesare',
  verified: 'Verificată', consumed: 'Folosită', review: 'De revizuit', passed: 'Trecut', failed: 'Picat', going: 'Înscris', checked_in: 'Prezent',
  credit: 'Credit', debit: 'Debit',
};

export const actionLabel: Record<string, string> = {
  user_suspend: 'Cont suspendat', user_activate: 'Cont reactivat', user_revoke_sessions: 'Sesiuni revocate', task_hide: 'Sarcină ascunsă',
  task_unhide: 'Sarcină republicată', dispute_resolve: 'Dispută rezolvată', partner_activate: 'Partener activat', partner_pause: 'Partener în pauză',
  partner_create: 'Partener adăugat', review_remove: 'Recenzie ștearsă', note_create: 'Notă internă', event_delete: 'Eveniment șters',
};

/** Tone drives the pill colour; unknown values fall back to neutral. */
export function tone(value: string): 'good' | 'warn' | 'bad' | 'info' | 'neutral' {
  if (['active', 'completed', 'resolved', 'accepted', 'released', 'verified', 'passed', 'credit', 'checked_in'].includes(value)) return 'good';
  if (['open', 'pending', 'held', 'prospect', 'collecting', 'processing', 'review', 'going'].includes(value)) return 'warn';
  if (['suspended', 'hidden', 'rejected', 'refunded', 'failed', 'paused', 'debit'].includes(value)) return 'bad';
  if (['assigned', 'consumed'].includes(value)) return 'info';
  return 'neutral';
}

export function money(bani: unknown, compact = false) {
  const amount = Number(bani);
  if (!Number.isFinite(amount)) return '—';
  const lei = amount / 100;
  if (compact && Math.abs(lei) >= 10000) return `${new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 }).format(lei)} RON`;
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(lei)} RON`;
}

export const number = (value: number) => new Intl.NumberFormat('ro-RO').format(value);

const stamp = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
const dayOnly = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' });

export function when(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : stamp.format(date);
}

export function day(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value);
  return Number.isNaN(date.getTime()) ? value : dayOnly.format(date);
}

export function ago(value: unknown) {
  if (!value) return '—';
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) return String(value);
  const seconds = Math.round((time - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('ro-RO', { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return 'chiar acum';
}

export function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = value / 1024, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export function duration(seconds: number) {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}z ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase('ro-RO') || '?';

export const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO');

/** Builds an RFC 4180 CSV and starts a download; formulas are neutralised for spreadsheet safety. */
export function downloadCsv(name: string, header: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const leiToBani = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
};
