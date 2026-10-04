const TOKEN = 'nova-poster-token';
const USER = 'nova-poster-user';

export type PosterAccount = { id: string; display_name: string; role: string };

export function posterToken() {
  return sessionStorage.getItem(TOKEN) || '';
}

export function posterAccount(): PosterAccount | null {
  const raw = sessionStorage.getItem(USER);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('id' in parsed) || !('display_name' in parsed)) return null;
    const id = parsed.id;
    const displayName = parsed.display_name;
    const role = 'role' in parsed ? parsed.role : 'poster';
    if (typeof id !== 'string' || typeof displayName !== 'string' || typeof role !== 'string') return null;
    return { id, display_name: displayName, role };
  } catch {
    return null;
  }
}

export function savePosterSession(token: string, user: PosterAccount) {
  sessionStorage.setItem(TOKEN, token);
  sessionStorage.setItem(USER, JSON.stringify(user));
}

export function clearPosterSession() {
  sessionStorage.removeItem(TOKEN);
  sessionStorage.removeItem(USER);
}
