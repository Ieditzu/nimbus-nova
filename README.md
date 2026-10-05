# Nimbus Nova

Nova stă la mijloc. Cine are o după-amiază liberă și cine are o sarcină scurtă nu se angajează unul pe altul și nu își dau telefonul. Amândoi trec prin Nova: profilul, anunțul, potrivirea, banii și istoricul rămân la platformă.

Construit pentru [VNU Hack 2026](https://vnuhack.com/), 4–5 octombrie, Colegiul Național de Informatică „Tudor Vianu”. Tema publică este „CONNECT THE DOTS”. Proba anunțată la eveniment este omul din mijloc, în sensul unei platforme cu două părți, nu al unui atac de rețea. Rezumatul regulilor este în [docs/VNU-HACK-RULES.md](docs/VNU-HACK-RULES.md). Regulamentul oficial rămâne [PDF-ul organizatorilor](https://vnuhack.com/regulament-vnu-hack.pdf).

Codul este pe [GitHub](https://github.com/Ieditzu/nimbus-nova). Un push pe `main` reconstruieste containerele de pe VPS.

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
