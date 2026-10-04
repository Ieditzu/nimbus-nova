import { Link } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon } from '@phosphor-icons/react';

const steps = [
  { number: '01', title: 'Publică sarcina', description: 'Spune ce trebuie făcut, unde și când.' },
  { number: '02', title: 'Alege persoana', description: 'Lucrătorii folosesc aplicația mobilă.' },
  { number: '03', title: 'Bifează: rezolvat', description: 'Finalizează sarcina și lasă o recenzie.' },
];

function ProcessStep({ number, title, description }: typeof steps[number]) {
  return <li><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p></li>;
}

export default function LandingPage() {
  return <main id="main-content" className="landing page-width">
    <section className="hero">
      <div className="hero-copy">
      <p className="eyebrow">Sarcini scurte. Timp câștigat.</p>
      <h1>Nimbus Nova</h1>
      <p className="hero-tagline">Mai puțin de făcut.<br />Mai mult timp.</p>
      <div className="hero-action"><p className="hero-description">Omul din mijloc dintre cine are timp și cine are o sarcină scurtă.</p><Link className="button button-primary" to="/poster">Postează o sarcină <ArrowRightIcon size={20} aria-hidden="true" /></Link></div>
      </div>
      <figure className="hero-photo"><img src="/images/community.webp" width="1200" height="900" alt="Trei prieteni stau de vorbă la o masă în aer liber." fetchPriority="high" /><figcaption>Mai mult timp pentru oamenii tăi.</figcaption></figure>
    </section>
    <section className="how-section" id="cum-functioneaza">
      <h2>O sarcină. Trei pași.</h2>
      <ol className="steps">{steps.map(step => <ProcessStep key={step.number} {...step} />)}</ol>
    </section>
    <section className="platform-story">
      <h2>Nova este omul din mijloc.</h2>
      <p>Nova ia cererea, alege omul, ține banii și predă lucrarea.</p>
      <p className="model-note">Acesta este modelul platformei. Demo-ul arată publicarea, alegerea și finalizarea unei sarcini, fără încasări.</p>
      <p className="demo-disclosure">Demo pentru adulți. Nu se încasează bani și nu se face angajare.</p>
    </section>
    <section className="boundaries"><div><p className="eyebrow">Limite clare</p><h2>Un ajutor de câteva ore.</h2><p>Sarcini locale, bine definite. Datele personale de contact nu sunt afișate celeilalte părți.</p></div><ul><li><CheckIcon size={20} aria-hidden="true" />Interval de cel mult 12 ore</li><li><CheckIcon size={20} aria-hidden="true" />Sumă propusă, fără încasări</li><li><CheckIcon size={20} aria-hidden="true" />Fără acces în locuințe sau manipulare de numerar</li></ul></section>
    <p className="photo-credit">Fotografie ilustrativă: <a href="https://unsplash.com/photos/a-group-of-people-sitting-outside-of-a-building-WVtFP7i8Pb0">Mineragua · Unsplash</a>.</p>
  </main>;
}
