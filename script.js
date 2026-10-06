/* =========================================================
   Libro virtual 3D — lógica (StPageFlip / page-flip)
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONFIGURACIÓN
     Cambia IMAGE_EXT a ".png" / ".jpg" según tus archivos.
     Cambia IMAGE_DIR a "images/" si mueves las láminas a esa carpeta.
     --------------------------------------------------------- */
  const IMAGE_DIR = "./";          // p. ej. "images/"
  const IMAGE_EXT = ".jpeg";       // ".jpg" | ".jpeg" | ".png"

  // Orden exacto de las 10 páginas
  const PAGE_NAMES = ["portada", "2", "3", "4", "5", "6", "7", "8", "9", "final"];

  // Dimensiones naturales de las láminas (1792 × 2400 px → proporción 0.7467)
  const PAGE_WIDTH = 1792;
  const PAGE_HEIGHT = 2400;

  // Tapas rígidas (cartón) como en un libro real. Pon false para tapas blandas.
  const HARD_COVERS = true;

  const FLIP_TIME = 900;           // duración de la animación (ms)

  /* --------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);
  const bookEl = $("book");
  const wrapEl = $("book-wrap");
  const shadowEl = $("floor-shadow");
  const labelEl = $("page-label");
  const progressEl = $("page-progress");
  const hintEl = $("hint");
  const loaderEl = $("loader");
  const btnFirst = $("btn-first");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const btnLast = $("btn-last");
  const btnFullscreen = $("btn-fullscreen");

  const TOTAL = PAGE_NAMES.length;
  const LAST = TOTAL - 1;
  const srcOf = (name) => IMAGE_DIR + name + IMAGE_EXT;

  let pageFlip = null;
  let currentShift = 0;

  /* ---------------- 1. Precarga de imágenes ---------------- */
  function preloadImages() {
    let done = 0;
    const percentEl = $("loader-percent");
    const fillEl = $("loader-fill");

    const tick = () => {
      done++;
      const pct = Math.round((done / TOTAL) * 100);
      percentEl.textContent = pct + "%";
      fillEl.style.width = pct + "%";
    };

    return Promise.all(
      PAGE_NAMES.map(
        (name) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const finish = () => { tick(); resolve(); };
              img.decode ? img.decode().then(finish, finish) : finish();
            };
            img.onerror = () => {
              console.warn("No se pudo cargar la imagen:", img.src);
              tick();
              resolve();
            };
            img.src = srcOf(name);
          })
      )
    );
  }

  /* ---------------- 2. Construcción de páginas ---------------- */
  function buildPages() {
    const frag = document.createDocumentFragment();

    PAGE_NAMES.forEach((name, i) => {
      const page = document.createElement("div");
      page.className = "page";

      if (i === 0) {
        page.classList.add("page--cover", "page--right");
      } else if (i === LAST) {
        page.classList.add("page--back-cover", "page--left");
      } else {
        // Con showCover: índices impares a la izquierda, pares a la derecha
        page.classList.add(i % 2 === 1 ? "page--left" : "page--right");
      }

      if (HARD_COVERS && (i === 0 || i === LAST)) {
        page.dataset.density = "hard";
      }

      const img = document.createElement("img");
      img.className = "page__img";
      img.src = srcOf(name);
      img.alt = i === 0 ? "Portada" : i === LAST ? "Contraportada" : "Página " + (i + 1);
      img.draggable = false;
      img.decoding = "async";

      const shade = document.createElement("div");
      shade.className = "page__shade";

      page.appendChild(img);
      page.appendChild(shade);
      frag.appendChild(page);
    });

    bookEl.appendChild(frag);
    return bookEl.querySelectorAll(".page");
  }

  /* ---------------- 3. Inicialización de StPageFlip ---------------- */
  function initFlipbook() {
    const pages = buildPages();

    pageFlip = new St.PageFlip(bookEl, {
      width: PAGE_WIDTH / 4,       // tamaño base (sólo se usa la proporción en modo "stretch")
      height: PAGE_HEIGHT / 4,
      size: "stretch",
      minWidth: 300,               // por debajo de 2×minWidth de ancho → modo retrato (1 página)
      maxWidth: 1200,
      minHeight: 200,
      maxHeight: 2400,
      showCover: true,             // portada y contraportada solas
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.55,
      flippingTime: FLIP_TIME,
      showPageCorners: true,
      useMouseEvents: true,
      mobileScrollSupport: false,
      swipeDistance: 25,
      clickEventForward: true,
      disableFlipByClick: false,
      autoSize: true,
      startPage: 0,
      startZIndex: 0,
    });

    pageFlip.loadFromHTML(pages);

    pageFlip.on("flip", (e) => {
      hintEl.classList.add("is-hidden");
      updateUI(e.data);
      updateShift(e.data);
    });

    pageFlip.on("changeOrientation", () => {
      requestAnimationFrame(() => {
        updateUI(pageFlip.getCurrentPageIndex());
        updateShift(pageFlip.getCurrentPageIndex(), true);
      });
    });

    pageFlip.on("init", () => {
      updateUI(0);
      updateShift(0, true);
    });

    // Estado inicial (por si "init" se disparó antes del registro)
    requestAnimationFrame(() => {
      updateUI(pageFlip.getCurrentPageIndex());
      updateShift(pageFlip.getCurrentPageIndex(), true);
      wrapEl.classList.add("is-ready");
    });
  }

  /* ---------------- Utilidades de geometría ---------------- */
  function isPortrait() {
    return pageFlip && pageFlip.getOrientation() === "portrait";
  }

  function getBounds() {
    if (pageFlip && typeof pageFlip.getBoundsRect === "function") {
      const r = pageFlip.getBoundsRect();
      if (r && r.pageWidth) return r;
    }
    // Respaldo: cálculo equivalente al de la librería
    const bw = bookEl.clientWidth;
    const bh = bookEl.clientHeight;
    const ratio = PAGE_WIDTH / PAGE_HEIGHT;
    const portrait = isPortrait();
    let pw = portrait ? bw : bw / 2;
    let ph = pw / ratio;
    if (ph > bh) { ph = bh; pw = ph * ratio; }
    const width = portrait ? pw : pw * 2;
    return { left: (bw - width) / 2, top: (bh - ph) / 2, width, height: ph, pageWidth: pw };
  }

  /* ---------------- Centrado del libro cerrado ----------------
     Con el libro cerrado (portada o contraportada) sólo hay una hoja
     visible; desplazamos el libro para que quede centrado, igual que
     en Heyzine.                                                     */
  function updateShift(index, instant) {
    if (!pageFlip) return;
    const b = getBounds();
    const pw = b.pageWidth;
    let shift = 0;
    let shadowLeft = b.left;
    let shadowWidth = b.width;

    if (!isPortrait()) {
      if (index === 0) {
        shift = -pw / 2;
        shadowLeft = b.left + pw;
        shadowWidth = pw;
      } else if (index >= LAST) {
        shift = pw / 2;
        shadowWidth = pw;
      }
    }

    currentShift = shift;

    if (instant) {
      wrapEl.style.transition = "none";
      shadowEl.style.transition = "none";
    }

    wrapEl.style.transform = "translate3d(" + shift.toFixed(1) + "px, 0, 0)";
    shadowEl.style.left = shadowLeft + shadowWidth * 0.04 + "px";
    shadowEl.style.width = shadowWidth * 0.92 + "px";
    shadowEl.style.top = b.top + b.height - 22 + "px";

    if (instant) {
      void wrapEl.offsetWidth; // fuerza reflow
      wrapEl.style.transition = "";
      shadowEl.style.transition = "";
    }
  }

  /* ---------------- Interfaz (indicador y botones) ---------------- */
  function updateUI(index) {
    const portrait = isPortrait();
    document.body.classList.toggle("is-portrait", portrait);

    let label;
    if (index === 0) {
      label = "Portada";
    } else if (index >= LAST) {
      label = "Contraportada";
    } else if (portrait) {
      label = "Página " + (index + 1) + " / " + TOTAL;
    } else {
      // En modo doble, el índice actual es la página izquierda del pliego
      const left = index % 2 === 1 ? index : index - 1;
      label = "Páginas " + (left + 1) + "–" + (left + 2);
    }

    labelEl.textContent = label;
    progressEl.style.width = (index / LAST) * 100 + "%";

    const atStart = index === 0;
    const atEnd = index >= LAST;
    btnFirst.disabled = atStart;
    btnPrev.disabled = atStart;
    btnNext.disabled = atEnd;
    btnLast.disabled = atEnd;
  }

  /* ---------------- Navegación programática ---------------- */
  function isBusy() {
    const state = pageFlip.getState();
    return state === "flipping" || state === "user_fold";
  }

  // Predice el índice destino para deslizar el libro a la vez que pasa la hoja
  function preShift(direction) {
    if (isPortrait()) return;
    const idx = pageFlip.getCurrentPageIndex();
    let target = idx;
    if (direction > 0) {
      target = idx === 0 ? 1 : Math.min(LAST, (idx % 2 === 1 ? idx : idx - 1) + 2);
    } else {
      target = idx >= LAST ? LAST - 2 : Math.max(0, (idx % 2 === 1 ? idx : idx - 1) - 2);
    }
    if (target === 0 || target >= LAST || idx === 0 || idx >= LAST) {
      updateShift(target);
    }
  }

  function next() {
    if (!pageFlip || isBusy()) return;
    if (pageFlip.getCurrentPageIndex() >= LAST) return;
    preShift(1);
    pageFlip.flipNext();
  }

  function prev() {
    if (!pageFlip || isBusy()) return;
    if (pageFlip.getCurrentPageIndex() === 0) return;
    preShift(-1);
    pageFlip.flipPrev();
  }

  function goTo(index) {
    if (!pageFlip || isBusy()) return;
    if (index === pageFlip.getCurrentPageIndex()) return;
    updateShift(index);
    pageFlip.flip(index);
  }

  /* ---------------- Eventos ---------------- */
  function bindEvents() {
    btnNext.addEventListener("click", next);
    btnPrev.addEventListener("click", prev);
    btnFirst.addEventListener("click", () => goTo(0));
    btnLast.addEventListener("click", () => goTo(LAST));

    document.addEventListener("keydown", (e) => {
      if (!pageFlip) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(LAST);
          break;
      }
    });

    // Recalcular el centrado al redimensionar (la librería se adapta sola)
    let resizeRaf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        setTimeout(() => {
          if (!pageFlip) return;
          updateUI(pageFlip.getCurrentPageIndex());
          updateShift(pageFlip.getCurrentPageIndex(), true);
        }, 60);
      });
    });

    // Pantalla completa
    btnFullscreen.addEventListener("click", () => {
      const doc = document;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        const el = doc.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else {
        (doc.exitFullscreen || doc.webkitExitFullscreen || function () {}).call(doc);
      }
    });
  }

  /* ---------------- Arranque ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof St === "undefined" || !St.PageFlip) {
      loaderEl.querySelector(".loader__text").textContent =
        "No se pudo cargar la librería page-flip. Revisa tu conexión a internet.";
      return;
    }

    bindEvents();

    preloadImages().then(() => {
      initFlipbook();
      document.body.classList.add("is-loaded");
      setTimeout(() => loaderEl.classList.add("is-hidden"), 250);
    });
  });
})();
