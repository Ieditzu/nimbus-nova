🧬 Nimbus NovaPlatformă marketplace care conectează persoane adulte care au timp liber cu persoane sau companii ce au nevoie de ajutor pentru sarcini scurte și bine definite.📌 OverviewNimbus Nova funcționează ca un intermediar complet între utilizatorii care publică sarcini (Posters) și cei care le execută (Workers). Platforma gestionează profilurile, publicarea sarcinilor, aplicațiile, atribuirea, contractele-cadru, plățile simulate și istoricul activității, fără ca părțile să fie nevoite să schimbe între ele date private sau bani direct.Notă: Această versiune reprezintă un demo tehnologic. Nu se procesează bani reali și nu se creează raporturi juridice de muncă în mod automat.🔄 Ghid de utilizare Demo (Flux de lucru)Exemplul principal urmărit în versiunea demonstrativă:[ Poster (Andrei) ]                                    [ Worker (Maria) ]
        │                                                      │
        ├─ 1. Publică sarcină pe Web (2h, 100 RON) ───────────►│
        │                                                      ├─ 2. Vede sarcina & aplică din Mobile
        ├─ 3. Acceptă aplicația Mariei din Web ───────────────►│
        │                                                      ├─ 4. Vede sarcina ca fiind atribuită
        ├─ 5. Marchează sarcina drept finalizată ─────────────►│ (Plată simulată în ledger)
Andrei publică de pe website o sarcină de 2 ore, având suma propusă de 100 RON.Maria vede sarcina în aplicația mobilă și aplică.Andrei îi acceptă aplicația din dashboard-ul web.Maria primește notificarea și vede sarcina marcată ca Atribuită.Andrei marchează sarcina ca Finalizată, generând înregistrarea de plată simulată.✨ Funcționalități ImplementateToate funcționalitățile listate mai jos sunt conectate direct la API-ul real în versiunea curentă:Autentificare & Profiluri: Sesiuni, logout, gestionare profiluri pentru lucrători și posteri.Management Sarcini: Publicare, filtrare, căutare, atribuire, finalizare și anulare sarcini.Aplicații & Contracte: Aplicare la sarcini, acceptare/respingere, contract-cadru și ordine de lucru.Finanțe Simulate: Ledger intern, transferuri virtuale și înregistrare tranzacții.Reputație & Moderare: Sistem de recenzii, evaluări reciproc acordate, dispute gestionate de admin și operațiuni de moderare.Parteneri & Evenimente: Ture publicate de parteneri și evenimente de voluntariat cu diplome/participare.Demo Management: Posibilitate de resetare instantanee a bazei de date demo din panoul admin.🏗️ Arhitectură & TehnologiiRepository-ul este organizat sub formă de monorepo:.
├── api/          # Backend Go (REST API + SQLite)
├── web/          # Frontend React + Vite (Web App & Admin)
├── mobile/       # Cross-platform Mobile App (Expo / React Native)
├── deploy/       # Docker Compose & configurații Nginx
└── docs/         # Documentație tehnică și specificații API
Stiva TehnologicăModulTehnologii CheieDescriereAPI BackendGo 1.27, net/http standardFără framework-uri externe. Bază de date SQLite prin modernc.org/sqlite (fără CGO).Web FrontendReact 19, TypeScript, Vite, React RouterInterfață responsive în limba română, suport Light/Dark, prerendering pentru landing page.Mobile AppExpo 57, React Native, TypeScript, Expo RouterAplicație pentru lucrători, persistență securizată prin SecureStore (iOS/Android) și sessionStorage (Web).DeploymentDocker Compose, NginxProxy invers pentru /v1 și /health, volum de date SQLite persistat pe disc.📂 Structura Repository-uluiNimbus-Nova-/
├── api/                     # Backend API în Go
│   ├── integration_test.go  # Teste de integrare backend
│   └── ...
├── web/                     # Aplicația Web (React Router)
│   ├── src/                 # Pagini (/poster, /admin, landing page)
│   └── ...
├── mobile/                  # Aplicația Mobilă (Expo)
│   ├── app/                 # Rutare bazată pe fișiere (Expo Router)
│   └── ...
├── deploy/                  # Scripturi și containerizare
│   ├── docker-compose.yml   # Servicii Docker
│   ├── nginx.conf           # Configurație server web & reverse proxy
│   └── README.md
└── docs/                    # Documentație de proiect
    ├── PLATFORM.md          # Viziune și roadmap
    ├── PLAN.md              # Plan de dezvoltare
    └── agents/
        └── API-STATUS.md    # Sursa de adevăr pentru endpoint-uri
🚀 Ghid de Instalare și RulareCerințe PreliminareGo (versiunea 1.27 sau mai nouă)Node.js (LTS) & npmDocker și Docker Compose (pentru rulările containerizate)1. Rularea API-ului (Backend)cd api

# Pornire server API (implicit pe portul 8080)
go run .

# Rulare teste backend
go test ./...
2. Rularea Aplicației Webcd web

# Instalare dependențe
npm ci

# Pornire server de dezvoltare
npm run dev -- --port 5173

# Rulare teste și verificare build
npm test
npm run build
3. Rularea Aplicației Mobilecd mobile

# Instalare dependențe
npm install

# Pornire server Expo
npm start

# Verificări statice și teste
npm run typecheck
npm run lint
npm test
4. Rularea Întregului Demo cu DockerPuteți porni întregul stack (API + Web + Nginx Proxy) folosind configurarea Docker pregătită:docker compose -f deploy/docker-compose.yml up -d --build
Aplicația va fi accesibilă pe portul 80 (http://localhost).⚙️ Variabile de MediuBackend (api/)VariabilăDescriereValoare ImplicităPORTPortul pe care ascultă API-ul8080DATABASE_PATHCalea către fișierul SQLitenova.dbNOVA_DEMOActivează datele și operațiunile demo0 (Setați 1 pentru demo)Web (web/)VariabilăDescriereVITE_API_BASE_URLURL-ul de bază al API-ului backend (ex: http://localhost:8080)VITE_SITE_URLURL-ul public utilizat pentru canonical metadata și sitemapMobile (mobile/)VariabilăDescriereEXPO_PUBLIC_API_BASE_URLURL-ul API-ului accesibil din aplicația mobilă (necesar pentru dispozitive fizice)👥 Conturi și Actori Demo SeedSistemul include conturi predefinite atunci când opțiunea demo este activată (NOVA_DEMO=1):Poster Demo: poster-1Worker Demo: worker-1Administrator: admin-1⚠️ Siguranță, Limitări și PrincipiiVârstă Minimă: Munca plătită/atribuită este destinată exclusiv persoanelor de peste 18 ani. Minorii pot fi implicați exclusiv în activități din cadrul zonei de voluntariat.Plăți Simulate: Nu sunt procesate tranzacții financiare reale și nu se conectează la niciun furnizor bancar.Fără Statut Juridic: Proiectul este o demonstrație software și nu constituie o platformă autorizată de plăți, un angajator sau un furnizor de servicii juridice.Fără Parteneriate Externe: Aplicația nu are parteneriate confirmate cu companii terțe (precum Uber, Glovo, Tazz, eMAG, Lidl etc.).Verificare Identitate în Dezvoltare: Ecranul de captură al actului de identitate și selfie-ul sunt disponibile în scopul demonstrării fluxului UI. Înregistrarea conturilor noi este blocată intenționat, deoarece modulul backend de verificare facială nu este integrat/disponibil pentru producție.Verificarea Documentelor: Încărcarea documentelor de identitate necesită o conexiune HTTPS sigură și nu este pregătită pentru utilizare în medii de producție.Informații Reale: Nu au fost adăugate testimoniale fictive, cercetări false sau metrici fabricate de producție.📄 Documentație Tehnică și ResursePentru detalii suplimentare, consultați documentele din repository:docs/agents/API-STATUS.md – Sursa unică de adevăr pentru starea endpoint-urilor API disponibile.docs/PLATFORM.md – Viziunea pe termen lung, cazurile de utilizare și arhitectura propusă (roadmap).docs/PLAN.md – Planul de dezvoltare și etapele proiectului.deploy/README.md – Detalii avansate despre containerizare și orchestrare.web/README.md – Documentație specifică pentru frontend-ul web.mobile/README.md – Detalii de rulare și configurare pentru aplicația mobilă.🤝 ContribuțiiContribuțiile sunt binevenite! Vă rugăm să respectați regulile de dezvoltare specifice repository-ului:Asigurați-vă că testele API trec (go test ./... din api/).Verificați codul frontend și mobil (npm test, npm run typecheck și npm run lint).Deschideți un Pull Request cu o descriere clară a modificărilor efectuate.
