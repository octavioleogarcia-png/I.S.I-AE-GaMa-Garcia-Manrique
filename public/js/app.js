/* =====================================================================
   GaMa — SPA en JavaScript Vanilla (la «V» y parte del «C» del MVC)
   ---------------------------------------------------------------------
   Esta página NO tiene PHP ni SQL: solo habla con el servidor por HTTP,
   con fetch() + async/await, e intercambia JSON con api/*.php.

   Reglas que se respetan en todo el archivo:
   - Los datos que llegan del servidor se insertan SIEMPRE con
     .textContent / createTextNode (nunca con innerHTML) → OWASP A03.
   - Todo es operable con teclado: solo se usan <a> y <button> nativos.
   - Cada región que recibe respuestas de fetch() tiene aria-live="polite".
   - Al cambiar de vista se actualiza el título y el foco pasa al <h1>.

   Índice: 1 Utilidades · 2 Estado y API · 3 Formularios · 4 Menú y router
           5 Vistas (inicio, catálogo, ficha, pedido, acceso, mis pedidos,
           operación, reportes) · 6 Arranque
   ===================================================================== */
"use strict";

/* ===================== 1. UTILIDADES ===================== */

// Crea un elemento. props: class, texto, on:{evento:fn}, cualquier atributo.
// Los hijos pueden ser nodos o strings (los strings van como TEXTO, nunca como HTML).
function el(etiqueta, props = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === "class") nodo.className = valor;
    else if (clave === "texto") nodo.textContent = valor;
    else if (clave === "on") for (const [ev, fn] of Object.entries(valor)) nodo.addEventListener(ev, fn);
    else nodo.setAttribute(clave, valor === true ? "" : valor);
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return nodo;
}

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });
const dinero = (n) => pesos.format(n);
const fecha = (sqlTs) => fechaHora.format(new Date(String(sqlTs).replace(" ", "T")));
const porcentaje = (n) => `${Number(n).toLocaleString("es-AR")} %`;

// Texto solo para lectores de pantalla, para que los botones repetidos tengan nombre único.
const soloLectores = (t) => el("span", { class: "solo-lectores", texto: t });

// Anuncio en la región viva global (se vacía antes para que se vuelva a leer).
let temporizadorAnuncio = 0;
function anunciar(mensaje) {
  const region = document.getElementById("anuncios");
  region.textContent = "";
  clearTimeout(temporizadorAnuncio);
  temporizadorAnuncio = setTimeout(() => { region.textContent = mensaje; }, 80);
}

// Región de aviso persistente: existe en el DOM ANTES de recibir el mensaje.
function crearAviso(id) {
  return el("div", { id, class: "aviso", tabindex: "-1", "aria-live": "polite", "aria-atomic": "true" });
}
function mostrarAviso(region, texto, tipo = "info", enfocar = false) {
  region.className = "aviso" + (tipo === "ok" ? " aviso-ok" : tipo === "error" ? " aviso-error" : "");
  region.textContent = texto;
  if (enfocar) { region.tabIndex = -1; region.focus(); }
}
const limpiarAviso = (region) => { region.className = "aviso"; region.textContent = ""; };

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
