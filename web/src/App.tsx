import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import { Health } from './components/Health';
import { ThemeToggle } from './components/ThemeToggle';
import LandingPage from './pages/LandingPage';
import PosterPage from './pages/PosterPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import NotFoundPage from './pages/NotFoundPage';
import AdminPage from './admin/AdminPage';

function Metadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pathname === '/' ? 'Nimbus Nova | Sarcini scurte, prin Nova' : pathname === '/poster' ? 'Sarcinile mele | Nimbus Nova' : pathname === '/admin' ? 'Administrare | Nimbus Nova' : pathname === '/confidentialitate' ? 'Confidențialitate | Nimbus Nova' : pathname === '/termeni' ? 'Termeni și condiții | Nimbus Nova' : 'Pagina nu există | Nimbus Nova';
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    robots.content = pathname === '/' ? 'index,follow' : 'noindex,nofollow';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.hidden = pathname !== '/';
    if (pathname !== '/') canonical?.remove();
    else if (import.meta.env.VITE_SITE_URL && !canonical) {
      const link = document.createElement('link'); link.rel = 'canonical'; link.href = import.meta.env.VITE_SITE_URL.replace(/\/+$/, '') + '/'; document.head.append(link);
    }
    document.querySelector('meta[name="description"]')?.setAttribute('content', pathname === '/' ? 'Descoperă sarcini scurte în orașul tău și publică un anunț prin Nimbus Nova.' : pathname === '/poster' ? 'Publică sarcini scurte și gestionează candidaturile.' : pathname === '/confidentialitate' ? 'Cum folosește demonstrația Nimbus Nova datele personale și ce informații trebuie completate înainte de lansare.' : pathname === '/termeni' ? 'Regulile de folosire pentru demonstrația Nimbus Nova.' : 'Nimbus Nova.');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  return <><Metadata /><a className="skip-link" href="#main-content">Mergi la conținut</a><header className="site-header"><div className="page-width header-inner"><Link to="/" className="brand" aria-label="Nimbus Nova, pagina principală"><span className="brand-mark" aria-hidden="true">n</span><span>Nimbus Nova</span></Link><nav aria-label="Navigare principală"><NavLink to="/" end>Acasă</NavLink><NavLink to="/poster">Sarcinile mele<ArrowUpRightIcon size={16} aria-hidden="true" /></NavLink><NavLink to="/admin">Administrare</NavLink></nav><ThemeToggle /></div></header><Routes><Route path="/" element={<LandingPage />} /><Route path="/poster" element={<PosterPage />} /><Route path="/admin" element={<AdminPage />} /><Route path="/confidentialitate" element={<PrivacyPage />} /><Route path="/termeni" element={<TermsPage />} /><Route path="*" element={<NotFoundPage />} /></Routes><footer className="site-footer"><div className="page-width footer-inner"><Link className="footer-brand" to="/">Nimbus Nova</Link><p>Sarcini scurte, prin contul tău.</p><nav className="footer-legal" aria-label="Informații legale"><Link to="/confidentialitate">Confidențialitate</Link><Link to="/termeni">Termeni și condiții</Link></nav><Health /><span>© {new Date().getFullYear()} Nimbus Nova</span></div></footer></>;
}
