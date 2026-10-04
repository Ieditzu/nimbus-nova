import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNovaClient, formatBani, NovaError, ronToBani, toRfc3339 } from './client';
import { errorMessage } from '../lib/format';
import createBody from '../../../docs/fixtures/create-task-request.json';

const api = createNovaClient('http://127.0.0.1:8080/', 'poster-1');
afterEach(() => vi.unstubAllGlobals());

describe('frozen shared client', () => {
  it('keeps the supplied client and types verbatim', () => {
    for (const file of ['client.ts', 'types.ts']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).toBe(readFileSync(new URL(`../../../docs/agents/${file}`, import.meta.url), 'utf8'));
    }
  });
  it('sends only the documented create payload with poster-1 and accepts 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: { id: 'task_test' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.createTask(createBody as Parameters<typeof api.createTask>[0])).resolves.toEqual({ task: { id: 'task_test' } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/v1/tasks');
    expect(options.method).toBe('POST');
    expect(options.headers.get('X-Demo-Actor')).toBe('poster-1');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual(createBody);
  });
  it('fetches the poster list, rather than the public open list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"tasks":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.listMyTasks()).resolves.toEqual({ tasks: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8080/v1/me/tasks');
    expect(fetchMock.mock.calls[0][1].headers.get('X-Demo-Actor')).toBe('poster-1');
  });
  it('does not send an actor on public health or review reads', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"ok":true,"reviews":[]}')));
    vi.stubGlobal('fetch', fetchMock);
    await api.getHealth(); await api.listReviews('task_test');
    for (const [, options] of fetchMock.mock.calls) expect(options.headers.has('X-Demo-Actor')).toBe(false);
  });
  it('accepts and completes with an empty object and the poster actor', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"task":{}}')));
    vi.stubGlobal('fetch', fetchMock);
    await api.acceptApplication('app_test'); await api.completeTask('task_test');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8080/v1/applications/app_test/accept', 'http://127.0.0.1:8080/v1/tasks/task_test/complete']);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.method).toBe('POST'); expect(options.body).toBe('{}'); expect(options.headers.get('X-Demo-Actor')).toBe('poster-1');
    }
  });
  it('posts only stars and text, with no author or subject', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"review":{}}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.createReview('task_test', { stars: 4, text: 'Totul a fost bine.' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ stars: 4, text: 'Totul a fost bine.' });
  });
  it('preserves the Romanian server error and conflict code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"code":"task_already_assigned","message":"Sarcina este deja atribuită."}}', { status: 409 })));
    await expect(api.acceptApplication('app_test')).rejects.toMatchObject({ status: 409, code: 'task_already_assigned', message: 'Sarcina este deja atribuită.' });
  });
  it('reports an unexpected JSON response and maps HTML parse failures in the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"oops"}', { status: 502 })));
    await expect(api.listMyTasks()).rejects.toMatchObject({ message: 'Răspuns neașteptat de la server.' });
    expect(errorMessage(new SyntaxError('Unexpected token <'))).toBe('Răspuns neașteptat de la server.');
  });
});
describe('amount and time contract', () => {
  it.each([['120', 12000], ['100,25', 10025], ['0.29', 29], [' 1,01 ', 101], ['5000.00', 500000], ['0', 0]])('converts %s RON exactly', (input, output) => expect(ronToBani(input)).toBe(output));
  it.each(['1.005', '-1', '5000.01', '', '1,2,3', 'NaN'])('rejects invalid amount %s', input => expect(() => ronToBani(input)).toThrow(NovaError));
  it('uses the required offset, not the computer timezone', () => expect(toRfc3339('2026-10-05T14:00')).toBe('2026-10-05T14:00:00+03:00'));
  it('displays two fractional digits and RON', () => expect(formatBani(12000)).toBe('120.00 RON'));
});
