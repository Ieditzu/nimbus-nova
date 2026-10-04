# Nova — pagină de descărcare a aplicației

Site static (HTML + CSS + JS, fără build) de unde se descarcă aplicația **Nova**.
Designul copiază sistemul „Slush" de pe [Refero Styles](https://styles.refero.design/style/8b6b547f-a357-4f1b-9842-4579c62dd42b):
pasteluri plate, contur negru 1px, tipografie display strivită (line-height 0.8),
butoane-pilulă, bandă marquee, abțibilduri colorate, fără umbre și fără gradiente.

## Cum rulezi

Orice server static. Din acest folder:

```sh
python -m http.server 8000
# sau
npx serve .
```

Apoi deschide `http://localhost:8000`.

## Înainte de publicare — ce trebuie înlocuit

Toate locurile sunt marcate în `index.html` cu comentarii `PLACEHOLDER`.

1. **Linkul APK (Android)** — caută `data-placeholder="Android"` (3 butoane:
   nav „Descarcă", secțiunea de descărcare, apelul final). Înlocuiește
   `href="#"` cu linkul real al fișierului `.apk` (de exemplu un GitHub
   Release sau un link EAS) și șterge atributul `data-placeholder`.
2. **Linkul iOS** — caută `data-placeholder="iOS"`. Când există un link
   TestFlight / App Store, pune-l în `href` și scoate `data-placeholder`
   plus eticheta „în curând".
3. **Codul QR** — `index.html` conține un QR decorativ generat de `main.js`
   (model determinist, nu codifică nimic). Înlocuiește `<svg id="qr-grid">`
   cu `<img src="..." alt="Cod QR de descărcare">` generat pentru linkul
   real al APK-ului.
4. **Fonturi** — display: Antonio (înlocuitor pentru Lateral), UI: Inter
   (înlocuitor pentru Aeonik Pro). Dacă vrei fonturile originale, schimbă
   `--font-display` / `--font-ui` în `styles.css`.

## Publicare

Site-ul este static, deci poate merge oriunde:

- **GitHub Pages** — activează Pages pe ramura `main`, folder `download/`
  (sau `/docs` după redenumire).
- **VPS-ul existent** — adaugă un bloc nginx pentru un host nou
  (ex. `download.nimbusnova.cc`) care servește acest folder.

## Structură

```
download/
  index.html   — structură + text (caută PLACEHOLDER)
  styles.css   — tokenii de design Slush + layout
  main.js      — QR decorativ + toast pentru linkurile în așteptare
```
