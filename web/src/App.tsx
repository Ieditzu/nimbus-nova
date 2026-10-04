import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ListIcon, XIcon } from '@phosphor-icons/react';
import { Health } from './components/Health';
import { ThemeToggle } from './components/ThemeToggle';
import LandingPage from './pages/LandingPage';
import './pages/site.css';
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

/** Shared header and footer for the working pages, in the landing's visual language. Landing and admin bring their own chrome. */
function SiteFrame({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  return <div className="st">
    <a className="lp-skip" href="#main-content">Mergi la conținut</a>
    <header className="lp-nav">
      <div className="lp-nav-pill">
        <Link className="lp-brand" to="/" aria-label="Nimbus Nova, pagina principală"><span className="lp-brand-mark" aria-hidden="true">N</span><span>Nova</span></Link>
        <nav className="lp-links" aria-label="Navigare principală">
          <NavLink to="/" end>Acasă</NavLink>
          <NavLink to="/explore">Explorează</NavLink>
          <NavLink to="/poster">Sarcinile mele</NavLink>
        </nav>
        <ThemeToggle />
        <Link className="lp-btn is-small lp-nav-cta" to="/poster?new=1">Postează</Link>
        <button type="button" className="lp-menu-btn" aria-expanded={menu} aria-controls="st-sheet" aria-label={menu ? 'Închide meniul' : 'Deschide meniul'} onClick={() => setMenu(value => !value)}>
          {menu ? <XIcon size={20} aria-hidden="true" /> : <ListIcon size={20} aria-hidden="true" />}
        </button>
      </div>
      {menu && <nav id="st-sheet" className="lp-sheet" aria-label="Meniu">
        <Link to="/">Acasă</Link>
        <Link to="/explore">Explorează</Link>
        <Link to="/poster">Sarcinile mele</Link>
        <Link to="/poster?new=1" className="lp-btn">Postează o sarcină</Link>
      </nav>}
    </header>
    {children}
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-inner">
        <Link className="lp-brand" to="/"><span className="lp-brand-mark" aria-hidden="true">N</span><span>Nimbus Nova</span></Link>
        <nav aria-label="Linkuri">
          <Link to="/explore">Explorează</Link>
          <Link to="/poster">Sarcinile mele</Link>
          <Link to="/confidentialitate">Confidențialitate</Link>
          <Link to="/termeni">Termeni și condiții</Link>
        </nav>
        <Health />
        <p>© {new Date().getFullYear()} Nimbus Nova · Sarcini scurte, prin contul tău.</p>
      </div>
    </footer>
  </div>;
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
