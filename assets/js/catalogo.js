/* ============================================================
   GaMa — Actividad Evaluativa Nº2 de Paradigmas III
   Opción 3: Buscador y filtro de catálogo en tiempo real
   Integrante: Manrique Santiago
   Pantalla enriquecida: pages/listado_box.html

   Reto JS: addEventListener() desacoplado (nada de onclick/onsubmit
   en el HTML) + fetch()/async-await contra un archivo .json local,
   filtrando el resultado en memoria con Array.prototype.filter().
   ============================================================ */

const grilla = document.getElementById("grilla-productos");
const buscador = document.getElementById("inputBuscador");

// Si por algún motivo este script se cargara en una página sin estos
// dos elementos, no hace nada (evita errores en otras pantallas).
if (grilla && buscador) {
  // Catálogo completo en memoria, una vez resuelto el fetch.
  let catalogoCompleto = [];

  // ---------- Construcción de una tarjeta de producto ----------
  function crearTarjeta(producto) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "box-producto";
    tarjeta.innerHTML = `
      <div class="visor">
        <img src="${producto.icono}" alt="" />
      </div>
      <div class="cuerpo">
        <span class="categoria">${producto.categoria}</span>
        <h3>${producto.nombre}</h3>
        <p class="uso">${producto.uso}</p>
        <div class="pie">
          <span class="precio">
            ${formatearPrecio(producto.precio)}
            <small>${producto.unidad}</small>
          </span>
          <a class="boton boton-primario" href="producto.html?id=${producto.id}">Ver ficha</a>
        </div>
      </div>
    `;
    return tarjeta;
  }

  // ---------- Mutación del DOM: vuelca una lista de productos en la grilla ----------
  function renderizar(lista) {
    grilla.innerHTML = "";

    if (lista.length === 0) {
      grilla.innerHTML = `<p class="sin-resultados">No se encontraron unidades para esa búsqueda.</p>`;
      return;
    }

    lista.forEach((producto) => grilla.appendChild(crearTarjeta(producto)));
  }

  // ---------- Reto JS: filtrado en memoria con .filter() ----------
  // Busca coincidencias parciales (sin importar mayúsculas/minúsculas)
  // tanto en el nombre como en la categoría del producto.
  function filtrarCatalogo(termino) {
    const texto = termino.trim().toLowerCase();
    if (texto === "") return catalogoCompleto;

    return catalogoCompleto.filter((producto) => {
      const nombre = producto.nombre.toLowerCase();
      const categoria = producto.categoria.toLowerCase();
      return nombre.includes(texto) || categoria.includes(texto);
    });
  }

  /* ------------------------------------------------------------
     Reto JS — Llamada HTTP asíncrona con fetch() + async/await
     Trae el catálogo completo desde un archivo .json local. Si
     falla, se avisa en pantalla en vez de dejar la grilla vacía
     sin explicación.
     ------------------------------------------------------------ */
  async function cargarCatalogo() {
    try {
      const respuesta = await fetch("../assets/data/catalogo.json");
      if (!respuesta.ok) {
        throw new Error(`No se pudo cargar catalogo.json (HTTP ${respuesta.status})`);
      }
      catalogoCompleto = await respuesta.json();
      renderizar(catalogoCompleto);
    } catch (error) {
      console.error(error);
      grilla.innerHTML = `<p class="sin-resultados">Hubo un problema al cargar las unidades.</p>`;
    }
  }

  // ---------- Captura de eventos, desacoplada del HTML ----------
  // "input" dispara con cada tecla — da la sensación de filtro en tiempo real.
  buscador.addEventListener("input", (evento) => {
    renderizar(filtrarCatalogo(evento.target.value));
  });

  // El catálogo se pide recién cuando termina de cargar la página.
  window.addEventListener("load", cargarCatalogo);
}
