import { Link } from 'react-router-dom';
import { ArrowRightIcon, DeviceMobileIcon, DesktopIcon, CheckIcon } from '@phosphor-icons/react';

export default function LandingPage() {
  return <>
    <main id="main-content">
      <section className="hero page-width">
        <div className="hero-copy">
          <h1>Nimbus Nova</h1>
          <p className="hero-tagline">Cineva are timp.<br />Tu ai o sarcină.</p>
          <p className="hero-description">Omul din mijloc dintre cine are timp și cine are o sarcină scurtă.</p>
          <Link className="button button-primary" to="/poster">Postează o sarcină <ArrowRightIcon size={20} aria-hidden="true" /></Link>
        </div>
        <div className="connection-diagram" aria-label="Publici pe website. Nova conectează cele două părți prin API. Lucrătorii aplică de pe mobil.">
          <div className="diagram-top"><span>Două părți. Un punct de întâlnire.</span><span className="diagram-tag">Prin Nova</span></div>
          <div className="participant participant-poster"><span className="participant-icon"><DesktopIcon size={27} aria-hidden="true" /></span><div><strong>Ai o sarcină</strong><span>O publici pe website</span></div></div>
          <div className="connector connector-top"><span>Publicare</span></div>
          <div className="nova-hub"><span className="hub-mark">n</span><strong>Nova</strong><span>Conectează cele două părți</span></div>
          <div className="connector connector-bottom"><span>Aplicare</span></div>
          <div className="participant participant-worker"><span className="participant-icon"><DeviceMobileIcon size={27} aria-hidden="true" /></span><div><strong>Ai câteva ore libere</strong><span>Aplici de pe mobil</span></div></div>
          <p className="diagram-note">De la prima candidatură până la recenzie,<br />totul trece prin platformă.</p>
        </div>
      </section>
      <div className="demo-strip page-width"><span className="demo-label">Un demo, pe bune.</span><p>Demo pentru adulți. Nu se încasează bani și nu se face angajare.</p></div>
      <section className="platform-story page-width"><h2>Nova este omul din mijloc.</h2><p>Nova ia cererea, alege omul, ține banii și predă lucrarea.</p><span>Acesta este modelul platformei. Demo-ul de acum arată publicarea, alegerea și finalizarea unei sarcini, fără încasări.</span></section>
      <section className="how-section page-width" id="cum-functioneaza">
        <div className="section-intro"><h2>De la „am nevoie de ajutor”<br />la „gata, am rezolvat”.</h2><p>Tu descrii sarcina. Nova ține candidaturile și pașii următori în același loc.</p></div>
        <ol className="steps"><li><span className="step-number">1</span><div><h3>Spune ce ai de făcut</h3><p>Alege orașul, intervalul și suma propusă. O descriere clară îi ajută pe oameni să știe la ce aplică.</p></div></li><li><span className="step-number">2</span><div><h3>Alege din candidaturi</h3><p>Lucrătorii folosesc aplicația mobilă. Vezi competențele și mesajele lor, apoi accepți o persoană.</p></div></li><li><span className="step-number">3</span><div><h3>Închide sarcina</h3><p>După ce sarcina este gata, o marchezi finalizată și poți lăsa o recenzie despre experiență.</p></div></li></ol>
      </section>
      <section className="boundaries page-width"><div><h2>Un ajutor mic.<br />Limite clare.</h2><p>Demo-ul este pentru adulți și sarcini locale bine definite. Datele personale de contact nu sunt afișate celeilalte părți.</p></div><ul><li><CheckIcon size={20} aria-hidden="true" />Interval de cel mult 12 ore</li><li><CheckIcon size={20} aria-hidden="true" />Sumă propusă, fără încasări</li><li><CheckIcon size={20} aria-hidden="true" />Fără acces în locuințe sau manipulare de numerar</li></ul></section>
    </main>
  </>;
}
