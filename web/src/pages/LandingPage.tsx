import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowClockwiseIcon, ArrowRightIcon, BookmarkSimpleIcon, CalendarBlankIcon, FunnelSimpleIcon, MagnifyingGlassIcon, MapPinIcon, PlusIcon, RowsIcon, SquaresFourIcon, StarIcon, XIcon } from '@phosphor-icons/react';
import { api } from '../api/instance';
import { formatBani } from '../api/client';
import type { Category, TaskPublic } from '../api/types';
import { categories } from '../lib/labels';
import { errorMessage, formatInterval } from '../lib/format';

type Sort = 'recent' | 'soon' | 'price-low' | 'price-high' | 'rating';
type Horizon = 'all' | 'today' | 'week';
const options: Array<{ id: Category | 'all'; label: string }> = [
  { id: 'all', label: 'Toate' }, { id: 'event_setup', label: 'Evenimente' },
  { id: 'light_moving', label: 'Mutări ușoare' }, { id: 'shop_cover', label: 'Magazine' }, { id: 'other', label: 'Altele' },
];
const dateLabel = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' });

function ListingCard({ task, saved, onSave, reputation }: { task: TaskPublic; saved: boolean; onSave: () => void; reputation?: { count: number; average: number } }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`feed-card feed-card-${task.category}`}>
    <div className="feed-card-top"><span className="feed-avatar" aria-hidden="true">{task.poster_name.slice(0, 1).toLocaleUpperCase('ro-RO')}</span><div><strong>{task.poster_name}</strong><span>Publicat {dateLabel.format(new Date(task.created_at))}{reputation && reputation.count > 0 && <> · <StarIcon size={11} weight="fill" aria-hidden="true" /> {reputation.average.toFixed(1)} ({reputation.count})</>}</span></div><button className="feed-save" aria-label={saved ? `Elimină ${task.title} din salvate` : `Salvează ${task.title}`} aria-pressed={saved} onClick={onSave}><BookmarkSimpleIcon size={21} weight={saved ? 'fill' : 'regular'} aria-hidden="true" /></button></div>
    <div className="feed-card-art" aria-hidden="true"><span>{categories[task.category]}</span><strong>{task.category === 'event_setup' ? 'EV' : task.category === 'light_moving' ? 'MU' : task.category === 'shop_cover' ? 'SH' : 'NO'}</strong><small>NOVA / {task.id.slice(-4).toUpperCase()}</small></div>
    <div className="feed-card-body"><div className="feed-card-title"><h3>{task.title}</h3><strong>{formatBani(task.amount_bani)}</strong></div><div className="feed-card-meta"><span><MapPinIcon size={16} aria-hidden="true" />{task.city}</span><span><CalendarBlankIcon size={16} aria-hidden="true" />{formatInterval(task.starts_at, task.ends_at)}</span></div>{expanded && <div className="feed-card-details" id={`feed-detail-${task.id}`}><p>{task.description}</p>{task.safety_note && <p><strong>Siguranță:</strong> {task.safety_note}</p>}<p>Lucrătorii folosesc aplicația mobilă pentru a candida.</p></div>}<button className="feed-details-button" aria-expanded={expanded} aria-controls={`feed-detail-${task.id}`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Ascunde detaliile' : 'Vezi detaliile'} <ArrowRightIcon size={17} aria-hidden="true" /></button></div>
  </article>;
}

export default function LandingPage() {
  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [city, setCity] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [columns, setColumns] = useState<1 | 2>(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [rating, setRating] = useState('all');
  const [reputations, setReputations] = useState<Record<string, { count: number; average: number }>>({});
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem('nova-saved-tasks') || '[]'); if (Array.isArray(value)) setSavedIds(value.filter((id): id is string => typeof id === 'string')); } catch { /* Invalid preference is harmless. */ } }, []);
  useEffect(() => { let current = true; api.listOpenTasks().then(({ tasks }) => { if (current) { setTasks(tasks); setError(''); setLoading(false); } }).catch(cause => { if (current) { setError(errorMessage(cause)); setLoading(false); } }); return () => { current = false; }; }, [reload]);
  useEffect(() => { let current = true; const ids = [...new Set(tasks.map(task => task.poster_id))]; Promise.allSettled(ids.map(id => api.getReputation(id))).then(results => { if (!current) return; const next: Record<string, { count: number; average: number }> = {}; results.forEach((result, index) => { if (result.status === 'fulfilled') next[ids[index]] = result.value; }); setReputations(next); }); return () => { current = false; }; }, [tasks]);
  const visible = useMemo(() => {
    const now = new Date();
    const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO');
    const lower = minPrice === '' ? null : Number(minPrice), upper = maxPrice === '' ? null : Number(maxPrice);
    return tasks.filter(task => {
      const start = new Date(task.starts_at);
      if (category !== 'all' && task.category !== category) return false;
      if (query && !fold(`${task.title} ${task.description} ${task.city} ${categories[task.category]}`).includes(fold(query.trim()))) return false;
      if (city && !fold(task.city).includes(fold(city.trim()))) return false;
      if (lower !== null && task.amount_bani < lower * 100) return false;
      if (upper !== null && task.amount_bani > upper * 100) return false;
      if (rating !== 'all' && (!reputations[task.poster_id]?.count || reputations[task.poster_id].average < Number(rating))) return false;
      if (horizon !== 'all') { const limit = new Date(now); if (horizon === 'today') limit.setHours(23, 59, 59, 999); else limit.setDate(limit.getDate() + 7); if (start < now || start > limit) return false; }
      return !savedOnly || savedIds.includes(task.id);
    }).sort((a, b) => sort === 'soon' ? Date.parse(a.starts_at) - Date.parse(b.starts_at) : sort === 'price-low' ? a.amount_bani - b.amount_bani : sort === 'price-high' ? b.amount_bani - a.amount_bani : sort === 'rating' ? ((reputations[b.poster_id]?.count ? reputations[b.poster_id].average : -1) - (reputations[a.poster_id]?.count ? reputations[a.poster_id].average : -1)) || Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [tasks, query, category, city, minPrice, maxPrice, horizon, rating, reputations, sort, savedOnly, savedIds]);
  const activeFilters = [city.trim(), minPrice.trim(), maxPrice.trim(), horizon !== 'all', rating !== 'all'].filter(Boolean).length;
  const reset = () => { setQuery(''); setCategory('all'); setCity(''); setMinPrice(''); setMaxPrice(''); setHorizon('all'); setRating('all'); setSort('recent'); setSavedOnly(false); };
  const toggleSaved = (id: string) => setSavedIds(current => { const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]; localStorage.setItem('nova-saved-tasks', JSON.stringify(next)); return next; });
  return <main id="main-content" className="feed-shell page-width">
    <section className="feed-intro"><div><p className="feed-kicker">NIMBUS NOVA <span>·</span> DESCOPERĂ</p><h1>Sarcini în jurul tău<span>.</span></h1><p>Lucruri de făcut, oameni aproape. Explorează anunțurile și găsește ce ți se potrivește.</p></div><Link className="button button-primary feed-post" to="/poster?new=1"><PlusIcon size={20} aria-hidden="true" /> Postează o sarcină</Link></section>
    <section className="feed-discovery" aria-label="Caută anunțuri"><label className="feed-search"><MagnifyingGlassIcon size={21} aria-hidden="true" /><span className="sr-only">Caută anunțuri</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Caută sarcini sau orașe" /></label><button className="feed-filter-trigger" aria-expanded={filtersOpen} aria-controls="feed-filters" onClick={() => setFiltersOpen(value => !value)}><FunnelSimpleIcon size={20} aria-hidden="true" />Filtre{activeFilters > 0 && <span>{activeFilters}</span>}</button></section>
    <div className="feed-categories" role="group" aria-label="Categorie">{options.map(option => <button key={option.id} aria-pressed={category === option.id} onClick={() => setCategory(option.id)}>{option.label}</button>)}</div>
    {filtersOpen && <section className="feed-filter-panel" id="feed-filters" aria-label="Filtre și ordonare"><div className="feed-filter-heading"><h2>Rafinează rezultatele</h2><button aria-label="Închide filtrele" onClick={() => setFiltersOpen(false)}><XIcon size={21} aria-hidden="true" /></button></div><div className="feed-filter-fields"><label>Oraș<input value={city} onChange={event => setCity(event.target.value)} placeholder="Orice oraș" /></label><label>Preț minim (RON)<input inputMode="decimal" type="number" min="0" value={minPrice} onChange={event => setMinPrice(event.target.value)} placeholder="0" /></label><label>Preț maxim (RON)<input inputMode="decimal" type="number" min="0" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} placeholder="Fără limită" /></label><label>Începe<select value={horizon} onChange={event => setHorizon(event.target.value as Horizon)}><option value="all">Oricând</option><option value="today">Astăzi</option><option value="week">În următoarele 7 zile</option></select></label><label>Rating autor<select value={rating} onChange={event => setRating(event.target.value)}><option value="all">Orice rating</option><option value="4">Cel puțin 4 stele</option><option value="4.5">Cel puțin 4,5 stele</option><option value="5">5 stele</option></select></label></div><div className="feed-filter-footer"><button className="text-button" onClick={reset}>Resetează filtrele</button><button className="button button-primary button-small" onClick={() => setFiltersOpen(false)}>Vezi {visible.length} {visible.length === 1 ? 'anunț' : 'anunțuri'}</button></div></section>}
    <section className="feed-results" aria-label="Anunțuri"><div className="feed-results-heading"><div><p className="eyebrow">EXPLOREAZĂ</p><h2>Anunțuri disponibile <span>{loading ? '…' : visible.length}</span></h2></div><button className="feed-saved-filter" aria-pressed={savedOnly} onClick={() => setSavedOnly(value => !value)}><BookmarkSimpleIcon size={18} weight={savedOnly ? 'fill' : 'regular'} aria-hidden="true" /> Salvate</button></div><div className="feed-sortbar"><label>Ordonează<select value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recent">Cele mai noi</option><option value="soon">Încep cel mai curând</option><option value="price-low">Preț crescător</option><option value="price-high">Preț descrescător</option><option value="rating">Rating autor</option></select></label><div className="feed-density" role="group" aria-label="Anunțuri pe rând"><button aria-label="Un anunț pe rând" aria-pressed={columns === 1} onClick={() => setColumns(1)}><RowsIcon size={19} aria-hidden="true" /></button><button aria-label="Două anunțuri pe rând" aria-pressed={columns === 2} onClick={() => setColumns(2)}><SquaresFourIcon size={19} aria-hidden="true" /></button></div></div>
    {loading ? <p className="feed-state" role="status">Se încarcă anunțurile…</p> : error ? <div className="feed-state" role="alert"><p>{error}</p><button className="button button-secondary button-small" onClick={() => { setLoading(true); setReload(value => value + 1); }}><ArrowClockwiseIcon size={18} aria-hidden="true" /> Reîncearcă</button></div> : visible.length === 0 ? <div className="feed-state"><p>{tasks.length ? 'Nu am găsit anunțuri pentru aceste filtre.' : 'Nu sunt anunțuri deschise acum.'}</p><button className="text-button" onClick={reset}>Șterge filtrele</button></div> : <div className={`feed-grid feed-grid-${columns}`}>{visible.map(task => <ListingCard key={task.id} task={task} reputation={reputations[task.poster_id]} saved={savedIds.includes(task.id)} onSave={() => toggleSaved(task.id)} />)}</div>}
    </section><section className="feed-about"><h2>Câteva ore pot face diferența.</h2><p>Omul din mijloc dintre cine are timp și cine are o sarcină scurtă. Nova ia cererea, alege omul, ține banii și predă lucrarea. Publici pe site. Oamenii aplică din aplicație.</p></section>
    <nav className="feed-bottom-nav" aria-label="Navigare pe telefon"><a href="#main-content"><MagnifyingGlassIcon size={23} aria-hidden="true" /><span>Explorează</span></a><button onClick={() => { setFiltersOpen(true); document.querySelector('.feed-discovery')?.scrollIntoView({ behavior: 'smooth' }); }}><FunnelSimpleIcon size={23} aria-hidden="true" /><span>Filtre</span></button><Link className="feed-bottom-post" to="/poster?new=1" aria-label="Postează o sarcină"><PlusIcon size={26} aria-hidden="true" /></Link><button aria-pressed={savedOnly} onClick={() => { setSavedOnly(true); document.querySelector('.feed-results')?.scrollIntoView({ behavior: 'smooth' }); }}><BookmarkSimpleIcon size={23} aria-hidden="true" /><span>Salvate</span></button><Link to="/poster"><span className="feed-mini-avatar">A</span><span>Contul meu</span></Link></nav>
  </main>;
}
