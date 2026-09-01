/* GaMa — catálogo de unidades y servicios
   Un único array fuente de verdad, consumido por listado_tabla.html,
   listado_box.html, producto.html y comprar.html. */

const PRODUCTOS = [
  {
    id: "volcador-chico",
    nombre: "Volcador Chico 5 m³",
    categoria: "Volcador",
    capacidad: "5 m³",
    cargaMaxima: "6.500 kg",
    uso: "Escombros y áridos en obras urbanas, calles angostas",
    precio: 45000,
    unidad: "por viaje (hasta 15 km)",
    icono: "img/dumptruck-small.svg",
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
    icono: "img/dumptruck-large.svg",
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
    icono: "img/trailer.svg",
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
    icono: "img/tanker-trailer.svg",
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
    icono: "img/mixer.svg",
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
    icono: "img/crane.svg",
    descripcion:
      "No transporta material: se usa para izar y ubicar cargas pesadas en obra, como vigas prefabricadas, paneles o maquinaria. Se contrata por jornada porque el trabajo depende del tiempo de maniobra, no de la distancia.",
  },
];

// Devuelve el precio formateado en pesos argentinos
function formatearPrecio(valor) {
  return valor.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

// Busca un producto por id
function buscarProducto(id) {
  return PRODUCTOS.find((p) => p.id === id);
}
