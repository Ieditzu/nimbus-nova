# Nimbus Nova

Nova stă la mijloc. Cine are o după-amiază liberă și cine are o sarcină scurtă nu se angajează unul pe altul și nu își dau telefonul. Amândoi trec prin Nova: profilul, anunțul, potrivirea, banii și istoricul rămân la platformă.

Construit pentru [VNU Hack 2026](https://vnuhack.com/), 4–5 octombrie, Colegiul Național de Informatică „Tudor Vianu”. Tema publică este „CONNECT THE DOTS”. Proba anunțată la eveniment este omul din mijloc, în sensul unei platforme cu două părți, nu al unui atac de rețea. Rezumatul regulilor este în [docs/VNU-HACK-RULES.md](docs/VNU-HACK-RULES.md). Regulamentul oficial rămâne [PDF-ul organizatorilor](https://vnuhack.com/regulament-vnu-hack.pdf).

Codul este pe [GitHub](https://github.com/Ieditzu/nimbus-nova). Un push pe `main` reconstruieste containerele de pe VPS.

## Descriere pentru predare

Secțiunea 5.3 cere, până la 5 octombrie, ora 12:00, o descriere scurtă cu problema, soluția, tehnologiile și contribuția fiecărui membru, plus prototipul și demo-ul live la stand. Organizatorii nu au publicat un formular separat pe site. Team lead-ul înregistrat depune textul de mai jos pe platforma VNU Hack, la help desk, sau pe canalul anunțat la eveniment. După ora 12:00 proiectul nu mai intră în jurizare, decât dacă o perioadă de grație a fost anunțată înainte de start.

### Problema

O după-amiază liberă și o sarcină scurtă nu se întâlnesc în siguranță. Oamenii își dau telefonul, adresa și banii în mână. Un minor poate fi tras într-o muncă plătită. Un magazin sau o persoană care are nevoie de ajutor pentru o zi nu are un strat la mijloc care să țină profilul, potrivirea și banii.

### Soluția

Nova este omul din mijloc. Cele două părți nu se angajează una pe alta. Amândouă trec prin Nova. Profilul, anunțul, potrivirea, banii și istoricul rămân la platformă. Munca plătită este de la 18 ani. Sub 18 ani există doar voluntariat, fără preț. Suma propusă stă la Nova până la finalizare sau până la decizia dintr-o dispută. Nu există numerar și nu există un parteneriat pretins cu Glovo, Tazz, Uber, Lidl sau eMAG.

Tema publică este „CONNECT THE DOTS”. Proba anunțată la eveniment este omul din mijloc, o platformă cu două părți, nu un atac de rețea. Nova leagă timpul liber de sarcina scurtă fără să lege datele private ale celor două persoane.

Prototipul care se predă este cel care rulează acum:

- [nimbusnova.cc](https://nimbusnova.cc)
- [app.nimbusnova.cc](https://app.nimbusnova.cc)
- [admin.nimbusnova.cc](https://admin.nimbusnova.cc)
- [api.nimbusnova.cc/health](https://api.nimbusnova.cc/health)

### Tehnologii

| Piesă | Cu ce este făcută | Credit |
| --- | --- | --- |
| API | Go, SQLite prin `modernc.org/sqlite`, `golang.org/x/crypto` | [Go](https://go.dev), [modernc sqlite](https://pkg.go.dev/modernc.org/sqlite), [Go crypto](https://pkg.go.dev/golang.org/x/crypto) |
| Site și birou | React, React Router, Vite, TypeScript | [React](https://react.dev) MIT, [React Router](https://reactrouter.com) MIT, [Vite](https://vite.dev) MIT, [TypeScript](https://www.typescriptlang.org) Apache-2.0 |
| Telefon | Expo și React Native, inclusiv export web | [Expo](https://expo.dev), [React Native](https://reactnative.dev) |
| Icoane și litere | Phosphor, Anton, Manrope | [Phosphor](https://phosphoricons.com) MIT, Anton și Manrope prin Fontsource, SIL OFL-1.1 |
| Hartă în telefon | Leaflet | [Leaflet](https://leafletjs.com) BSD-2-Clause |
| Identitate | ID Analyzer v2, doar pe server, doar dacă există cheie | Serviciu comercial. Cheia nu este în git |
| Schițe de text | DeepSeek, doar pe server | Serviciu comercial. Cheia nu este în git. Nu publică, nu plătește și nu verifică acte |
| Găzduire | VPS, Nginx, Cloudflare | Hosturile de mai sus |

Lista de localități este fișierul `api/internal/server/data/romania-localities.json`, folosit ca infrastructură ca să nu inventăm orașe. În repo nu există o notă de licență a sursei. Nu pretindem că lista este opera echipei.

### Contribuția fiecărui membru

Contribuțiile de mai jos sunt cele care se văd în git și în rolurile asumate. Nu inventăm research, pitch sau design care nu este în repo. Dacă un membru a lucrat în afara git, își corectează rândul înainte de predare.

| Membru | Ce se vede | Ce nu pretindem |
| --- | --- | --- |
| Eduard Haivas | API-ul, registrul, identitatea, asistentul, tichetele, deploy-ul și o parte mare din telefon și din legătura dintre ecrane, din conturile `Ieditzu` și `Kawase` | Nu este confirmat în regulament ca team lead. Lead-ul înregistrat depune proiectul |
| Radu Ciprian | Site-ul, în commit-urile `ciprixn`, doar în `web/` | Nu are commit-uri în API sau în telefon |
| Eduard Perjoc | Zona de telefon îi este atribuită în planul echipei | În acest repo nu există commit-uri pe numele lui. Istoricul de telefon împins este pe conturile lui Haivas |
| Barbaros Vladislav | A extins README-ul și a adăugat pagina din `download/` | Trei commit-uri, nu API și nu telefon |
| Eric Oprea Ștefan | Rol asumat: cercetare și cazuri de operare | Niciun commit pe numele lui în acest repo |
| Bogdan Șelaru | Rol asumat: limbaj, cazuri și documentație publică | Niciun commit pe numele lui în acest repo |

### Inteligență artificială

Folosirea este permisă de secțiunile 5.2 și VIII doar dacă este spusă explicit.

- Codex și alte unelte de cod au asistat scrierea, testele și o parte din acest README. Echipa a citit diferențele, a rulat testele și a decis regulile de produs: vârsta, escrow-ul, interzicerea numerarului și refuzul parteneriatelor inventate.
- DeepSeek primește un text redactat și întoarce o schiță: anunț, profil, căutare, verificare de siguranță, rezumat de dispută sau răspuns de suport. Nu apasă publicarea, nu mută bani și nu aprobă un act.
- Emailurile, telefoanele și șirurile de 13 cifre sunt scoase din text înainte de apel.
- Nu am folosit AI ca să inventăm interviuri, testimoniale sau parteneri.

### Ce am testat și ce este ipoteză

Testele din `api/integration_test.go` acoperă fluxul de demo, plata simulată, disputele, identitatea sintetică și tichetele de suport. Nu am făcut interviuri cu utilizatori și nu cităm feedback pe care nu îl avem. Ipoteza de produs este că un strat la mijloc reduce schimbul de telefon, adresă și numerar. Ipoteza nu este încă măsurată pe utilizatori reali. Plata live este simulată. Încadrarea fiscală și contractuală nu este o opinie juridică.

Fotografia de pe site, `web/public/images/community.webp`, este ilustrativă, de Mineragua Sparkling Water: [Unsplash](https://unsplash.com/photos/a-group-of-people-sitting-outside-of-a-building-WVtFP7i8Pb0), [licență Unsplash](https://unsplash.com/license). Nu înfățișează utilizatori sau parteneri Nova.

### La stand

Între 12:00 și 14:00 echipa completă stă la stand. Dacă lipsește cineva și absența nu a fost anunțată înainte, criteriul „Pitch și demonstrație” poate fi 0, iar persoana lipsă nu mai susține prezentarea. Demo-ul live, în ordine:

1. Pe [site](https://nimbusnova.cc), arată anunțurile deschise și că cele două părți nu își văd telefonul.
2. Pe [telefon](https://app.nimbusnova.cc), caută o sarcină și arată profilul reutilizabil.
3. Arată că o sarcină plătită nu este disponibilă sub 18 ani și că voluntariatul nu are sumă.
4. În [birou](https://admin.nimbusnova.cc), arată registrul și un tichet care cere un om.
5. Spune limita: plata este simulată, parteneriatele nu există, diploma nu este act școlar.

După ora 11:30 regulamentul permite doar documentație și prezentare, nu funcționalități noi.

## Unde rulează

| Ce | Adresă | Ce vezi |
| --- | --- | --- |
| Site | [nimbusnova.cc](https://nimbusnova.cc) | Pagina publică, explorarea sarcinilor și publicarea |
| Site, fără www | [www.nimbusnova.cc](https://www.nimbusnova.cc) | Aceeași pagină |
| Telefon în browser | [app.nimbusnova.cc](https://app.nimbusnova.cc) | Aplicația de lucrător: căutare, profil, aplicare, mesaje, suport |
| Birou | [admin.nimbusnova.cc](https://admin.nimbusnova.cc) | Panoul de administrare. Intrarea duce la `/admin` |
| API | [api.nimbusnova.cc](https://api.nimbusnova.cc) | Serverul Go. [Starea](https://api.nimbusnova.cc/health) răspunde `{"ok":true}` |

Producția are modul demo oprit. Conturile `poster-1`, `worker-1` și `admin-1` există doar când pornești API-ul local cu `NOVA_DEMO=1`. Pe site-ul live intri cu un cont real. Identitatea cere CI sau CEI plus un selfie; fără cheia furnizorului, verificarea răspunde că serviciul nu este disponibil și nu cere documentele.

## Pentru cine este

| Cine | Ce poate face | Ce nu face |
| --- | --- | --- |
| Lucrător, 18+ | Își lasă un profil reutilizabil și ia o sarcină plătită prin contractul cu Nova | Nu încasează numerar și nu semnează direct cu magazinul sau cu cel care a publicat |
| Persoană sau firmă care publică | Descrie o sarcină, alege omul și plătește suma propusă către Nova | Nu vede actul, adresa sau telefonul lucrătorului |
| Voluntar sub 18 ani | Se înscrie la un eveniment și poate primi diploma organizatorului | Nu vede preț, plată sau sarcină plătită |
| Organizator | Publică un eveniment fără bani, face prezența și închide participarea | Nu poate numi munca plătită voluntariat |
| Administrator | Moderează anunțuri, dispute, identitate și tichete | Nu mută bani fără un rând în registru |

Munca plătită începe de la 18 ani în regulile de produs. Sub 18 ani rămâne doar banda de voluntariat. Un anunț plătit relabelat ca voluntariat este respins, nu ocolit.

## Ce poți face acum

Fluxul care rulează, pe site și pe telefon:

1. Îți faci contul și treci verificarea de identitate.
2. Lucrătorul completează profilul: competențe, oraș, disponibilitate, o descriere scurtă.
3. Cine are nevoie de ajutor publică o sarcină: termen scurt, termen lung sau voluntariat. Suma este în bani, nu în lei cu zecimale libere.
4. Lucrătorul caută după oraș, categorie și cuvinte. Butonul cu steluță „Înțelege” propune filtrele, nu publică nimic.
5. Aplică cu un mesaj. Cel care a publicat vede candidaturile și acceptă una.
6. Conversația stă pe sarcină. Telefonul, adresa de acasă și cererea de numerar sunt semnalate. Mesajul tot poate pleca; semnalul nu șterge textul.
7. Plata simulată ține suma la Nova până la finalizare sau până la decizia dintr-o dispută.
8. După finalizare, fiecare parte poate lăsa o recenzie. Reputația publică este numărul și media, nu textul unei sarcini ascunse.

Exemplele din pitch rămân aceleași: ajuți pe cineva să mute o masă, acoperi o tură scurtă, sau te înscrii la un eveniment ca voluntar. Nume precum Glovo, Tazz, Uber sau Lidl sunt exemple de formă, nu parteneri activați. Un partener devine activ doar din birou, după un acord real.

## Banii

Posterul plătește suma propusă, nu suma plus comisionul. Din acea sumă, Nova reține 15%, rotunjit la ban întreg, jumătate în sus. Restul este plata lucrătorului.

Pentru 100,00 RON, adică 10000 bani:

- posterul este debitat cu 100,00 RON;
- lucrătorul are de primit 85,00 RON;
- Nova păstrează 15,00 RON.

Suma stă în escrow până când posterul marchează sarcina finalizată sau un administrator rezolvă disputa: eliberare, returnare sau împărțire. Voluntariatul nu are plată. Furnizorul de plată din demonstrație este simulat. Nu există încasare în mână și nu există transfer direct între cele două conturi.

Regulile de anulare, fiscalitatea și încadrarea contractuală trebuie verificate înainte de o lansare comercială. Ceea ce rulează acum este regula de produs, nu o opinie juridică.

## Suportul

Butonul **Suport** este pe site, jos în dreapta, și în aplicație, din Profil. Este disponibil doar după autentificare.

Asistentul răspunde în română și are o hartă a butoanelor reale: „Înțelege”, „Schițează anunțul”, „Verifică siguranța”, „Publică sarcina”, profilul, mesajele și biroul. Nu inventează o plată, un partener sau o verificare. Nu cere CNP, parolă sau poze de acte.

Dacă nu poate rezolva din explicație, tichetul trece în așteptare. În birou, la **Tichete**, badge-ul portocaliu pulsează până când un om răspunde. Răspunsul uman readuce tichetul la deschis și oprește pulsul. Un tichet al altui cont nu poate fi citit.

## Cele trei suprafețe

Toate vorbesc cu același API. Clientul nu ține o a doua copie a adevărului.

```text
telefon  ──┐
site     ──┼── HTTPS ── API Go ── SQLite
birou    ──┘
```

| Parte | Unde stă | Rol |
| --- | --- | --- |
| API | `api/` | Conturi, sarcini, bani, dispute, identitate, asistent, tichete |
| Site și pagină publică | `web/` | Cererea: publică, alege, plătește, închide |
| Telefon | `mobile/` | Oferta: profil, caută, aplică, mesaje |
| Birou | `web/src/admin/` | Oameni, sarcini, dispute, identitate, registru, tichete |
| Contractul JSON | `docs/agents/types.ts`, `docs/agents/client.ts` | Câmpurile nu se redenumesc. O rută `planned` nu se apelează |

Starea rutelor este în [docs/agents/API-STATUS.md](docs/agents/API-STATUS.md). Planul de produs, separat de felia care deja rulează, este în [docs/PLATFORM.md](docs/PLATFORM.md).

## Siguranță

- Actul și selfie-ul se verifică pe server. Celălalt utilizator nu primește documentul.
- Sub 18 ani, contul rămâne doar pentru voluntariat.
- Asistentul redactă emailuri, telefoane și șiruri de 13 cifre înainte să trimită textul mai departe.
- Un mesaj de pe o sarcină poate avertiza la telefon, adresă sau numerar. Avertismentul nu înlocuiește moderarea umană.
- Disputele îngheață banii până la o decizie din birou.
- Producția refuză antetul de demo. Resetul de demonstrație răspunde 404.

Verificarea de identitate reduce conturile false. Nu garantează comportamentul oamenilor și nu înlocuiește un acord semnat pe hârtie la eveniment.

## Cum pornești local

Îți trebuie Go, Node și npm. Din rădăcina repo-ului:

```sh
cd api && NOVA_DEMO=1 go run .
```

API-ul ascultă pe `http://127.0.0.1:8080`. `PORT` schimbă portul. Baza locală este `api/nova.db` și nu se comite.

Site-ul, în alt terminal:

```sh
cd web && npm install && npm run dev
```

Vite pornește pe `http://127.0.0.1:5173` și, pe localhost, vorbește cu API-ul local. În producție, site-ul și aplicația folosesc originea publică, nu `127.0.0.1`.

Telefonul:

```sh
cd mobile && npm install && npm run web
```

Pentru emulatorul Android, API-ul local este `http://10.0.2.2:8080`. Variabila este `EXPO_PUBLIC_API_BASE_URL`.

Testele care păzesc contractul:

```sh
cd api && go test -count=1 -timeout 180s ./...
cd web && npm test
cd mobile && npm run typecheck && npm test
```

Actorii de demo, doar local: `X-Demo-Actor: poster-1` pe site și `X-Demo-Actor: worker-1` pe telefon.

## Deploy

Detaliile de pe VPS sunt în [deploy/README.md](deploy/README.md). Pe scurt: site-ul stă în container pe portul local 8090, API-ul pe 8091, aplicația pe 8092. Nginx și Cloudflare expun hosturile de mai sus. Fișierul SQLite de producție rămâne în volumul `nova-data`. Parola de administrator și cheile de identitate și asistent nu sunt în git.

## Echipa

Șase oameni. Uneltele scriu cod doar după ce un membru îl citește și îl asumă.

| Membru | În cod | Ce ține |
| --- | --- | --- |
| Eduard Haivas | `api/` | Serverul, registrul, contractul JSON și starea rutelor |
| Radu Ciprian | `web/` | Site-ul și fluxul celui care publică |
| Eduard Perjoc | `mobile/` | Aplicația de telefon |
| Eric Oprea Ștefan | cercetare | Fezabilitate, cazuri și reguli de operare |
| Barbaros Vladislav | cercetare și verificare | Pitch, cazuri negative, proba că cele două părți se întâlnesc doar prin Nova |
| Bogdan Șelaru | limbaj și prezentare | Textele, cazurile pe care softul trebuie să le respecte, documentația publică |

## Ce nu pretindem

- Nu există un contract semnat cu Glovo, Tazz, Uber, Lidl sau eMAG. Sunt exemple de formă.
- Plata live este simulată. Un furnizor licențiat vine după lansare, nu în această demonstrație.
- Diploma de voluntariat este o înregistrare a organizatorului, nu un act școlar emis de Nova.
- Semnarea contractului-cadru este o acceptare înregistrată, nu o semnătură electronică calificată.
- Asistentul nu decide bani, nu verifică acte și nu înlocuiește un om când badge-ul pulsează.

Sursa regulilor de eveniment, dacă diferă de copia din repo, este anunțul organizatorilor.
