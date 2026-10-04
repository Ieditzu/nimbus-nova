import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import { Health } from './components/Health';
import { ThemeToggle } from './components/ThemeToggle';
import LandingPage from './pages/LandingPage';
import NotFoundPage from './pages/NotFoundPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const PosterPage = lazy(() => import('./pages/PosterPage'));
const AdminPage = lazy(() => import('./admin/AdminPage'));

const pages: Record<string, { title: string; description: string; index: boolean }> = {
  '/': {
    title: 'Nimbus Nova | Sarcini scurte, prin Nova',
    description: 'Omul din mijloc dintre cine are timp și cine are o sarcină scurtă. Publică o sarcină, primești candidaturi și plătești prin Nimbus Nova. Doar pentru adulți.',
    index: true,
  },
  '/explore': { title: 'Explorează sarcini | Nimbus Nova', description: 'Sarcini scurte deschise acum, în orașul tău.', index: true },
  '/poster': { title: 'Sarcinile mele | Nimbus Nova', description: 'Publică sarcini scurte și gestionează candidaturile.', index: false },
  '/admin': { title: 'Biroul Nova | Nimbus Nova', description: 'Nimbus Nova.', index: false },
  '/confidentialitate': { title: 'Confidențialitate | Nimbus Nova', description: 'Cum folosește demonstrația Nimbus Nova datele personale și ce informații trebuie completate înainte de lansare.', index: true },
  '/termeni': { title: 'Termeni și condiții | Nimbus Nova', description: 'Regulile de folosire pentru demonstrația Nimbus Nova.', index: true },
};

function Metadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = pages[pathname] ?? { title: 'Pagina nu există | Nimbus Nova', description: 'Nimbus Nova.', index: false };
    document.title = page.title;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    robots.content = page.index ? 'index,follow' : 'noindex,nofollow';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (pathname !== '/') canonical?.remove();
    else if (import.meta.env.VITE_SITE_URL && !canonical) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = import.meta.env.VITE_SITE_URL.replace(/\/+$/, '') + '/';
      document.head.append(link);
    }
    document.querySelector('meta[name="description"]')?.setAttribute('content', page.description);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

/** Shared header and footer for the working pages. Landing and admin bring their own chrome. */
function SiteFrame({ children }: { children: ReactNode }) {
  return <>
    <a className="skip-link" href="#main-content">Mergi la conținut</a>
    <header className="site-header"><div className="page-width header-inner">
      <Link to="/" className="brand" aria-label="Nimbus Nova, pagina principală"><span className="brand-mark" aria-hidden="true">n</span><span>Nimbus Nova</span></Link>
      <nav aria-label="Navigare principală">
        <NavLink to="/" end>Acasă</NavLink>
        <NavLink to="/explore">Explorează</NavLink>
        <NavLink to="/poster">Sarcinile mele<ArrowUpRightIcon size={16} aria-hidden="true" /></NavLink>
      </nav>
      <ThemeToggle />
    </div></header>
    {children}
    <footer className="site-footer"><div className="page-width footer-inner">
      <Link className="footer-brand" to="/">Nimbus Nova</Link>
      <p>Sarcini scurte, prin contul tău.</p>
      <nav className="footer-legal" aria-label="Informații legale"><Link to="/confidentialitate">Confidențialitate</Link><Link to="/termeni">Termeni și condiții</Link></nav>
      <Health />
      <span>© {new Date().getFullYear()} Nimbus Nova</span>
    </div></footer>
  </>;
}

export default function App() {
  return <>
    <Metadata />
    <Suspense fallback={<p className="loading" role="status"><span className="spinner" aria-hidden="true" />Se încarcă…</p>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/explore" element={<SiteFrame><ExplorePage /></SiteFrame>} />
      <Route path="/poster" element={<SiteFrame><PosterPage /></SiteFrame>} />
      <Route path="/confidentialitate" element={<SiteFrame><PrivacyPage /></SiteFrame>} />
      <Route path="/termeni" element={<SiteFrame><TermsPage /></SiteFrame>} />
      <Route path="*" element={<SiteFrame><NotFoundPage /></SiteFrame>} />
    </Routes>
    </Suspense>
  </>;
}
