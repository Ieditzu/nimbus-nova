import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon, ArrowUpRightIcon, CaretDownIcon, ChatCircleDotsIcon, DeviceMobileIcon, HandCoinsIcon, IdentificationCardIcon,
  ListIcon, LockKeyIcon, MapPinIcon, ShieldCheckIcon, XIcon,
} from '@phosphor-icons/react';
import { api } from '../api/instance';
import { formatBani } from '../api/client';
import type { Category, TaskPublic } from '../api/types';
import { Health } from '../components/Health';
import { PlatformReviews } from '../components/PlatformReviews';
import { posterToken } from '../api/session';
import { ThemeToggle } from '../components/ThemeToggle';
import './landing.css';

const APP_URL = 'https://app.nimbusnova.cc';
const FEE_PERCENT = 5;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/* ------------------------------------------------------------------ hooks */

/** Elements with data-reveal fade in once. Nothing is hidden until this runs, so prerendered HTML stays readable. */
function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || !('IntersectionObserver' in window) || reduced()) return;
    el.dataset.anim = 'on';
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
    }), { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    el.querySelectorAll('[data-reveal]').forEach(node => io.observe(node));
    return () => { io.disconnect(); delete el.dataset.anim; };
  }, [root]);
}

function useScrollProgress(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        el.style.setProperty('--p', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
        el.classList.toggle('is-scrolled', window.scrollY > 40);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); cancelAnimationFrame(raf); };
  }, [root]);
}

function useParallax(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || reduced() || window.matchMedia('(pointer: coarse)').matches) return;
    let raf = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        el.style.setProperty('--mx', String((event.clientX - box.left) / box.width - 0.5));
        el.style.setProperty('--my', String((event.clientY - box.top) / box.height - 0.5));
      });
    };
    el.addEventListener('pointermove', move);
    return () => { el.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [root]);
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || reduced()) { setValue(to); return; }
    let raf = 0;
    setValue(0);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 1200);
        setValue(Math.round(to * (1 - (1 - progress) ** 3)));
        if (progress < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{new Intl.NumberFormat('ro-RO').format(value)}{suffix}</span>;
}

/* ---------------------------------------------------------------- stickers */

const outline = { stroke: '#000', strokeWidth: 3 } as const;

function Rocket() {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="20" fill="#fb4903" {...outline} /><path d="M50 14c-10 22-8 40-4 50h8c4-10 6-28-4-50z" fill="#fff" /><path d="M36 52l-10 10 4 4 10-10zM64 52l10 10-4 4-10-10z" fill="#fff" /><circle cx="50" cy="46" r="7" fill="#fb4903" stroke="#000" strokeWidth="2.5" /><path d="M50 78l-6 8h12z" fill="#ffd731" stroke="#000" strokeWidth="2.5" /></svg>;
}
function Coin() {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#ffd731" {...outline} /><circle cx="50" cy="50" r="32" fill="none" stroke="#000" strokeWidth="2.5" /><text x="50" y="62" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="34" fontWeight="700" fill="#000">N</text></svg>;
}
function Check() {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="22" fill="#55db9c" {...outline} /><path d="M24 52l18 18 34-40" fill="none" stroke="#000" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Wallet() {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="8" width="92" height="84" rx="18" fill="#5c4ade" {...outline} /><path d="M12 30h76" stroke="#000" strokeWidth="3" /><circle cx="50" cy="52" r="9" fill="#ffd731" {...outline} /></svg>;
}

function Ribbon({ className = '' }: { className?: string }) {
  const d = 'M60 150 C 220 40, 420 40, 600 100 C 780 160, 1000 170, 1140 80';
  return <div className={`lp-ribbon ${className}`} aria-hidden="true">
    <svg viewBox="0 0 1200 220" preserveAspectRatio="none">
      <path d={d} pathLength={1} stroke="#000" strokeWidth="96" />
      <path d={d} pathLength={1} stroke="#4da2ff" strokeWidth="86" />
      <path d="M60 138 C 220 30, 420 30, 600 90 C 780 148, 1000 158, 1140 70" pathLength={1} stroke="#9ecbff" strokeWidth="24" />
      <path d="M60 164 C 220 52, 420 52, 600 112 C 780 172, 1000 182, 1140 92" pathLength={1} stroke="#2e86e0" strokeWidth="18" />
    </svg>
  </div>;
}

/* -------------------------------------------------------------------- data */

const categoryMeta: Record<Category, { name: string; copy: string; tone: string; glyph: string }> = {
  event_setup: { name: 'Amenajare evenimente', copy: 'Scaune, mese și standuri. Câteva ore, într-un spațiu public.', tone: 'pink', glyph: 'EV' },
  light_moving: { name: 'Mutat obiecte ușoare', copy: 'Cutii și obiecte mici, fără urcat în locuințe.', tone: 'blue', glyph: 'MU' },
  shop_cover: { name: 'Acoperire în magazin', copy: 'Patru ore la un stand de cartier. Fără casă și fără numerar.', tone: 'yellow', glyph: 'SH' },
  other: { name: 'Altele', copy: 'Orice sarcină scurtă și sigură care nu încape în restul.', tone: 'lavender', glyph: 'NO' },
};

const steps = [
  { title: 'Postezi sarcina', copy: 'Titlu, oraș, interval de cel mult 12 ore și suma propusă. Durează câteva minute.', tone: 'blue' },
  { title: 'Oamenii aplică', copy: 'Cei cu timp liber văd sarcina în aplicația Nova și îți scriu de ce sunt potriviți.', tone: 'mint' },
  { title: 'Alegi și vorbești', copy: 'Accepți o candidatură și discuți detaliile în chatul privat din aplicație.', tone: 'yellow' },
  { title: 'Plata ajunge la lucrător', copy: 'Banii merg la cel care a făcut sarcina, nu la Nova. Nova doar vă pune în legătură și își ia comisionul. La final lăsați recenzii.', tone: 'lavender' },
];

const safety = [
  { icon: IdentificationCardIcon, title: 'Identitate verificată', copy: 'CI sau CEI și un selfie, înainte de a deschide un cont.' },
  { icon: HandCoinsIcon, title: 'Banii ajung direct la lucrător', copy: 'Nova nu ține banii, doar face legătura și își ia comisionul. Dacă apare o problemă, un moderator te ajută să o rezolvi.' },
  { icon: ChatCircleDotsIcon, title: 'Chat privat', copy: 'Discuți în aplicație, fără să-ți dai numărul sau adresa de la început.' },
  { icon: LockKeyIcon, title: 'Limite din start', copy: 'Fără numerar, fără acces la domiciliu, fără condus. Doar sarcini scurte, în spații publice.' },
];

const faq = [
  { q: 'Cine poate posta sarcini?', a: 'Oricine are cel puțin 16 ani și un cont verificat. La înscriere verificăm identitatea cu un act european și un selfie. Sub 16 ani nu se pot posta sarcini.' },
  { q: 'Unde aplică oamenii?', a: 'În aplicația mobilă Nova. Site-ul este pentru cei care postează: publici, primești candidaturi, accepți, plătești și dai recenzii.' },
  { q: 'Cât costă?', a: `Publici gratuit. Nova adaugă ${FEE_PERCENT}% comision peste suma propusă. Lucrătorul primește suma propusă. Poți vedea calculul mai sus.` },
  { q: 'Ce fel de sarcini sunt permise?', a: 'Sarcini scurte, de cel mult 12 ore, în spații publice: amenajări de evenimente, mutat obiecte ușoare, acoperire într-un stand sau magazin. Fără numerar, fără acces la domiciliu și fără condus.' },
  { q: 'Ce fac dacă ceva nu merge bine?', a: 'Deschide o dispută din sarcina respectivă. Un moderator Nova citește ambele părți și propune o soluție.' },
  { q: 'Pot participa și cei sub 16 ani?', a: 'Politica Nova limitează conturile sub 16 ani la activități de voluntariat, fără plată și cu implicarea tutorelui. Înscrierea actuală cere însă verificarea unui CI/CEI românesc; conturile pentru copiii care nu au un astfel de act nu sunt încă disponibile.' },
];

/* -------------------------------------------------------------------- page */

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [tasks, setTasks] = useState<TaskPublic[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [amount, setAmount] = useState(150);
  useReveal(root);
  useScrollProgress(root);
  useParallax(hero);

  useEffect(() => {
    let live = true;
    api.listOpenTasks().then(({ tasks: list }) => { if (live) setTasks(list); }).catch(() => { if (live) setTasks([]); });
    return () => { live = false; };
  }, []);

  const open = tasks ?? [];
  const cities = new Set(open.map(task => task.city.trim().toLocaleLowerCase('ro-RO'))).size;
  const shown = open.slice(0, 12);
  const track = shown.length > 0 && shown.length < 6 ? [...shown, ...shown, ...shown] : shown;
  const bani = amount * 100;
  const fee = Math.floor((bani * FEE_PERCENT + 50) / 100);

  return <div className="lp" ref={root}>
    <a className="lp-skip" href="#main-content">Mergi la conținut</a>
    <div className="lp-progress" aria-hidden="true" />

    <div className="lp-marquee" aria-hidden="true">
      <div className="lp-marquee-track">
        {[0].map(copy => <span key={copy}>Sarcini scurte <i>✦</i> Oameni aproape <i>✦</i> Plată directă <i>✦</i> De la 16 ani <i>✦</i> Postează în câteva minute <i>✦</i></span>)}
      </div>
    </div>

    <header className="lp-nav">
      <div className="lp-nav-pill">
        <Link className="lp-brand" to="/" aria-label="Nimbus Nova, pagina principală"><span className="lp-brand-mark" aria-hidden="true">N</span><span>Nova</span></Link>
        <nav className="lp-links" aria-label="Navigare principală">
          <a href="#cum-functioneaza">Cum funcționează</a>
          <a href="#tarif">Tarif</a>
          <a href="#siguranta">Siguranță</a>
          <a href="#intrebari">Întrebări</a>
          <Link to="/explore">Explorează</Link>
          <Link to="/suport">Suport</Link>
        </nav>
        <ThemeToggle />
        <a className="lp-btn is-small lp-nav-app" href={APP_URL}>Descarcă</a>
        <Link className="lp-btn is-small lp-nav-cta" to="/poster?new=1">Postează</Link>
        <button type="button" className="lp-menu-btn" aria-expanded={menu} aria-controls="lp-sheet" aria-label={menu ? 'Închide meniul' : 'Deschide meniul'} onClick={() => setMenu(value => !value)}>
          {menu ? <XIcon size={20} aria-hidden="true" /> : <ListIcon size={20} aria-hidden="true" />}
        </button>
      </div>
      {menu && <nav id="lp-sheet" className="lp-sheet" aria-label="Meniu">
        <a className="lp-btn" href={APP_URL}>Descarcă aplicația</a>
        {[['#cum-functioneaza', 'Cum funcționează'], ['#tarif', 'Tarif'], ['#siguranta', 'Siguranță'], ['#intrebari', 'Întrebări']].map(([href, label]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>)}
        <Link to="/explore">Explorează sarcini</Link>
        <Link to="/suport">Suport</Link>
        <Link to="/poster?new=1" className="lp-btn">Postează o sarcină</Link>
      </nav>}
    </header>

    <main id="main-content">
      {/* ----------------------------------------------------------- hero */}
      <section className="lp-hero" ref={hero}>
        <div className="lp-stickers" aria-hidden="true">
          <span className="lp-sticker is-rocket" style={{ '--depth': 46, '--rot': '-14deg' } as CSSProperties}><Rocket /></span>
          <span className="lp-sticker is-coin" style={{ '--depth': -34, '--rot': '10deg' } as CSSProperties}><Coin /></span>
          <span className="lp-sticker is-check" style={{ '--depth': 58, '--rot': '-8deg' } as CSSProperties}><Check /></span>
          <span className="lp-sticker is-wallet" style={{ '--depth': -50, '--rot': '8deg' } as CSSProperties}><Wallet /></span>
        </div>
        <p className="lp-pill lp-rise" style={delay(0)}>✦ Sarcini scurte · oameni aproape</p>
        <h1 className="lp-word">
          <span className="sr-only">Nova: sarcini scurte, oameni aproape</span>
          <span aria-hidden="true">{[...'NOVA'].map((letter, index) => <b key={index} style={delay(120 + index * 90)}>{letter}</b>)}</span>
        </h1>
        <Ribbon className="is-hero" />
        <p className="lp-tagline lp-rise" style={delay(520)}>Omul din mijloc dintre cine are timp și cine are o sarcină scurtă.</p>
        <p className="lp-sub lp-rise" style={delay(620)}>Postezi în câteva minute. Oamenii din orașul tău aplică din aplicație. Nova face legătura între voi.</p>
        <div className="lp-actions lp-rise" style={delay(720)}>
          <a className="lp-btn" href={APP_URL}>Descarcă aplicația<DeviceMobileIcon size={18} aria-hidden="true" /></a>
          <Link className="lp-btn" to="/poster?new=1">Postează o sarcină<ArrowRightIcon size={18} aria-hidden="true" /></Link>
          <Link className="lp-btn is-ghost" to="/explore">Vezi sarcinile deschise</Link>
        </div>
        {open.length > 0 && <p className="lp-live lp-rise" style={delay(820)} role="status"><span aria-hidden="true" />{open.length} {open.length === 1 ? 'sarcină deschisă' : 'sarcini deschise'} acum{cities > 1 ? `, în ${cities} orașe` : ''}</p>}
      </section>

      {/* --------------------------------------------------------- ticker */}
      {shown.length > 0 && <section className="lp-ticker" aria-label="Sarcini deschise acum">
        <div className="lp-ticker-track">
          {[0, 1].map(copy => <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
            {track.map((task, index) => {
              const meta = categoryMeta[task.category] ?? categoryMeta.other;
              return <li key={`${task.id}-${index}`}>
                <Link to="/explore" tabIndex={copy === 1 ? -1 : undefined} className={`lp-job is-${meta.tone}`}>
                  <span className="lp-job-tag">{meta.name}</span>
                  <b>{task.title}</b>
                  <span className="lp-job-foot"><span><MapPinIcon size={14} aria-hidden="true" />{task.city}</span><strong>{formatBani(task.amount_bani)}</strong></span>
                </Link>
              </li>;
            })}
          </ul>)}
        </div>
      </section>}

      {/* ---------------------------------------------------------- stats */}
      <section className="lp-stats" aria-label="Nova în cifre">
        <div className="lp-wrap">
          <dl>
            <div data-reveal style={delay(0)}><dt>Sarcini deschise acum</dt><dd>{tasks === null ? '—' : <CountUp to={open.length} />}</dd></div>
            <div data-reveal style={delay(80)}><dt>Orașe active</dt><dd>{tasks === null ? '—' : <CountUp to={cities} />}</dd></div>
            <div data-reveal style={delay(160)}><dt>Durata maximă</dt><dd><CountUp to={12} suffix="h" /></dd></div>
            <div data-reveal style={delay(240)}><dt>Comision Nova</dt><dd><CountUp to={FEE_PERCENT} suffix="%" /></dd></div>
          </dl>
        </div>
      </section>

      {/* ----------------------------------------------------- categories */}
      <section className="lp-section" id="categorii">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <p className="lp-eyebrow">Ce poți posta</p>
            <h2 className="lp-display">Mici treburi,<br />mari ajutoare</h2>
          </div>
          <ul className="lp-tiles">
            {(Object.keys(categoryMeta) as Category[]).map((key, index) => {
              const meta = categoryMeta[key];
              return <li key={key} className={`lp-tile is-${meta.tone}`} data-reveal style={delay(index * 90)}>
                <span className="lp-tile-glyph" aria-hidden="true">{meta.glyph}</span>
                <h3>{meta.name}</h3>
                <p>{meta.copy}</p>
              </li>;
            })}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ how */}
      <section className="lp-section is-gray" id="cum-functioneaza">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <p className="lp-eyebrow">Pas cu pas</p>
            <h2 className="lp-display">Cum<br />funcționează</h2>
            <Ribbon className="is-section" />
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => <li key={step.title} className="lp-step" data-reveal style={delay(index * 110)}>
              <span className={`lp-step-num is-${step.tone}`} aria-hidden="true">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>)}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- split */}
      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <article className="lp-card is-pink" data-reveal>
            <p className="lp-eyebrow">Ai o sarcină</p>
            <h2>Găsește pe cineva din cartier, azi.</h2>
            <ul>
              <li>Publici gratuit, fără abonament</li>
              <li>Vezi profilul și recenziile fiecărui candidat</li>
              <li>Plătești doar după ce te-ai înțeles</li>
            </ul>
            <Link className="lp-btn is-dark" to="/poster?new=1">Postează o sarcină<ArrowRightIcon size={18} aria-hidden="true" /></Link>
          </article>
          <article className="lp-card is-blue" data-reveal style={delay(120)}>
            <p className="lp-eyebrow">Ai timp liber</p>
            <h2>Alege o sarcină și aplică din telefon.</h2>
            <ul>
              <li>Sarcini scurte, de la două ore</li>
              <li>Chat privat cu cel care a postat</li>
              <li>Banii ajung direct la tine</li>
            </ul>
            <a className="lp-btn is-dark" href={APP_URL} target="_blank" rel="noopener noreferrer"><DeviceMobileIcon size={18} aria-hidden="true" />Deschide aplicația<ArrowUpRightIcon size={16} aria-hidden="true" /></a>
          </article>
        </div>
      </section>

      {/* ------------------------------------------------------- calculator */}
      <section className="lp-section is-gray" id="tarif">
        <div className="lp-wrap lp-calc">
          <div data-reveal>
            <p className="lp-eyebrow">Tarif</p>
            <h2 className="lp-display">Vezi exact<br />unde merg banii</h2>
            <p className="lp-lead">Tu propui suma. Nova adaugă {FEE_PERCENT}% comision peste ea. Lucrătorul primește suma propusă. Fără taxe ascunse.</p>
          </div>
          <div className="lp-calc-card" data-reveal style={delay(120)}>
            <label htmlFor="lp-amount">Suma propusă</label>
            <output htmlFor="lp-amount" className="lp-calc-amount">{formatBani(bani)}</output>
            <input id="lp-amount" type="range" min={20} max={1000} step={10} value={amount} onChange={event => setAmount(Number(event.target.value))} aria-valuetext={formatBani(bani)} />
            <div className="lp-calc-bar" aria-hidden="true"><span style={{ width: `${Math.round((bani / (bani + fee)) * 100)}%` }} /><span /></div>
            <dl>
              <div><dt><i className="is-worker" aria-hidden="true" />Lucrătorul primește</dt><dd>{formatBani(bani)}</dd></div>
              <div><dt><i className="is-fee" aria-hidden="true" />Comision Nova ({FEE_PERCENT}%)</dt><dd>{formatBani(fee)}</dd></div>
            </dl>
            <small>Exemplu de calcul pentru sume până la 1.000 RON. Plățile din această versiune sunt simulate.</small>
          </div>
        </div>
      </section>

      <PlatformReviews canWrite={posterToken() !== ''} />

      {/* --------------------------------------------------------- safety */}
      <section className="lp-section is-lavender" id="siguranta">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <p className="lp-eyebrow">Siguranță</p>
            <h2 className="lp-display">Limitele sunt<br />pornite din start</h2>
          </div>
          <ul className="lp-safety">
            {safety.map((item, index) => {
              const Icon = item.icon;
              return <li key={item.title} data-reveal style={delay(index * 90)}>
                <span className="lp-safety-icon"><Icon size={26} weight="bold" aria-hidden="true" /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </li>;
            })}
          </ul>
          <p className="lp-adults" data-reveal><ShieldCheckIcon size={20} weight="fill" aria-hidden="true" />Sarcini plătite de la 16 ani. Sub 16 ani, doar voluntariat.</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ faq */}
      <section className="lp-section" id="intrebari">
        <div className="lp-wrap lp-faq">
          <div className="lp-head" data-reveal>
            <p className="lp-eyebrow">Întrebări</p>
            <h2 className="lp-display">Ce ne<br />întreabă lumea</h2>
          </div>
          <div className="lp-faq-list">
            {faq.map((item, index) => <details key={item.q} data-reveal style={delay(index * 60)}>
              <summary>{item.q}<CaretDownIcon size={20} weight="bold" aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>)}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ cta */}
      <section className="lp-cta">
        <div className="lp-wrap">
          <h2 className="lp-cta-word" data-reveal>Postează<br />acum</h2>
          <p data-reveal style={delay(100)}>O sarcină bine descrisă primește primele candidaturi în scurt timp.</p>
          <div className="lp-actions" data-reveal style={delay(180)}>
            <Link className="lp-btn is-light" to="/poster?new=1">Postează o sarcină<ArrowRightIcon size={18} aria-hidden="true" /></Link>
            <Link className="lp-btn is-ghost-dark" to="/explore">Explorează sarcini</Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-inner">
        <Link className="lp-brand" to="/"><span className="lp-brand-mark" aria-hidden="true">N</span><span>Nimbus Nova</span></Link>
        <nav aria-label="Linkuri">
          <Link to="/explore">Explorează</Link>
          <Link to="/poster">Sarcinile mele</Link>
          <a href={APP_URL} target="_blank" rel="noopener noreferrer">Aplicația</a>
          <Link to="/suport">Suport</Link>
        </nav>
        <Health />
        <p>© {new Date().getFullYear()} Nimbus Nova · Sarcini scurte, prin contul tău.</p>
      </div>
    </footer>
  </div>;
}
