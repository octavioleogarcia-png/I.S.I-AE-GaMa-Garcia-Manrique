/* ============================================================
   GaMa — Estado de sesión compartido por TODAS las páginas
   Paso 4: el navegador ya no "decide" si hay sesión. Al cargar,
   se le pregunta al servidor con fetch() a un endpoint privado:
     200 → usuario autenticado   ·   401 → visitante

   Alternancia del DOM:
     data-vista="visitante"  → se ve solo sin sesión
     data-vista="usuario"    → se ve solo con sesión
   Datos del usuario (siempre con textContent, nunca innerHTML):
     data-usuario-nombre, data-usuario-email,
     data-usuario-telefono, data-usuario-rol

   Cada vez que cambia la sesión se dispara el evento
   "gama:sesion" con { usuario } (o usuario = null).
   ============================================================ */

const GaMaSesion = (() => {
  // index.html está en la raíz; el resto, en pages/. Cada <body>
  // indica cómo llegar a la raíz con data-raiz ("" o "../").
  const raiz = document.body.dataset.raiz || "";

  const API = {
    perfil: raiz + "api/perfil.php",
    login: raiz + "api/login.php",
    registro: raiz + "api/registro.php",
    logout: raiz + "api/logout.php",
    misPedidos: raiz + "api/mis_pedidos.php",
  };

  let usuario = null;
  let avisarListo;
  const listo = new Promise((resolve) => (avisarListo = resolve));

  // fetch() + JSON en un solo lugar. Nunca lanza: devuelve { ok, status, datos }.
  async function llamarApi(url, { metodo = "GET", datos } = {}) {
    const opciones = {
      method: metodo,
      credentials: "same-origin", // envía la cookie de sesión GAMA_SESION
      headers: { Accept: "application/json" },
    };
    if (datos !== undefined) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(datos);
    }

    try {
      const respuesta = await fetch(url, opciones);
      let cuerpo = {};
      try {
        cuerpo = await respuesta.json();
      } catch {
        cuerpo = { mensaje: "Respuesta inválida del servidor." };
      }
      return { ok: respuesta.ok, status: respuesta.status, datos: cuerpo };
    } catch {
      return { ok: false, status: 0, datos: { mensaje: "No se pudo conectar con el servidor." } };
    }
  }

  // Muestra u oculta los bloques según la sesión y vuelca los datos del usuario.
  function aplicarVista() {
    const hay = usuario !== null;

    document.querySelectorAll("[data-vista]").forEach((el) => {
      el.hidden = el.dataset.vista === "usuario" ? !hay : hay;
    });

    // textContent inserta el dato como TEXTO: un "<script>" en el nombre
    // se ve tal cual y el navegador no lo ejecuta (prevención de XSS).
    const nombre = hay ? usuario.nombre : "";
    document.querySelectorAll("[data-usuario-nombre]").forEach((el) => {
      el.textContent = el.dataset.usuarioNombre === "corto" ? nombre.split(" ")[0] : nombre;
    });
    document.querySelectorAll("[data-usuario-email]").forEach((el) => {
      el.textContent = hay ? usuario.email : "";
    });
    document.querySelectorAll("[data-usuario-telefono]").forEach((el) => {
      el.textContent = hay ? usuario.telefono : "";
    });
    document.querySelectorAll("[data-usuario-rol]").forEach((el) => {
      el.textContent = hay ? usuario.rol : "";
    });
  }

  function establecer(nuevoUsuario) {
    usuario = nuevoUsuario || null;
    aplicarVista();
    document.dispatchEvent(new CustomEvent("gama:sesion", { detail: { usuario } }));
  }

  // GET al endpoint privado: la "verdad" sobre la sesión la tiene el servidor.
  async function comprobar() {
    const { ok, datos } = await llamarApi(API.perfil);
    establecer(ok && datos.estado === "exito" ? datos.data : null);
    avisarListo(usuario);
    return usuario;
  }

  async function salir() {
    await llamarApi(API.logout, { metodo: "POST", datos: {} });
    establecer(null);
  }

  // Arranque: primero modo visitante (sin parpadeos de datos privados),
  // después se consulta al servidor.
  aplicarVista();
  comprobar();

  document.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-accion='salir']")) {
      evento.preventDefault();
      salir();
    }
  });

  return {
    API,
    raiz,
    llamarApi,
    establecer,
    comprobar,
    salir,
    listo,
    get usuario() {
      return usuario;
    },
  };
})();
