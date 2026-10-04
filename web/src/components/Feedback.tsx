import { WarningCircleIcon } from '@phosphor-icons/react';

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><WarningCircleIcon size={22} aria-hidden="true" /><div><p>{message}</p>{retry && <button className="text-button" onClick={retry}>Încearcă din nou</button>}</div></div>;
}
export function Loading() { return <p className="loading" role="status"><span className="spinner" aria-hidden="true" />Se încarcă...</p>; }
