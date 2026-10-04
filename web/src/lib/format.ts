export const amountCaption = 'Sumă propusă. În acest demo nu se încasează plata.';
const day = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Bucharest' });
const time = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
export function formatInterval(start: string, end: string): string {
  const first = new Date(start), last = new Date(end);
  const sameDay = day.format(first) === day.format(last);
  return `${day.format(first)}, ${time.format(first)} – ${sameDay ? '' : day.format(last) + ', '}${time.format(last)}`;
}
export const errorMessage = (error: unknown) => {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return 'Nu putem conecta API-ul. Verifică dacă serverul este pornit și încearcă din nou.';
  if (error instanceof TypeError) return 'Răspuns neașteptat de la server.';
  if (error instanceof SyntaxError) return 'Răspuns neașteptat de la server.';
  return error instanceof Error ? error.message : 'Răspuns neașteptat de la server.';
};
