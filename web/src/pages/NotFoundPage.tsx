import { Link } from 'react-router-dom';
import { ArrowRightIcon, HouseIcon, SquaresFourIcon } from '@phosphor-icons/react';

export default function NotFoundPage() {
  return <main id="main-content" className="not-found page-width">
    <div className="not-found-art" aria-hidden="true"><span className="not-found-sun" /><span className="not-found-orbit" /><strong>404</strong><span className="not-found-stamp">NIMBUS NOVA · PAGINĂ NEGĂSITĂ</span></div>
    <div className="not-found-copy"><p className="eyebrow">Ups, un pas greșit.</p><h1>Pagina asta nu e aici.</h1><p className="not-found-description">Poate linkul s-a schimbat sau s-a strecurat o literă în plus. Anunțurile și sarcinile tale sunt în continuare la locul lor.</p><div className="not-found-actions"><Link className="button button-primary" to="/"><HouseIcon size={19} aria-hidden="true" />Vezi anunțurile<ArrowRightIcon size={18} aria-hidden="true" /></Link><Link className="button button-secondary" to="/poster"><SquaresFourIcon size={19} aria-hidden="true" />Sarcinile mele</Link></div><p className="not-found-tip">Dacă ai primit un link către o sarcină, cere expeditorului adresa actualizată.</p></div>
  </main>;
}
