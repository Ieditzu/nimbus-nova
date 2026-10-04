import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, XIcon } from '@phosphor-icons/react';
import { initials, statusLabel, tone } from './format';

export function Pill({ value, label }: { value: string; label?: string }) {
  return <span className={`dk-pill is-${tone(value)}`}>{label ?? statusLabel[value] ?? (value || '—')}</span>;
}

export function Avatar({ name, size = 'md', hue }: { name: string; size?: 'sm' | 'md' | 'lg'; hue?: number }) {
  const colours = ['blue', 'mint', 'lavender', 'yellow', 'pink'];
  const index = hue ?? [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colours.length;
  return <span className={`dk-avatar is-${size} is-${colours[index]}`} aria-hidden="true">{initials(name)}</span>;
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  numeric?: boolean;
  hideSm?: boolean;
};

export function DataTable<T>({ rows, columns, rowKey, onOpen, label, pageSize = 20, selected, onSelect, empty = 'Nimic de arătat aici.' }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  label: string;
  pageSize?: number;
  selected?: Set<string>;
  onSelect?: (next: Set<string>) => void;
  empty?: string;
}) {
  const [sortKey, setSortKey] = useState('');
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const getter = columns.find(column => column.key === sortKey)?.sort;
    if (!getter) return rows;
    return [...rows].sort((a, b) => {
      const x = getter(a), y = getter(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ro')) * dir;
    });
  }, [rows, columns, sortKey, dir]);
  useEffect(() => setPage(0), [rows.length, sortKey, dir]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * pageSize, current * pageSize + pageSize);
  if (rows.length === 0) return <div className="dk-empty"><span aria-hidden="true">∅</span><p>{empty}</p></div>;
  const shownKeys = shown.map(rowKey);
  const allShown = !!selected && shownKeys.length > 0 && shownKeys.every(key => selected.has(key));
  function toggleAll() {
    if (!selected || !onSelect) return;
    const next = new Set(selected);
    shownKeys.forEach(key => (allShown ? next.delete(key) : next.add(key)));
    onSelect(next);
  }
  function sortBy(key: string) {
    if (sortKey === key) setDir(value => (value === 1 ? -1 : 1));
    else { setSortKey(key); setDir(1); }
  }
  return <div className="dk-table-card">
    <div className="dk-table-scroll">
      <table className="dk-table" aria-label={label}>
        <thead><tr>
          {selected && <th className="dk-check"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Selectează pagina" /></th>}
          {columns.map(column => <th key={column.key} className={`${column.numeric ? 'num' : ''} ${column.hideSm ? 'hide-sm' : ''}`} aria-sort={sortKey === column.key ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
            {column.sort ? <button type="button" onClick={() => sortBy(column.key)}>{column.header}{sortKey === column.key ? (dir === 1 ? <CaretUpIcon size={12} aria-hidden="true" /> : <CaretDownIcon size={12} aria-hidden="true" />) : <span className="dk-sort-hint" aria-hidden="true">↕</span>}</button> : column.header}
          </th>)}
        </tr></thead>
        <tbody>{shown.map(row => {
          const key = rowKey(row);
          return <tr key={key} className={onOpen ? 'is-link' : undefined} tabIndex={onOpen ? 0 : undefined}
            onClick={event => { if (onOpen && !(event.target as HTMLElement).closest('button,a,input,label')) onOpen(row); }}
            onKeyDown={event => { if (onOpen && event.key === 'Enter' && event.target === event.currentTarget) onOpen(row); }}>
            {selected && onSelect && <td className="dk-check"><input type="checkbox" checked={selected.has(key)} aria-label="Selectează rândul" onChange={() => { const next = new Set(selected); if (next.has(key)) next.delete(key); else next.add(key); onSelect(next); }} /></td>}
            {columns.map(column => <td key={column.key} className={`${column.numeric ? 'num' : ''} ${column.hideSm ? 'hide-sm' : ''}`}>{column.cell(row)}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="dk-table-foot">
      <span>{current * pageSize + 1}–{current * pageSize + shown.length} din {rows.length}</span>
      {pages > 1 && <div className="dk-pager">
        <button type="button" className="dk-icon-btn" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Pagina anterioară"><CaretLeftIcon size={16} aria-hidden="true" /></button>
        <span>{current + 1} / {pages}</span>
        <button type="button" className="dk-icon-btn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Pagina următoare"><CaretRightIcon size={16} aria-hidden="true" /></button>
      </div>}
    </div>
  </div>;
}

/** Native <dialog> gives focus trapping and Escape handling for free. */
export function Dialog({ open, onClose, title, children, variant = 'modal', footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; variant?: 'modal' | 'drawer' | 'palette'; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`dk-dialog is-${variant}`} aria-labelledby={titleId} onClose={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    {open && <div className="dk-dialog-inner">
      <header className="dk-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="dk-icon-btn" onClick={onClose} aria-label="Închide"><XIcon size={18} aria-hidden="true" /></button></header>
      <div className="dk-dialog-body">{children}</div>
      {footer && <footer className="dk-dialog-foot">{footer}</footer>}
    </div>}
  </dialog>;
}

export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: Array<{ id: T; label: string; count?: number }>; label: string }) {
  return <div className="dk-chips" role="group" aria-label={label}>{options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
    {option.label}{option.count !== undefined && <span>{option.count}</span>}
  </button>)}</div>;
}

export function Search({ value, onChange, placeholder, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return <label className="dk-search"><span className="sr-only">{placeholder}</span>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    <input ref={inputRef} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} data-desk-search />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Golește căutarea"><XIcon size={14} aria-hidden="true" /></button>}
  </label>;
}

export function BarChart({ points, format, label }: { points: Array<{ label: string; value: number }>; format: (value: number) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map(point => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const active = hover ?? points.length - 1;
  return <figure className="dk-chart" aria-label={label}>
    <div className="dk-chart-readout" aria-live="polite"><strong>{format(points[active]?.value ?? 0)}</strong><span>{points[active]?.label} · total {format(total)}</span></div>
    <div className="dk-bars" onMouseLeave={() => setHover(null)}>
      {points.map((point, index) => <button type="button" key={point.label + index} className={index === active ? 'is-active' : undefined}
        style={{ '--h': `${Math.max(point.value / max, point.value ? 0.04 : 0.015)}`, '--i': index } as React.CSSProperties}
        onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} aria-label={`${point.label}: ${format(point.value)}`}><span /></button>)}
    </div>
    <div className="dk-bars-axis" aria-hidden="true"><span>{points[0]?.label}</span><span>{points[points.length - 1]?.label}</span></div>
  </figure>;
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const path = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / max) * 26 - 2}`).join(' ');
  return <svg className="dk-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={path} fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}

const donutColours = ['var(--dk-blue)', 'var(--dk-mint)', 'var(--dk-yellow)', 'var(--dk-lavender)', 'var(--dk-pink)', 'var(--dk-orange)'];

export function Donut({ segments, label, centre }: { segments: Array<{ label: string; value: number }>; label: string; centre: ReactNode }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = segments.map((segment, index) => {
    const start = cursor; cursor += total ? (segment.value / total) * 360 : 0;
    return `${donutColours[index % donutColours.length]} ${start}deg ${cursor}deg`;
  });
  return <figure className="dk-donut-wrap" aria-label={label}>
    <div className="dk-donut" style={{ background: total ? `conic-gradient(${stops.join(',')})` : 'var(--dk-soft)' }}><div>{centre}</div></div>
    <ul className="dk-legend">{segments.map((segment, index) => <li key={segment.label}><i style={{ background: donutColours[index % donutColours.length] }} />{segment.label}<b>{segment.value}</b></li>)}</ul>
  </figure>;
}

export function Meters({ rows, format = String }: { rows: Array<{ label: string; value: number; hint?: string }>; format?: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <p className="dk-muted">Încă nu există date.</p>;
  return <ul className="dk-meters">{rows.map((row, index) => <li key={row.label}>
    <div><span>{row.label}</span><b>{format(row.value)}</b></div>
    <span className="dk-meter"><span style={{ '--w': row.value / max, '--i': index } as React.CSSProperties} /></span>
    {row.hint && <small>{row.hint}</small>}
  </li>)}</ul>;
}

export function Section({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dk-panel ${className}`}><header className="dk-panel-head"><h2>{title}</h2>{action}</header>{children}</section>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="dk-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
