<h1 align="center">✦ Nova</h1>

<p align="center">
  <strong>Timpul tău liber. O sarcină scurtă. Nova la mijloc.</strong>
</p>

<p align="center">
  Micro-joburi · Servicii între persoane · Voluntariat · Un profil, mai multe zile
</p>

<p align="center">
  <a href="https://nimbusnova.cc"><img alt="Site live" src="https://img.shields.io/badge/Site-nimbusnova.cc-111111?style=for-the-badge" /></a>
  <a href="https://app.nimbusnova.cc"><img alt="Aplicația live" src="https://img.shields.io/badge/Aplicație-app.nimbusnova.cc-6366F1?style=for-the-badge" /></a>
  <a href="https://admin.nimbusnova.cc"><img alt="Biroul live" src="https://img.shields.io/badge/Birou-admin.nimbusnova.cc-F59E0B?style=for-the-badge" /></a>
</p>

<p align="center">
  <a href="#despre">Despre</a> ·
  <a href="#live">Live</a> ·
  <a href="#functionalitati">Cum merge</a> ·
  <a href="#categorii">Categorii</a> ·
  <a href="#bani">Bani</a> ·
  <a href="#stripe">Stripe</a> ·
  <a href="#siguranta">Siguranță</a> ·
  <a href="#echipa">Echipă</a>
</p>

---

<a id="despre"></a>

## 📱 Despre Nova

**Nova** stă între cine are timp și cine are o sarcină scurtă.

Postezi în câteva minute. Oamenii din orașul tău aplică din aplicație. Nova face legătura. Sarcinile sunt de cel mult 12 ore, în spații publice: amenajare de eveniment, mutat obiecte ușoare, acoperire într-un stand sau magazin.

> **Pe site:** sarcini plătite de la 16 ani. Sub 16 ani, doar voluntariat.

<a id="live"></a>

## 🌐 Deschide-l

| | |
| --- | --- |
| 🌍 Site | [nimbusnova.cc](https://nimbusnova.cc) |
| 📱 Aplicația | [app.nimbusnova.cc](https://app.nimbusnova.cc) |
| 🗂️ Birou | [admin.nimbusnova.cc](https://admin.nimbusnova.cc) |
| ⚙️ API | [api.nimbusnova.cc](https://api.nimbusnova.cc) |

Același produs, trei uși. Telefonul este pentru cine lucrează. Site-ul este pentru cine publică. Biroul este pentru cine ține platforma.

API-ul este Go, cu SQLite. Site-ul și biroul sunt React. Telefonul este Expo. Toate vorbesc cu același server. Un push pe `main` reconstruiește containerele de pe VPS.

<a id="functionalitati"></a>

## ⚡ Cum merge

1. **Postezi sarcina.** Titlu, oraș, interval de cel mult 12 ore și suma propusă. Publici gratuit.
2. **Oamenii aplică.** Cei cu timp liber văd sarcina în aplicația Nova și scriu de ce sunt potriviți.
3. **Alegi și vorbești.** Accepți o candidatură și discuți în chatul privat din aplicație.
4. **Plata ajunge la lucrător.** Banii merg la cel care a făcut sarcina. Nova își ia comisionul și vă pune în legătură. La final lăsați recenzii.

| Ce vezi | Ce înseamnă |
| --- | --- |
| 📍 Sarcini scurte | Cel mult 12 ore, în spații publice |
| 🪪 Cont verificat | CI sau CEI și un selfie, înainte să deschizi contul |
| 💬 Chat privat | Vorbești în aplicație, fără număr și fără adresă de la început |
| 💳 5% | Nova adaugă comisionul peste suma propusă. Lucrătorul primește suma propusă |
| ✨ Asistent | Schițează anunțul și caută. Publicarea rămâne a ta |

<a id="categorii"></a>

## 🧩 Ce poți face

### 🌱 Sub 16 ani

Doar voluntariat, fără plată, cu implicarea tutorelui. Nu pot posta sarcini. Înscrierea actuală cere un CI sau CEI românesc, așa că un cont pentru un copil fără acest act nu este încă disponibil.

### 🤝 De la 16 ani

Sarcini plătite. Poți posta dacă ai cont verificat, poți aplica din telefon, poți vedea suma și poți fi plătit.

### 📦 Sarcinile de pe site

- Amenajare evenimente: scaune, mese, standuri.
- Mutat obiecte ușoare: cutii și obiecte mici, fără urcat în locuințe.
- Acoperire în magazin: câteva ore la un stand de cartier.
- Altele: orice sarcină scurtă și sigură care nu încape în restul.

Fără numerar. Fără acces la domiciliu. Fără condus.

<a id="bani"></a>

## 💳 Banii

Tu propui suma pe care o primește lucrătorul. Nova adaugă **5% comision** la totalul plătit de cel care publică jobul. Publici gratuit, iar totalul este afișat înainte de publicare. Plățile din aplicație sunt momentan simulate.

| Suma propusă | Lucrătorul | Nova |
| --- | --- | --- |
| 20 RON | 17 RON | 3 RON |
| 100 RON | 85 RON | 15 RON |
| 250 RON | 212,50 RON | 37,50 RON |

Nova nu ține banii în mână. Face legătura și își ia comisionul. Plătești după ce te-ai înțeles. Până se salvează o cheie Stripe în birou, butonul Plătește scrie registrul în modul simulat: vezi sumele, nu pleacă un card real.

<a id="stripe"></a>

## 💸 Stripe

Integrarea este în cod. Nu este pornită.

Din [birou](https://admin.nimbusnova.cc), secțiunea **Sistem**, cardul Stripe primește cheia secretă, cheia publică și secretul de webhook. Se salvează doar pe server. Nu stă în git, nu se afișează din nou întreagă, și nu există nicio cheie în acest repo.

| Stare | Ce face butonul Plătește |
| --- | --- |
| Nicio cheie, sau caseta debifată | Rămâne simularea. Registrul se scrie local, provider `simulated` |
| Cheie `sk_test_` pornită | Se deschide Stripe Checkout. Registrul se ține până confirmă webhook-ul |
| Cheie `sk_live_` pornită | Aceeași cale, pe contul live |

Nu am conectat un cont Stripe. Echipa este de liceu și nu are un cont de comerciant. Judecătorul vede formularul și calea de cod. Ca să rămână simularea, nu se salvează nicio cheie.

Webhook-ul este `POST /v1/stripe/webhook`. Fără secret `whsec_` salvat, ruta răspunde că Stripe este oprit.

<a id="siguranta"></a>

## 🛡️ Siguranță

| | |
| --- | --- |
| Identitate verificată | CI sau CEI și un selfie, înainte de cont |
| Vârstă | Sarcini plătite de la 16 ani. Sub 16 ani, doar voluntariat |
| Chat privat | În aplicație, fără număr și fără adresă de la început |
| Limite | Fără numerar, fără domiciliu, fără condus. Doar sarcini scurte, în spații publice |
| Ceva nu merge | Deschizi o dispută. Un moderator citește ambele părți și propune o soluție |



<a id="echipa"></a>

## 👥 Echipa Nimbus Nova

| Membru | Rol | Ce a adus |
| --- | --- | --- |
| **Eduard Perjoc** | Team lead · Mobil | Conduce echipa. Aplicația de telefon |
| **Eduard Haivas** | Backend | API-ul, banii, identitatea, asistentul |
| **Radu Ciprian** | Web | Site-ul și fluxul celui care publică |
| **Eric Oprea Ștefan** | Cercetare | Conceptul și cazurile |
| **Barbaros Vladislav** | Research & design | Fezabilitatea și prezentarea |
| **Bogdan Șelaru** | Media | Limbajul și fața publică a proiectului |

## 🤖 Unelte

Codex și Claude au ajutat la cod. DeepSeek, pe server, schițează texte. Publicarea, plata și verificarea actului rămân ale omului.

---

<p align="center">
  <strong>Nova by Nimbus Nova</strong>
</p>

<p align="center">
  Conectăm timpul liber cu oamenii care au nevoie de el.
</p>

<p align="center">
  <a href="https://nimbusnova.cc">Site</a> ·
  <a href="https://app.nimbusnova.cc">Aplicație</a> ·
  <a href="https://admin.nimbusnova.cc">Birou</a> ·
  <a href="https://github.com/Ieditzu/nimbus-nova">GitHub</a>
</p>
