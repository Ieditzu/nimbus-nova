/* Nova — pagină de descărcare
   Două lucruri mici:
   1. Un cod QR decorativ (determinist) până când există un link real de APK.
   2. Toast pentru butoanele de descărcare care nu au încă un link. */

(function () {
  // --- 1. Cod QR placeholder (model determinist, 21x21) ---
  const qr = document.getElementById('qr-grid');
  if (qr) {
    let seed = 20261004;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Pătratele mari de aliniere (finder patterns) în trei colțuri.
    const finderAt = (fr, fc) => (r, c) => {
      if (r < fr || r >= fr + 8 || c < fc || c >= fc + 8) return null;
      const lr = r - fr;
      const lc = c - fc;
      if (lr === 7 || lc === 7) return false; // separator alb
      if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true; // cadru
      return lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4; // miez
    };
    const finders = [finderAt(0, 0), finderAt(0, 13), finderAt(13, 0)];
    let rects = '';
    for (let r = 0; r < 21; r += 1) {
      for (let c = 0; c < 21; c += 1) {
        let dark;
        const inFinder = finders.map(f => f(r, c)).find(v => v !== null);
        if (inFinder !== undefined) dark = inFinder;
        else if (r === 6 || c === 6) dark = (r + c) % 2 === 0; // linii de sincronizare
        else dark = rnd() > 0.55; // „date"
        if (dark) rects += `<rect x="${c}" y="${r}" width="1" height="1" />`;
      }
    }
    qr.innerHTML = rects;
  }

  // --- 2. Toast pentru linkuri de descărcare în așteptare ---
  const toast = document.getElementById('toast');
  let timer = null;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('toast-visible');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('toast-visible'), 2800);
  };

  document.querySelectorAll('[data-placeholder]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      showToast(`Linkul de descărcare pentru ${button.dataset.placeholder} se adaugă în curând.`);
    });
  });
})();
