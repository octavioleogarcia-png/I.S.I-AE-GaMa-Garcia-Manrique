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

/* ===================== 2. ESTADO Y API ===================== */

const ROL_STAFF = ["operario", "gerente"];
const estado = {
  usuario: null,          // { nombre, email, telefono, rol } o null
  csrf: "",               // token anti-CSRF de la sesión
  carrito: new Map(),     // unidad_id → { unidad, cantidad }
  destino: null,          // ruta a la que volver después de ingresar
  avisoAcceso: "",
};
const esStaff = () => estado.usuario && ROL_STAFF.includes(estado.usuario.rol);

// Único punto de contacto con el servidor. Nunca lanza: devuelve { ok, status, datos }.
async function api(ruta, { metodo = "GET", cuerpo } = {}) {
  const opciones = { method: metodo, headers: {}, credentials: "same-origin" };
  if (cuerpo !== undefined) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }
  if (metodo !== "GET" && estado.csrf) opciones.headers["X-CSRF-Token"] = estado.csrf;

  try {
    const respuesta = await fetch("../api/" + ruta, opciones);
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401 && estado.usuario) {
      // La sesión venció mientras la página seguía abierta.
      estado.usuario = null; estado.csrf = "";
      estado.avisoAcceso = "Tu sesión venció. Ingresá de nuevo para continuar.";
      estado.destino = location.hash;
      actualizarMenu();
      location.hash = "#/acceso";
    }
    return { ok: respuesta.ok, status: respuesta.status, datos };
  } catch (error) {
    return { ok: false, status: 0, datos: { mensaje: "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo." } };
  }
}
const mensajeDe = (r, porDefecto) => (r.datos && r.datos.mensaje) || porDefecto;

async function cargarSesion() {
  const r = await api("sesion.php");
  if (r.ok && r.datos.autenticado) {
    estado.usuario = r.datos.data;
    estado.csrf = r.datos.csrf;
  }
}

function totalItemsCarrito() {
  let n = 0;
  for (const { cantidad } of estado.carrito.values()) n += cantidad;
  return n;
}

function agregarAlCarrito(unidad) {
  const previo = estado.carrito.get(unidad.id);
  estado.carrito.set(unidad.id, { unidad, cantidad: Math.min((previo ? previo.cantidad : 0) + 1, 100) });
  actualizarMenu();
  anunciar(`${unidad.nombre} agregado al pedido. Tenés ${totalItemsCarrito()} en total.`);
}

/* ===================== 3. FORMULARIOS ===================== */

// Campo accesible: etiqueta asociada, ayuda y error enlazados con aria-describedby.
function crearCampo(id, etiqueta, { tipo = "text", requerido = true, ayuda = "", valor = "", autocomplete = "", maxlength, min, max, inputmode, elemento = "input", opciones = [] } = {}) {
  const idAyuda = `${id}-ayuda`, idError = `${id}-error`;
  let control;
  if (elemento === "select") {
    control = el("select", { id, name: id, required: requerido }, opciones.map((o) => el("option", { value: o.valor, texto: o.texto })));
    control.value = valor;
  } else if (elemento === "textarea") {
    control = el("textarea", { id, name: id, maxlength, rows: 3 });
    control.value = valor;
  } else {
    control = el("input", { id, name: id, type: tipo, required: requerido, autocomplete, maxlength, min, max, inputmode, value: valor });
  }
  const error = el("p", { id: idError, class: "error-campo", "aria-live": "polite" });
  const descripciones = [];
  if (ayuda) descripciones.push(idAyuda);
  control.setAttribute("aria-describedby", descripciones.concat(idError).join(" "));
  const contenedor = el("div", { class: "campo" },
    el("label", { for: id }, etiqueta, requerido ? "" : " (opcional)"),
    ayuda ? el("span", { id: idAyuda, class: "ayuda", texto: ayuda }) : null,
    control, error);
  return { contenedor, control, error };
}

function marcarError(campo, texto) {
  campo.control.setAttribute("aria-invalid", "true");
  campo.error.textContent = texto;
}
function limpiarError(campo) {
  campo.control.removeAttribute("aria-invalid");
  campo.error.textContent = "";
}
// Valida con la API de restricciones del navegador; el primer error recibe el foco.
function validarCampos(campos) {
  let primero = null;
  for (const c of campos) {
    limpiarError(c);
    if (!c.control.checkValidity()) {
      marcarError(c, c.control.validationMessage || "Revisá este campo.");
      primero = primero || c.control;
    }
  }
  if (primero) primero.focus();
  return primero === null;
}

/* ===================== 4. MENÚ Y ROUTER ===================== */

const RUTAS = [
  { patron: /^#\/?$/,                 titulo: "Inicio",               vista: vistaInicio },
  { patron: /^#\/catalogo$/,          titulo: "Unidades disponibles", vista: vistaCatalogo },
  { patron: /^#\/unidad\/([a-z0-9-]+)$/, titulo: "Ficha de la unidad", vista: vistaUnidad },
];

function actualizarMenu() {
  const hash = location.hash || "#/";
  const enlaces = [["#/", "Inicio"], ["#/catalogo", "Unidades"]];
  const n = totalItemsCarrito();
  enlaces.push(["#/pedido", n ? `Pedir un camión (${n})` : "Pedir un camión"]);
  if (estado.usuario) {
    enlaces.push(["#/mis-pedidos", "Mis pedidos"]);
    if (esStaff()) enlaces.push(["#/operacion", "Operación"]);
    if (estado.usuario.rol === "gerente") enlaces.push(["#/reportes", "Reportes"]);
  } else {
    enlaces.push(["#/acceso", "Ingresar"]);
  }
  const items = enlaces.map(([destino, texto]) => el("li", {},
    el("a", { href: destino, "aria-current": hash === destino ? "page" : null, texto })));
  if (estado.usuario) {
    items.push(el("li", {}, el("button", { type: "button", on: { click: cerrarSesion } },
      "Salir", soloLectores(` (${estado.usuario.nombre})`))));
  }
  document.getElementById("menu").replaceChildren(...items);
}

async function cerrarSesion() {
  await api("logout.php", { metodo: "POST" });
  estado.usuario = null; estado.csrf = "";
  actualizarMenu();
  anunciar("Cerraste sesión.");
  if (location.hash === "#/") navegar(); else location.hash = "#/";
}

let secuencia = 0;       // evita que una vista lenta pise a otra más nueva
let primeraCarga = true;

async function navegar() {
  const hash = location.hash || "#/";
  // Anclas internas (por ejemplo "#contenido") no son rutas de la SPA.
  if (!hash.startsWith("#/")) return;
  let ruta = null, parametros = [];
  for (const r of RUTAS) {
    const m = hash.match(r.patron);
    if (m) { ruta = r; parametros = m.slice(1); break; }
  }
  const main = document.getElementById("contenido");
  const mia = ++secuencia;

  // Rutas protegidas: sin sesión se manda a ingresar y se recuerda a dónde volver.
  if (ruta && ruta.roles && !estado.usuario) {
    estado.destino = hash;
    estado.avisoAcceso = "Para ver esa sección tenés que ingresar con tu cuenta.";
    location.hash = "#/acceso";
    return;
  }

  main.replaceChildren();
  actualizarMenu();

  if (!ruta) {
    document.title = "Página no encontrada — GaMa";
    main.append(el("h1", { texto: "No encontramos esa página" }),
      el("p", {}, "Probá volver al ", el("a", { href: "#/", texto: "inicio" }), " o mirar las ", el("a", { href: "#/catalogo", texto: "unidades disponibles" }), "."));
  } else if (ruta.roles && !ruta.roles.includes(estado.usuario.rol)) {
    document.title = "Sin permiso — GaMa";
    main.append(el("h1", { texto: "No tenés permiso para esta sección" }),
      el("p", {}, "Tu cuenta no tiene acceso a esta pantalla. ", el("a", { href: "#/", texto: "Volver al inicio" }), "."));
  } else {
    document.title = `${ruta.titulo} — GaMa`;
    await ruta.vista(main, ...parametros);
  }
  if (mia !== secuencia) return;

  // Accesibilidad: el foco pasa al título de la vista nueva (no en la carga inicial).
  const h1 = main.querySelector("h1");
  if (h1 && !primeraCarga) { h1.tabIndex = -1; h1.focus(); window.scrollTo(0, 0); }
  primeraCarga = false;
}

/* ===================== 5. VISTAS ===================== */

/* ---------- Inicio ---------- */
function vistaInicio(main) {
  const modulos = [
    ["Catálogo", "Fichas técnicas de cada unidad de la flota, con búsqueda y filtro por categoría."],
    ["Pedidos", "Pedí uno o varios camiones y mirá el total con descuentos antes de confirmar."],
    ["Operación", "El personal confirma, despacha y cierra los pedidos, y mantiene al día la flota."],
    ["Reportes", "El gerente ve ingresos, rendimiento por unidad y clientes principales."],
  ];
  main.append(
    el("section", { class: "hero", "aria-labelledby": "titulo-inicio" },
      el("h1", { id: "titulo-inicio", texto: "Tu obra, abastecida a tiempo." }),
      el("p", {}, "Coordinamos volcadores, acoplados, mixer e hidrogrúa para que el material llegue cuando la obra lo necesita, sin que tengas que estar atrás del teléfono todo el día."),
      el("div", { class: "acciones" },
        el("a", { class: "boton", href: "#/catalogo", texto: "Ver unidades disponibles" }),
        el("a", { class: "boton boton-claro", href: "#/pedido", texto: "Pedir un camión" }))),
    el("section", { "aria-labelledby": "titulo-modulos" },
      el("h2", { id: "titulo-modulos", texto: "Qué podés hacer en GaMa" }),
      el("ul", { class: "modulos" }, modulos.map(([t, d]) =>
        el("li", { class: "modulo" }, el("h3", { texto: t }), el("p", { texto: d }))))));
}

/* ---------- Catálogo (tabla y fichas) ---------- */
async function vistaCatalogo(main) {
  let modo = "fichas";
  const buscar = crearCampo("busqueda", "Buscar por nombre o uso", { tipo: "search", requerido: false, autocomplete: "off", maxlength: 60 });
  const categoria = crearCampo("categoria", "Categoría", { elemento: "select", requerido: false, opciones: [{ valor: "", texto: "Todas" }] });
  const btnFichas = el("button", { type: "button", class: "boton boton-claro", "aria-pressed": "true", texto: "Fichas" });
  const btnTabla = el("button", { type: "button", class: "boton boton-claro", "aria-pressed": "false", texto: "Tabla" });
  const aviso = crearAviso("aviso-catalogo");     // región viva: cantidad de resultados / errores
  const resultado = el("div", { id: "resultado-catalogo" });
  let unidades = [];

  function dibujar() {
    if (!unidades.length) { resultado.replaceChildren(); return; }
    resultado.replaceChildren(modo === "fichas" ? fichasDe(unidades) : tablaDe(unidades));
  }
  async function cargar() {
    resultado.setAttribute("aria-busy", "true");
    mostrarAviso(aviso, "Buscando unidades…");
    const params = new URLSearchParams();
    if (buscar.control.value.trim()) params.set("q", buscar.control.value.trim());
    if (categoria.control.value) params.set("categoria", categoria.control.value);
    const r = await api("unidades.php" + (params.toString() ? "?" + params : ""));
    resultado.removeAttribute("aria-busy");
    if (!r.ok) { unidades = []; dibujar(); mostrarAviso(aviso, mensajeDe(r, "No se pudieron cargar las unidades."), "error"); return; }
    unidades = r.datos.data;
    // Las categorías se cargan una sola vez, sin pisar la elegida.
    if (categoria.control.options.length === 1) {
      for (const c of r.datos.categorias) categoria.control.append(el("option", { value: c, texto: c }));
    }
    dibujar();
    mostrarAviso(aviso, unidades.length === 0 ? "No se encontraron unidades para esa búsqueda."
      : `${unidades.length} ${unidades.length === 1 ? "unidad encontrada" : "unidades encontradas"}.`);
  }

  btnFichas.addEventListener("click", () => { modo = "fichas"; btnFichas.setAttribute("aria-pressed", "true"); btnTabla.setAttribute("aria-pressed", "false"); dibujar(); });
  btnTabla.addEventListener("click", () => { modo = "tabla"; btnTabla.setAttribute("aria-pressed", "true"); btnFichas.setAttribute("aria-pressed", "false"); dibujar(); });
  buscar.control.addEventListener("input", debounce(cargar, 300));
  categoria.control.addEventListener("change", cargar);

  main.append(
    el("h1", { texto: "Unidades disponibles" }),
    el("form", { class: "filtros", role: "search", "aria-label": "Filtrar unidades", on: { submit: (e) => { e.preventDefault(); cargar(); } } },
      buscar.contenedor, categoria.contenedor,
      el("div", { class: "vistas", role: "group", "aria-label": "Forma de mostrar" }, btnFichas, btnTabla)),
    aviso, resultado);
  await cargar();
}

function botonAgregar(u) {
  return el("button", { type: "button", class: "boton boton-chico", on: { click: () => agregarAlCarrito(u) } },
    "Agregar al pedido", soloLectores(`: ${u.nombre}`));
}
function enlaceFicha(u) {
  return el("a", { class: "boton boton-claro boton-chico", href: `#/unidad/${u.id}` }, "Ver ficha", soloLectores(`: ${u.nombre}`));
}

function fichasDe(unidades) {
  return el("ul", { class: "fichas" }, unidades.map((u) => el("li", {},
    el("article", { class: "ficha", "aria-labelledby": `ficha-${u.id}` },
      el("p", { class: "categoria", texto: u.categoria }),
      el("h2", { id: `ficha-${u.id}`, texto: u.nombre }),
      el("p", { texto: u.uso }),
      el("p", { class: "ayuda", texto: `Capacidad ${u.capacidad} · Carga máxima ${u.carga_maxima}` }),
      el("p", { class: "precio" }, dinero(u.precio), " ", el("small", { texto: u.tarifa })),
      el("div", { class: "acciones" }, enlaceFicha(u), botonAgregar(u))))));
}

function tablaDe(unidades) {
  const cabeza = ["Unidad", "Categoría", "Capacidad", "Carga máxima", "Tarifa", "Precio", "Acciones"];
  return el("div", { class: "tabla-envoltorio" },
    el("table", {},
      el("caption", { texto: "Unidades de la flota GaMa" }),
      el("thead", {}, el("tr", {}, cabeza.map((t) => el("th", { scope: "col", class: t === "Precio" ? "num" : null, texto: t })))),
      el("tbody", {}, unidades.map((u) => el("tr", {},
        el("th", { scope: "row", texto: u.nombre }),
        el("td", { texto: u.categoria }), el("td", { texto: u.capacidad }),
        el("td", { texto: u.carga_maxima }), el("td", { texto: u.tarifa }),
        el("td", { class: "num", texto: dinero(u.precio) }),
        el("td", {}, el("div", { class: "acciones" }, enlaceFicha(u), botonAgregar(u))))))));
}

/* ---------- Ficha individual ---------- */
async function vistaUnidad(main, id) {
  const aviso = crearAviso("aviso-unidad");
  const contenido = el("div");
  main.append(el("p", {}, el("a", { href: "#/catalogo", texto: "← Volver a las unidades" })), contenido, aviso);
  const r = await api("unidades.php?id=" + encodeURIComponent(id));
  if (!r.ok) {
    document.title = "Unidad no encontrada — GaMa";
    contenido.append(el("h1", { texto: r.status === 404 ? "Esa unidad no existe" : "No se pudo cargar la unidad" }));
    mostrarAviso(aviso, mensajeDe(r, "Probá de nuevo más tarde."), "error");
    return;
  }
  const u = r.datos.data;
  document.title = `${u.nombre} — GaMa`;
  contenido.append(
    el("p", { class: "categoria", texto: u.categoria }),
    el("h1", { texto: u.nombre }),
    el("dl", { class: "datos" },
      el("dt", { texto: "Uso recomendado" }), el("dd", { texto: u.uso }),
      el("dt", { texto: "Capacidad" }), el("dd", { texto: u.capacidad }),
      el("dt", { texto: "Carga máxima" }), el("dd", { texto: u.carga_maxima }),
      el("dt", { texto: "Tarifa" }), el("dd", { texto: `${dinero(u.precio)} ${u.tarifa}` })),
    el("div", { class: "acciones" }, botonAgregar(u),
      el("a", { class: "boton boton-claro", href: "#/pedido", texto: "Ir al pedido" })));
}

/* ===================== 6. ARRANQUE ===================== */
window.addEventListener("hashchange", navegar);

// Enlace «Saltar al contenido»: mueve el foco al <main> sin tocar el hash de la SPA.
document.querySelector(".saltar").addEventListener("click", (e) => {
  e.preventDefault();
  const main = document.getElementById("contenido");
  main.focus();
  main.scrollIntoView();
});

(async function iniciar() {
  await cargarSesion();
  actualizarMenu();
  await navegar();
})();
