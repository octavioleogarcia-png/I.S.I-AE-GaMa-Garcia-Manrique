/* ============================================================
   GaMa — Actividad Evaluativa Nº2 de Paradigmas III
   Opción 5: Calculador de tarifas, presupuestos y descuentos
   Reto JS: addEventListener() desacoplado + fetch()/async-await
   contra un archivo .json local (descuentos.json).

   Este archivo concentra TODO el JavaScript de comprar.html.
   No hay ningún onclick="" ni onsubmit="" en el HTML: cada
   interacción se conecta acá mediante addEventListener().

   Autenticación (BCRYPT + sesiones PHP):
   - Cualquiera puede armar el presupuesto.
   - Solo un usuario con sesión puede CONFIRMAR el pedido: se
     envía por fetch() POST al endpoint privado
     api/mis_pedidos.php, que responde 401 si no hay sesión.
   - El estado de sesión lo resuelve assets/js/sesion.js
     (evento "gama:sesion").
   ============================================================ */

// ---------- Referencias a nodos del DOM ----------
const listaPedido = document.getElementById("lista-pedido");
const subtotalEl = document.getElementById("subtotal-pedido");
const lineaDescuento = document.getElementById("linea-descuento");
const etiquetaDescuento = document.getElementById("etiqueta-descuento");
const valorDescuento = document.getElementById("valor-descuento");
const totalEstimado = document.getElementById("total-estimado");

const inputCupon = document.getElementById("input-cupon-pedido");
const btnAplicarCupon = document.getElementById("btn-aplicar-cupon");
const mensajeCupon = document.getElementById("mensaje-cupon");

const formulario = document.getElementById("formulario-pedido");
const mensajeConfirmacion = document.getElementById("mensaje-confirmacion");
const btnConfirmar = document.getElementById("btn-confirmar");

// ---------- Estado en memoria ----------
let reglasDescuento = null; // se completa con fetch() antes de poder calcular
let cuponAplicado = null;   // { codigo, porcentaje, etiqueta } | null

/* ------------------------------------------------------------
   RETO JS — Llamada HTTP asíncrona con fetch() + async/await
   Trae las reglas de descuento (por volumen y por cupón) desde
   un archivo .json local. Si falla, se sigue funcionando sin
   descuentos en vez de romper toda la página.
   ------------------------------------------------------------ */
async function cargarReglasDescuento() {
  try {
    const respuesta = await fetch("../assets/data/descuentos.json");
    if (!respuesta.ok) {
      throw new Error(`No se pudo cargar descuentos.json (HTTP ${respuesta.status})`);
    }
    reglasDescuento = await respuesta.json();
  } catch (error) {
    console.error(error);
    reglasDescuento = { reglasPorVolumen: [], cupones: {} };
  }
}

// ---------- Construcción de la lista de productos a pedir ----------
function renderizarListaPedido() {
  const parametros = new URLSearchParams(window.location.search);
  const idPreseleccionado = parametros.get("id");

  PRODUCTOS.forEach((p) => {
    const fila = document.createElement("div");
    fila.className = "item-pedido";
    const marcado = p.id === idPreseleccionado ? "checked" : "";
    fila.innerHTML = `
      <input type="checkbox" class="check-producto" id="check-${p.id}" data-id="${p.id}" data-precio="${p.precio}" ${marcado} />
      <label for="check-${p.id}" class="nombre">
        ${p.nombre}
        <small>${p.unidad}</small>
      </label>
      <span class="precio-unit">${formatearPrecio(p.precio)}</span>
      <input type="number" class="cantidad" data-id="${p.id}" min="1" value="1" aria-label="Cantidad de ${p.nombre}" />
    `;
    listaPedido.appendChild(fila);
  });
}

// ---------- Cálculo de subtotal + cantidad total de viajes tildados ----------
function calcularSubtotalYCantidad() {
  let subtotal = 0;
  let cantidadTotal = 0;
  listaPedido.querySelectorAll(".item-pedido").forEach((fila) => {
    const check = fila.querySelector(".check-producto");
    const cantidadInput = fila.querySelector(".cantidad");
    if (check.checked) {
      const cantidad = Number(cantidadInput.value) || 1;
      subtotal += Number(check.dataset.precio) * cantidad;
      cantidadTotal += cantidad;
    }
  });
  return { subtotal, cantidadTotal };
}

// De las reglas por volumen que alcanza la cantidad total, se queda con
// la de mayor porcentaje (no se acumulan entre sí: es "la mejor que aplica").
function mejorDescuentoPorVolumen(cantidadTotal) {
  if (!reglasDescuento || !Array.isArray(reglasDescuento.reglasPorVolumen)) return null;
  const aplicables = reglasDescuento.reglasPorVolumen
    .filter((regla) => cantidadTotal >= regla.minViajes)
    .sort((a, b) => b.porcentaje - a.porcentaje);
  return aplicables[0] || null;
}

// ---------- Recalcula subtotal, descuento y total, y muta el DOM ----------
function recalcularTotal() {
  const { subtotal, cantidadTotal } = calcularSubtotalYCantidad();

  const descVolumen = mejorDescuentoPorVolumen(cantidadTotal);
  const porcentajeVolumen = descVolumen ? descVolumen.porcentaje : 0;
  const porcentajeCupon = cuponAplicado ? cuponAplicado.porcentaje : 0;
  // El descuento por volumen y el del cupón se acumulan, tope 100%.
  const porcentajeTotal = Math.min(porcentajeVolumen + porcentajeCupon, 100);

  const montoDescuento = subtotal * (porcentajeTotal / 100);
  const total = subtotal - montoDescuento;

  subtotalEl.textContent = formatearPrecio(subtotal);

  if (porcentajeTotal > 0) {
    const etiquetas = [];
    if (descVolumen) etiquetas.push(descVolumen.etiqueta);
    if (cuponAplicado) etiquetas.push(cuponAplicado.etiqueta);
    etiquetaDescuento.textContent = etiquetas.join(" + ");
    valorDescuento.textContent = "− " + formatearPrecio(montoDescuento);
    lineaDescuento.classList.add("visible");
  } else {
    lineaDescuento.classList.remove("visible");
  }

  totalEstimado.textContent = formatearPrecio(total);
}

// ---------- Validación y aplicación del cupón ----------
function aplicarCupon() {
  const codigo = inputCupon.value.trim().toUpperCase();
  mensajeCupon.classList.remove("mensaje-error", "mensaje-exito");

  if (codigo === "") {
    mensajeCupon.textContent = "Ingresá un código para aplicar.";
    mensajeCupon.classList.add("mensaje-error");
    cuponAplicado = null;
    recalcularTotal();
    return;
  }

  const cupones = (reglasDescuento && reglasDescuento.cupones) || {};
  const regla = cupones[codigo];

  if (!regla) {
    cuponAplicado = null;
    mensajeCupon.textContent = "Código inválido o vencido.";
    mensajeCupon.classList.add("mensaje-error");
  } else {
    cuponAplicado = { codigo, ...regla };
    mensajeCupon.textContent = `¡Cupón aplicado! ${regla.etiqueta}.`;
    mensajeCupon.classList.add("mensaje-exito");
  }

  recalcularTotal();
}

// ---------- Validación y envío del formulario de pedido ----------
function marcarError(campo, texto) {
  const span = formulario.querySelector(`[data-error-de="${campo}"]`);
  if (span) span.textContent = texto;
}

function limpiarErrores() {
  formulario.querySelectorAll(".mensaje-error").forEach((s) => (s.textContent = ""));
}

async function manejarEnvioFormulario(evento) {
  evento.preventDefault();
  limpiarErrores();
  mensajeConfirmacion.classList.remove("visible");

  let valido = true;

  const nombre = formulario.nombre.value.trim();
  if (nombre.length < 3) {
    marcarError("nombre", "Ingresá tu nombre completo.");
    valido = false;
  }

  const telefono = formulario.telefono.value.trim();
  if (!/^[0-9 +()-]{6,}$/.test(telefono)) {
    marcarError("telefono", "Ingresá un teléfono válido.");
    valido = false;
  }

  const direccion = formulario.direccion.value.trim();
  if (direccion.length < 5) {
    marcarError("direccion", "Ingresá la dirección de entrega.");
    valido = false;
  }

  const email = formulario.email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    marcarError("email", "Ingresá un e-mail válido.");
    valido = false;
  }

  const medioPago = formulario.querySelector('input[name="medioPago"]:checked');
  if (!medioPago) {
    marcarError("medioPago", "Elegí un medio de pago.");
    valido = false;
  }

  const productosElegidos = listaPedido.querySelectorAll(".check-producto:checked");
  if (productosElegidos.length === 0) {
    marcarError("productos", "Elegí al menos una unidad.");
    valido = false;
  }

  if (!valido) return;

  // Sin sesión no se puede confirmar (el servidor igual lo rechazaría con 401).
  if (!GaMaSesion.usuario) {
    marcarError("envio", "Ingresá a tu cuenta para confirmar el pedido.");
    return;
  }

  // Ítems elegidos: solo id y cantidad. El PRECIO lo pone el servidor.
  const items = Array.from(productosElegidos).map((check) => {
    const cantidad = listaPedido.querySelector(`.cantidad[data-id="${check.dataset.id}"]`);
    return { id: check.dataset.id, cantidad: Number(cantidad.value) || 1 };
  });

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Enviando…";

  const { ok, status, datos } = await GaMaSesion.llamarApi(GaMaSesion.API.misPedidos, {
    metodo: "POST",
    datos: {
      direccion,
      telefono,
      medio_pago: medioPago.value,
      comentarios: formulario.comentarios.value.trim(),
      cupon: cuponAplicado ? cuponAplicado.codigo : "",
      items,
    },
  });

  btnConfirmar.disabled = false;
  btnConfirmar.textContent = "Confirmar pedido";

  if (status === 401) {
    // La sesión venció: se vuelve a la vista de visitante.
    GaMaSesion.establecer(null);
    marcarError("envio", "Tu sesión terminó. Ingresá de nuevo para confirmar el pedido.");
    return;
  }
  if (!ok) {
    marcarError("envio", datos.mensaje || "No se pudo registrar el pedido.");
    return;
  }

  // Confirmación armada con textContent + createElement (sin innerHTML).
  const pedido = datos.data;
  const enlace = document.createElement("a");
  enlace.href = "acceso.html";
  enlace.textContent = "Ver mis pedidos";
  mensajeConfirmacion.replaceChildren(
    `Pedido N.º ${pedido.id} registrado por ${formatearPrecio(pedido.total)}. ` +
      "En breve nos comunicamos para confirmar día y horario de entrega. ",
    enlace
  );
  mensajeConfirmacion.classList.add("visible");
  mensajeConfirmacion.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Datos del usuario logueado en el formulario ----------
// Nombre y e-mail salen de la cuenta: se precargan y quedan de solo lectura.
function aplicarSesionAlFormulario(evento) {
  const usuario = evento.detail.usuario;
  formulario.nombre.readOnly = !!usuario;
  formulario.email.readOnly = !!usuario;

  if (usuario) {
    formulario.nombre.value = usuario.nombre;
    formulario.email.value = usuario.email;
    if (formulario.telefono.value.trim() === "") formulario.telefono.value = usuario.telefono;
    marcarError("envio", "");
  }
}

/* ------------------------------------------------------------
   Inicialización — todo desacoplado vía addEventListener().
   1) Se traen las reglas de descuento (fetch async).
   2) Recién con eso listo se arma la lista de productos y el
      primer cálculo, para que el descuento esté disponible
      desde el primer render.
   ------------------------------------------------------------ */
async function inicializarPedido() {
  await cargarReglasDescuento();
  renderizarListaPedido();
  recalcularTotal();

  listaPedido.addEventListener("change", recalcularTotal);
  listaPedido.addEventListener("input", recalcularTotal);
  btnAplicarCupon.addEventListener("click", aplicarCupon);
  formulario.addEventListener("submit", manejarEnvioFormulario);
}

// Se registra de inmediato para no perder la primera respuesta de sesión.
document.addEventListener("gama:sesion", aplicarSesionAlFormulario);

window.addEventListener("load", inicializarPedido);
