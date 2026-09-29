/* GaMa — Catálogo de unidades y servicios
   Un único array fuente de verdad, consumido por listado_tabla.html,
   listado_box.html, producto.html y comprar.html. */

// Array principal con todos los productos/servicios de GaMa
const PRODUCTOS = [
  {
    // Identificador único (usado en URLs y búsquedas)
    id: "volcador-chico",
    // Nombre mostrado al usuario
    nombre: "Volcador Chico 5 m³",
    // Tipo/categoría del producto
    categoria: "Volcador",
    // Capacidad de carga en volumen
    capacidad: "5 m³",
    // Carga máxima permitida en peso
    cargaMaxima: "6.500 kg",
    // Descripción breve del uso
    uso: "Escombros y áridos en obras urbanas, calles angostas",
    // Precio de referencia en pesos argentinos
    precio: 45000,
    // Unidad de tarifa (por viaje, por km, por jornada, etc.)
    unidad: "por viaje (hasta 15 km)",
    // Ruta al ícono SVG
    icono: "../assets/img/dumptruck-small.svg",
    // Descripción completa del producto
    descripcion:
      "La unidad más ágil de la flota. Entra donde un camión grande no puede: obras en construcción dentro de la ciudad, retiro de escombros de demoliciones chicas y entregas de arena o piedra en cantidades acotadas. Ideal cuando el acceso a la obra es reducido.",
  },
  {
    id: "volcador-grande",
    nombre: "Volcador Grande 12 m³",
    categoria: "Volcador",
    capacidad: "12 m³",
    cargaMaxima: "14.000 kg",
    uso: "Movimiento de tierra en obras de mayor escala",
    precio: 78000,
    unidad: "por viaje (hasta 15 km)",
    icono: "../assets/img/dumptruck-large.svg",
    descripcion:
      "Pensado para obras que mueven volumen: desmontes, nivelación de terrenos y provisión de áridos en cantidad. Reduce la cantidad de viajes necesarios frente al volcador chico, bajando el costo por metro cúbico transportado.",
  },
  {
    id: "acoplado",
    nombre: "Camión con Acoplado",
    categoria: "Transporte pesado",
    capacidad: "20 m³ combinados",
    cargaMaxima: "22.000 kg",
    uso: "Traslados de larga distancia entre obras o depósitos",
    precio: 15000,
    unidad: "por km recorrido",
    icono: "../assets/img/trailer.svg",
    descripcion:
      "Combinación de chasis y acoplado para viajes de ruta. Se cotiza por kilómetro porque el costo real de este servicio depende de la distancia, no de la carga en sí. Adecuado para abastecer obras alejadas del depósito central.",
  },
  {
    id: "semi-banadera",
    nombre: "Semirremolque Bañadera",
    categoria: "Transporte pesado",
    capacidad: "30 m³",
    cargaMaxima: "30.000 kg",
    uso: "Áridos a granel para grandes volúmenes",
    precio: 18500,
    unidad: "por km recorrido",
    icono: "../assets/img/tanker-trailer.svg",
    descripcion:
      "La mayor capacidad de la flota. Se usa para abastecer obras grandes con arena, piedra o tierra en volúmenes que no serían rentables de mover en varios viajes chicos. Requiere acceso amplio para maniobrar.",
  },
  {
    id: "mixer",
    nombre: "Mixer Hormigonero",
    categoria: "Servicio especial",
    capacidad: "6 m³",
    cargaMaxima: "12.000 kg",
    uso: "Entrega de hormigón elaborado en obra",
    precio: 95000,
    unidad: "por viaje",
    icono: "../assets/img/mixer.svg",
    descripcion:
      "Transporta hormigón ya mezclado, en agitación constante durante el viaje, listo para volcar en obra. El precio incluye la entrega en punto de vuelco; consultar recargo por bombeo si la obra no tiene acceso directo.",
  },
  {
    id: "hidrogrua",
    nombre: "Hidrogrúa 8 Tn",
    categoria: "Servicio especial",
    capacidad: "8.000 kg de izaje",
    cargaMaxima: "8.000 kg",
    uso: "Carga y descarga de materiales pesados, vigas y paneles",
    precio: 60000,
    unidad: "por media jornada",
    icono: "../assets/img/crane.svg",
    descripcion:
      "No transporta material: se usa para izar y ubicar cargas pesadas en obra, como vigas prefabricadas, paneles o maquinaria. Se contrata por jornada porque el trabajo depende del tiempo de maniobra, no de la distancia.",
  },
];

// Función: formatea un número como moneda en pesos argentinos
// Parámetro: valor (número)
// Retorna: string con formato "$ XXX.XXX" (sin decimales) o "$ 0" si es inválido
function formatearPrecio(valor) {
  // Validar que sea un número válido
  if (typeof valor !== "number" || isNaN(valor) || valor < 0) {
    return "$ 0";
  }
  return valor.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

// Función: busca un producto por su id
// Parámetro: id (string)
// Retorna: objeto del producto encontrado, o undefined si no existe
function buscarProducto(id) {
  return PRODUCTOS.find((p) => p.id === id);
}
// ====================================================================
// RETO JS - OPCIÓN 3 (Buscador, Filtro y Fetch para listado_box.html)
// ====================================================================

document.addEventListener("DOMContentLoaded", () => {
  const grilla = document.getElementById("grilla-productos");
  const buscador = document.getElementById("inputBuscador");
  
  // Si no estamos en listado_box.html, cortamos la ejecución acá para no romper otras pantallas
  if (!grilla || !buscador) return;

  let catalogoAsincrono = [];

  // 1. Carga asincrónica exclusiva para esta vista
  async function cargarDatos() {
    try {
      const respuesta = await fetch("../actividad/actividad-2/productos.json");
      if (!respuesta.ok) throw new Error("No se pudo cargar el archivo JSON");
      
      catalogoAsincrono = await respuesta.json();
      renderizar(catalogoAsincrono);
    } catch (error) {
      console.error("Error:", error);
      grilla.innerHTML = "<p>Hubo un problema al cargar las unidades.</p>";
    }
  }

  // 2. Inyección dinámica en el DOM
  function renderizar(productosA_Mostrar) {
    grilla.innerHTML = ""; 

    if (productosA_Mostrar.length === 0) {
      grilla.innerHTML = "<p>No se encontraron unidades para esa búsqueda.</p>";
      return;
    }

    productosA_Mostrar.forEach((p) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "box-producto";
      // Reutilizamos tu función global formatearPrecio() que ya existe arriba
      tarjeta.innerHTML = `
        <div class="visor"><img src="${p.icono}" alt="" /></div>
        <div class="cuerpo">
          <span class="categoria">${p.categoria}</span>
          <h3>${p.nombre}</h3>
          <p class="uso">${p.uso}</p>
          <div class="pie">
            <span class="precio">${formatearPrecio(p.precio)}<small> ${p.unidad}</small></span>
            <a class="boton boton-primario" href="producto.html?id=${p.id}">Ver ficha</a>
          </div>
        </div>
      `;
      grilla.appendChild(tarjeta);
    });
  }

  // 3. Captura del evento input y filtro en memoria
  buscador.addEventListener("input", (evento) => {
    const termino = evento.target.value.toLowerCase();
    
    const filtrados = catalogoAsincrono.filter((p) => 
      p.nombre.toLowerCase().includes(termino) ||
      p.categoria.toLowerCase().includes(termino)
    );
    
    renderizar(filtrados);
  });

  // Arrancamos la carga de datos
  cargarDatos();
});
