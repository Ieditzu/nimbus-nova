import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRightIcon, ArrowUpRightIcon } from '@phosphor-icons/react';
import { Health } from './components/Health';
import { ThemeToggle } from './components/ThemeToggle';
import LandingPage from './pages/LandingPage';
import PosterPage from './pages/PosterPage';
import AdminPage from './admin/AdminPage';

function Metadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pathname === '/' ? 'Nimbus Nova | Sarcini scurte, prin Nova' : pathname === '/poster' ? 'Sarcinile mele | Nimbus Nova' : pathname === '/admin' ? 'Administrare | Nimbus Nova' : 'Pagina nu există | Nimbus Nova';
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    robots.content = pathname === '/' ? 'index,follow' : 'noindex,nofollow';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.hidden = pathname !== '/';
    if (pathname !== '/') canonical?.remove();
    else if (import.meta.env.VITE_SITE_URL && !canonical) {
      const link = document.createElement('link'); link.rel = 'canonical'; link.href = import.meta.env.VITE_SITE_URL.replace(/\/+$/, '') + '/'; document.head.append(link);
    }
    document.querySelector('meta[name="description"]')?.setAttribute('content', pathname === '/' ? 'Omul din mijloc dintre cine are timp și cine are o sarcină scurtă. Publică o sarcină și gestionează candidaturile prin Nimbus Nova. Demo pentru adulți.' : pathname === '/poster' ? 'Publică sarcini scurte, gestionează candidaturile și finalizează colaborarea în demo-ul Nimbus Nova.' : 'Nimbus Nova, demo pentru adulți.');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function NotFound() {
  return <main id="main-content" className="route-message page-width"><span className="eyebrow">404</span><h1>Pagina nu există.</h1><p>Poate linkul este incomplet. Poți reveni la Nimbus Nova.</p><Link className="button button-primary" to="/">Înapoi la început<ArrowRightIcon size={18} aria-hidden="true" /></Link></main>;
}
export default function App() {
  return <><Metadata /><a className="skip-link" href="#main-content">Mergi la conținut</a><header className="site-header"><div className="page-width header-inner"><Link to="/" className="brand" aria-label="Nimbus Nova, pagina principală"><span className="brand-mark" aria-hidden="true">n</span><span>Nimbus Nova</span></Link><nav aria-label="Navigare principală"><NavLink to="/" end>Acasă</NavLink><NavLink to="/poster">Sarcinile mele<ArrowUpRightIcon size={16} aria-hidden="true" /></NavLink><NavLink to="/admin">Administrare</NavLink></nav><ThemeToggle /></div></header><Routes><Route path="/" element={<LandingPage />} /><Route path="/poster" element={<PosterPage />} /><Route path="/admin" element={<AdminPage />} /><Route path="*" element={<NotFound />} /></Routes><footer className="site-footer"><div className="page-width footer-inner"><Link className="footer-brand" to="/">Nimbus Nova</Link><p>Demo pentru adulți. Fără plăți sau angajare.</p><Health /><span>© {new Date().getFullYear()} Nimbus Nova</span></div></footer></>;
}
