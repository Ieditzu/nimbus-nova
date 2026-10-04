# Nova by Nimbus Nova

Nova este o aplicație dezvoltată de Nimbus Nova, destinată tuturor, dar cu un focus special pe studenți și tineri care doresc să își genereze venituri suplimentare în timpul liber. Conceptul este simplu: dacă ți s-a eliberat o după-amiază, poți accesa aplicația, vizualiza "micro-joburile" sau favorurile disponibile, alegi ce ți se potrivește și ești plătit la finalizarea task-ului. Platforma facilitează conexiunea și reține un comision minim pentru serviciile oferite.

## Echipa și Contribuții

| Nume | Rol Principal | Contribuție Specifică |
| --- | --- | --- |
| **Eduard Perjoc** | Back-End Developer | Structural Engineer |
| **Eduard Haivas** | Back-End Developer | Structural Engineer |
| **Eric Oprea Ștefan** | Research & Back-End | Dezvoltarea conceptului și a ideii |
| **Barbaros Vladislav** | Research & Designer | Validarea fezabilității ideii |
| **Radu Ciprian** | Design & Back-End Dev | Main Designer |
| **Bogdan Șelaru** | Media & Design | Prezentare proiect & GitHub README |

## Categoriile de Servicii (Favoruri)

Nova structurează oportunitățile în trei categorii clare, pentru a acoperi toate aspectele legale și demografice:

* **A1: Voluntariat (Pentru Minori)**
Destinată utilizatorilor sub 16/18 ani. Aceste activități sunt neplătite și sunt efectuate exclusiv pentru acumularea de experiență, construirea unui portofoliu și obținerea de diplome de participare.
* **A2: Servicii P2P (Persoană la Persoană)**
Favoruri plătite între persoane fizice (ex. ajutor la mutat, transport, reparații minore). Platforma face doar conexiunea între utilizatori și facilitează plata, fără a implica semnarea unui contract de muncă.
* **A3: B2B / Muncă Temporară (Parteneriate Corporate)**
Destinată persoanelor care se încadrează în scutirile fiscale (sub 26 de ani, pensionari fără pensie specială sau angajați cu normă întreagă de 8h/zi). Utilizatorii semnează un contract direct cu firma noastră. Prin intermediul CV-ului universal din aplicație, utilizatorii pot prelua misiuni de o zi la companii partenere (ex. Lidl, Glovo, Uber). Funcționăm pe bază de Contract de Muncă Temporară: fiecare tură este o "misiune", iar între misiuni utilizatorul nu este taxat.

## Sistemul de Comisioane

Am structurat comisioanele astfel încât să fie mai avantajos să declari tranzacția reală în aplicație decât să recurgi la înțelegeri pe la spate:

* **Favoruri cu valoare 0 (Gratuite):** Se aplică o taxă fixă de 10 RON pentru a valida intenția și a combate munca la negru mascată sub formă de voluntariat.
* **Favoruri plătite:** Se aplică un comision fix de **3%** din valoarea tranzacției.
* **Comisionul minim** perceput de platformă este de 1 RON.

## Securitate și Comunicare (Anti-Fraudă)

Pentru a asigura un mediu sigur și a preveni ocolirea sistemului de comisioane:

* Comunicarea (chat-ul) între utilizatorul care postează anunțul și cel care aplică este blocată până la confirmarea (securizarea) tranzacției.
* Sistemul nu reține în avans suma totală a task-ului de pe card. Pentru a debloca task-ul, se procesează în avans exclusiv contravaloarea comisionului platformei (de exemplu, pentru un task de 100 RON, se rețin doar cei 3 RON aferenți comisionului). Astfel, ne asigurăm de validitatea intenției, fără a bloca sume mari de bani în escrow.
