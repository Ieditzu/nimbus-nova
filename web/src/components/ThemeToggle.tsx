import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const sync = (event: StorageEvent) => {
      if (event.key === 'nova-theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
        document.documentElement.dataset.theme = event.newValue;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', event.newValue === 'dark' ? '#1c1920' : '#faf7f3');
        setTheme(event.newValue);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function choose(value: 'light' | 'dark') {
    document.documentElement.dataset.theme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#1c1920' : '#faf7f3');
    setTheme(value);
    try { localStorage.setItem('nova-theme', value); } catch { /* Theme remains usable when storage is unavailable. */ }
  }
  return <div className="theme-toggle" role="group" aria-label="Tema interfeței">
    <button aria-label="Temă luminoasă" aria-pressed={theme === 'light'} onClick={() => choose('light')}><SunIcon size={19} aria-hidden="true" /></button>
    <button aria-label="Temă întunecată" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}><MoonIcon size={19} aria-hidden="true" /></button>
  </div>;
}
