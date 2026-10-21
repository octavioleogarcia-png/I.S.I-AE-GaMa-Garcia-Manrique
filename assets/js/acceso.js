/* ============================================================
   GaMa — pages/acceso.html (SPA de cuenta)
   - Pestañas Ingresar / Crear cuenta (vista visitante)
   - Login y registro con fetch() + JSON a la API PHP
   - Panel "Mis pedidos" que consume el endpoint privado
     api/mis_pedidos.php (401 si no hay sesión)
   Todos los datos que vienen del servidor se pintan con
   textContent / createElement: nada pasa por innerHTML.
   ============================================================ */

const tabLogin = document.getElementById("tab-login");
const tabRegistro = document.getElementById("tab-registro");
const formLogin = document.getElementById("form-login");
const formRegistro = document.getElementById("form-registro");
const msgAcceso = document.getElementById("msg-acceso");
const msgPedidos = document.getElementById("msg-pedidos");
const listaPedidos = document.getElementById("lista-mis-pedidos");

const parametros = new URLSearchParams(window.location.search);
// Solo se acepta un destino conocido para no abrir una redirección libre.
const volverA = parametros.get("volver") === "comprar" ? "comprar.html" : null;

// ---------- Mensajes (siempre con textContent) ----------
function mostrarMensaje(caja, texto, tipo = "info") {
  caja.textContent = texto;
  caja.className = `aviso aviso-${tipo}`;
  caja.hidden = false;
}

function ocultarMensaje(caja) {
  caja.textContent = "";
  caja.hidden = true;
}

// ---------- Pestañas ----------
function mostrarPestana(cual) {
  const esLogin = cual === "login";
  tabLogin.classList.toggle("activa", esLogin);
  tabRegistro.classList.toggle("activa", !esLogin);
  tabLogin.setAttribute("aria-selected", String(esLogin));
  tabRegistro.setAttribute("aria-selected", String(!esLogin));
  formLogin.hidden = !esLogin;
  formRegistro.hidden = esLogin;
  ocultarMensaje(msgAcceso);
}

tabLogin.addEventListener("click", () => mostrarPestana("login"));
tabRegistro.addEventListener("click", () => mostrarPestana("registro"));

// Después de entrar: volver a comprar.html si se vino de ahí, o mostrar el panel.
function alAutenticar(usuario) {
  if (volverA) {
    window.location.href = volverA;
    return;
  }
  GaMaSesion.establecer(usuario);
}

// ---------- Login ----------
formLogin.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const boton = formLogin.querySelector("button[type='submit']");
  boton.disabled = true;
  mostrarMensaje(msgAcceso, "Verificando tus datos…");

  const { ok, datos } = await GaMaSesion.llamarApi(GaMaSesion.API.login, {
    metodo: "POST",
    datos: {
      email: formLogin.email.value.trim(),
      password: formLogin.password.value,
    },
  });

  boton.disabled = false;
  if (ok && datos.estado === "exito") {
    formLogin.reset();
    ocultarMensaje(msgAcceso);
    alAutenticar(datos.usuario);
  } else {
    formLogin.password.value = "";
    mostrarMensaje(msgAcceso, datos.mensaje || "No se pudo iniciar sesión.", "error");
  }
});

// ---------- Registro ----------
formRegistro.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const payload = {
    nombre: formRegistro.nombre.value.trim(),
    email: formRegistro.email.value.trim(),
    telefono: formRegistro.telefono.value.trim(),
    password: formRegistro.password.value,
  };

  // Validación rápida en el navegador (el servidor vuelve a validar todo).
  if (payload.nombre.length < 3) {
    return mostrarMensaje(msgAcceso, "Ingresá un nombre de al menos 3 caracteres.", "error");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return mostrarMensaje(msgAcceso, "Ingresá un e-mail válido.", "error");
  }
  if (!/^[0-9 +()-]{6,30}$/.test(payload.telefono)) {
    return mostrarMensaje(msgAcceso, "Ingresá un teléfono válido.", "error");
  }
  if (payload.password.length < 8) {
    return mostrarMensaje(msgAcceso, "La contraseña debe tener al menos 8 caracteres.", "error");
  }

  const boton = formRegistro.querySelector("button[type='submit']");
  boton.disabled = true;
  mostrarMensaje(msgAcceso, "Creando tu cuenta…");

  const { ok, datos } = await GaMaSesion.llamarApi(GaMaSesion.API.registro, {
    metodo: "POST",
    datos: payload,
  });

  boton.disabled = false;
  if (ok && datos.estado === "exito") {
    formRegistro.reset();
    ocultarMensaje(msgAcceso);
    alAutenticar(datos.usuario);
  } else {
    mostrarMensaje(msgAcceso, datos.mensaje || "No se pudo crear la cuenta.", "error");
  }
});

// ---------- Mis pedidos (endpoint privado) ----------
function formatearFecha(fechaSql) {
  const fecha = new Date(fechaSql.replace(" ", "T"));
  return isNaN(fecha) ? fechaSql : fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Crea un elemento con texto seguro (textContent) y una clase opcional.
function crear(etiqueta, texto, clase) {
  const el = document.createElement(etiqueta);
  if (texto !== undefined) el.textContent = texto;
  if (clase) el.className = clase;
  return el;
}

function crearTarjetaPedido(pedido) {
  const tarjeta = crear("article", undefined, "pedido");

  const cabecera = crear("header", undefined, "pedido-cabecera");
  cabecera.append(
    crear("strong", `Pedido N.º ${pedido.id}`),
    crear("span", formatearFecha(pedido.fecha), "pedido-fecha"),
    crear("span", pedido.estado, `estado estado-${pedido.estado.replace(" ", "-")}`)
  );

  const items = crear("ul", undefined, "pedido-items");
  pedido.items.forEach((item) => {
    const li = crear("li");
    li.append(
      crear("span", `${item.cantidad} × ${item.unidad}`),
      crear("small", ` ${item.tarifa} · ${formatearPrecio(item.precio_unitario)} c/u`)
    );
    items.appendChild(li);
  });

  const pie = crear("footer", undefined, "pedido-pie");
  pie.append(crear("span", `Entrega: ${pedido.direccion}`, "pedido-direccion"));
  const total = crear("span", undefined, "pedido-total");
  if (pedido.descuento_pct > 0) {
    total.append(crear("small", `${pedido.descuento_pct}% de descuento · `));
  }
  total.append(crear("strong", formatearPrecio(pedido.total)));
  pie.appendChild(total);

  tarjeta.append(cabecera, items, pie);
  return tarjeta;
}

async function cargarPedidos() {
  listaPedidos.replaceChildren();
  mostrarMensaje(msgPedidos, "Cargando tus pedidos…");

  const { ok, status, datos } = await GaMaSesion.llamarApi(GaMaSesion.API.misPedidos);

  if (status === 401) {
    // La sesión venció o se cerró en otra pestaña: volver a modo visitante.
    GaMaSesion.establecer(null);
    mostrarMensaje(msgAcceso, "Tu sesión terminó. Ingresá de nuevo para ver tus pedidos.", "error");
    return;
  }
  if (!ok) {
    mostrarMensaje(msgPedidos, datos.mensaje || "No se pudieron cargar tus pedidos.", "error");
    return;
  }

  if (datos.data.length === 0) {
    mostrarMensaje(msgPedidos, "Todavía no hiciste ningún pedido.");
    return;
  }

  ocultarMensaje(msgPedidos);
  datos.data.forEach((pedido) => listaPedidos.appendChild(crearTarjetaPedido(pedido)));
}

// Cada vez que el servidor confirma una sesión, se piden los pedidos.
document.addEventListener("gama:sesion", (evento) => {
  if (evento.detail.usuario) {
    if (volverA) {
      window.location.href = volverA; // ya estaba logueado: no tiene sentido quedarse acá
      return;
    }
    cargarPedidos();
  } else {
    listaPedidos.replaceChildren();
  }
});

mostrarPestana(parametros.get("modo") === "registro" ? "registro" : "login");
