/* ============================================================
   Intercátedra Investigación Operativa + Paradigmas III
   Optimizador de Programación Lineal — Opción B (interfaz +
   cálculo propio, sin librerías externas).

   MÉTODO IMPLEMENTADO: método gráfico / de vértices.
   Válido porque el modelo relevado tiene exactamente 2 variables
   de decisión. El teorema fundamental de la Programación Lineal
   dice que, si el óptimo existe, se alcanza en al menos un vértice
   de la región factible — así que alcanza con:
     1) Calcular la intersección de cada par de restricciones (rectas)
     2) Quedarnos con las intersecciones que cumplen TODAS las
        restricciones (los vértices factibles)
     3) Evaluar Z en cada vértice factible
     4) Elegir el mejor (máximo o mínimo, según corresponda)
   ============================================================ */

// ---------- Modelo inicial: caso relevado de GaMa (AE1 de I.O.) ----------
// x1 = viajes/mes de Volcador Chico · x2 = viajes/mes de Volcador Grande
const RESTRICCIONES_INICIALES = [
  { nombre: "Horas de conducción",  a1: 2,  a2: 5,  op: "<=", b: 32  },
  { nombre: "Gasoil disponible",    a1: 30, a2: 60, op: "<=", b: 900 },
  { nombre: "Contrato mínimo",      a1: 1,  a2: 1,  op: ">=", b: 10  },
];

// ---------- Referencias a nodos del DOM ----------
const cuerpoRestricciones = document.querySelector("#cuerpo-restricciones");
const btnAgregar = document.querySelector("#btn-agregar");
const btnCalcular = document.querySelector("#btn-calcular");
const mensajeError = document.querySelector("#mensaje-error");
const resultado = document.querySelector("#resultado");
const outX1 = document.querySelector("#out-x1");
const outX2 = document.querySelector("#out-x2");
const outZ = document.querySelector("#out-z");
const cuerpoVertices = document.querySelector("#cuerpo-vertices");
const svgGrafico = document.querySelector("#grafico");

let contadorFilas = 0;

// Crea una fila de la tabla de restricciones (reutilizada al agregar y al precargar)
function crearFilaRestriccion({ nombre = "", a1 = 1, a2 = 1, op = "<=", b = 0 } = {}) {
  contadorFilas++;
  const fila = document.createElement("tr");
  fila.dataset.id = contadorFilas;
  fila.innerHTML = `
    <td><input type="text" class="in-nombre" value="${nombre}" placeholder="Restricción ${contadorFilas}" /></td>
    <td><input type="number" class="in-a1" value="${a1}" step="any" /></td>
    <td><input type="number" class="in-a2" value="${a2}" step="any" /></td>
    <td class="col-op">
      <select class="in-op">
        <option value="<=" ${op === "<=" ? "selected" : ""}>&le;</option>
        <option value=">=" ${op === ">=" ? "selected" : ""}>&ge;</option>
        <option value="=" ${op === "=" ? "selected" : ""}>=</option>
      </select>
    </td>
    <td><input type="number" class="in-b" value="${b}" step="any" /></td>
    <td class="col-btn"><button type="button" class="btn-quitar">Quitar</button></td>
  `;
  return fila;
}

// Precarga las restricciones iniciales del caso GaMa
RESTRICCIONES_INICIALES.forEach((r) => {
  cuerpoRestricciones.appendChild(crearFilaRestriccion(r));
});

// Captura de evento: agregar una fila de restricción vacía
btnAgregar.addEventListener("click", () => {
  cuerpoRestricciones.appendChild(crearFilaRestriccion({ a1: 1, a2: 1, op: "<=", b: 0 }));
});

// Captura de evento (delegación): quitar una fila puntual
cuerpoRestricciones.addEventListener("click", (evento) => {
  if (evento.target.classList.contains("btn-quitar")) {
    evento.target.closest("tr").remove();
  }
});

// Lee el estado actual del formulario y arma la estructura de datos del modelo
function leerModelo() {
  const tipoObjetivo = document.querySelector("#tipo-objetivo").value; // "max" | "min"
  const c1 = Number(document.querySelector("#coef-c1").value);
  const c2 = Number(document.querySelector("#coef-c2").value);

  const restricciones = [];
  cuerpoRestricciones.querySelectorAll("tr").forEach((fila) => {
    restricciones.push({
      nombre: fila.querySelector(".in-nombre").value || "Restricción",
      a1: Number(fila.querySelector(".in-a1").value),
      a2: Number(fila.querySelector(".in-a2").value),
      op: fila.querySelector(".in-op").value,
      b: Number(fila.querySelector(".in-b").value),
    });
  });

  // No-negatividad: se agrega siempre, aunque el usuario no la escriba a mano
  restricciones.push({ nombre: "x1 ≥ 0", a1: 1, a2: 0, op: ">=", b: 0 });
  restricciones.push({ nombre: "x2 ≥ 0", a1: 0, a2: 1, op: ">=", b: 0 });

  return { tipoObjetivo, c1, c2, restricciones };
}

// Verifica si un punto (x1,x2) cumple una restricción, con tolerancia numérica
function cumpleRestriccion(x1, x2, r, eps = 1e-6) {
  const valor = r.a1 * x1 + r.a2 * x2;
  if (r.op === "<=") return valor <= r.b + eps;
  if (r.op === ">=") return valor >= r.b - eps;
  return Math.abs(valor - r.b) <= eps; // "="
}

// Resuelve la intersección de dos rectas a1*x1 + a2*x2 = b (regla de Cramer)
function interseccion(r1, r2) {
  const det = r1.a1 * r2.a2 - r2.a1 * r1.a2;
  if (Math.abs(det) < 1e-9) return null; // rectas paralelas: no hay intersección única
  const x1 = (r1.b * r2.a2 - r2.b * r1.a2) / det;
  const x2 = (r1.a1 * r2.b - r2.a1 * r1.b) / det;
  return { x1, x2 };
}

// Algoritmo principal: método de vértices para 2 variables
function resolverPL(modelo) {
  const { restricciones, c1, c2, tipoObjetivo } = modelo;
  const vertices = [];

  // 1) Intersección de cada par de restricciones (tratadas como rectas)
  for (let i = 0; i < restricciones.length; i++) {
    for (let j = i + 1; j < restricciones.length; j++) {
      const punto = interseccion(restricciones[i], restricciones[j]);
      if (!punto) continue;

      // 2) Filtrar: el punto debe cumplir TODAS las restricciones para ser un vértice factible
      const esFactible = restricciones.every((r) => cumpleRestriccion(punto.x1, punto.x2, r));
      if (!esFactible) continue;

      // Evitar duplicados (mismo vértice encontrado por distintos pares de rectas)
      const yaExiste = vertices.some(
        (v) => Math.abs(v.x1 - punto.x1) < 1e-6 && Math.abs(v.x2 - punto.x2) < 1e-6
      );
      if (yaExiste) continue;

      // 3) Evaluar Z en el vértice
      const z = c1 * punto.x1 + c2 * punto.x2;
      vertices.push({ x1: punto.x1, x2: punto.x2, z });
    }
  }

  if (vertices.length === 0) {
    return { factible: false, vertices: [] };
  }

  // 4) Elegir el mejor vértice según el tipo de objetivo
  let optimo = vertices[0];
  vertices.forEach((v) => {
    if (tipoObjetivo === "max" ? v.z > optimo.z : v.z < optimo.z) optimo = v;
  });

  return { factible: true, vertices, optimo };
}

// Formatea número para mostrar (sin decimales innecesarios)
function formatearNumero(n) {
  return Number(n.toFixed(4)).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Elige un "paso" de grilla prolijo (1, 2, 5, 10, 20, 50...) para un rango dado,
// apuntando a mostrar entre 4 y 8 marcas sobre el eje.
function pasoLindo(valorMaximo) {
  const pasosBase = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const objetivo = valorMaximo / 6;
  let elegido = pasosBase[pasosBase.length - 1];
  for (const paso of pasosBase) {
    if (paso >= objetivo) { elegido = paso; break; }
  }
  return elegido;
}

// Dibuja la región factible + vértices + óptimo como SVG, con ejes numerados y grilla
function dibujarGrafico(vertices, optimo) {
  const margenIzq = 60, margenDer = 30, margenSup = 24, margenInf = 56;
  const ancho = 560, alto = 440;
  const anchoEscena = ancho - margenIzq - margenDer;
  const altoEscena = alto - margenSup - margenInf;

  const maxX1 = Math.max(1, ...vertices.map((v) => v.x1)) * 1.2;
  const maxX2 = Math.max(1, ...vertices.map((v) => v.x2)) * 1.2;

  const px = (x1) => margenIzq + (x1 / maxX1) * anchoEscena;
  const py = (x2) => alto - margenInf - (x2 / maxX2) * altoEscena;

  const pasoX1 = pasoLindo(maxX1);
  const pasoX2 = pasoLindo(maxX2);

  let svg = "";

  // ---- Grilla + numeración del eje x1 ----
  for (let x = 0; x <= maxX1; x += pasoX1) {
    const xPix = px(x);
    svg += `<line x1="${xPix}" y1="${margenSup}" x2="${xPix}" y2="${alto - margenInf}" stroke="#e7e3d8" stroke-width="1" />`;
    svg += `<text x="${xPix}" y="${alto - margenInf + 18}" font-size="11" fill="#6b6656" text-anchor="middle">${formatearNumero(x)}</text>`;
  }
  // ---- Grilla + numeración del eje x2 ----
  for (let y = 0; y <= maxX2; y += pasoX2) {
    const yPix = py(y);
    svg += `<line x1="${margenIzq}" y1="${yPix}" x2="${ancho - margenDer}" y2="${yPix}" stroke="#e7e3d8" stroke-width="1" />`;
    svg += `<text x="${margenIzq - 10}" y="${yPix + 4}" font-size="11" fill="#6b6656" text-anchor="end">${formatearNumero(y)}</text>`;
  }

  // ---- Ejes principales (encima de la grilla) ----
  svg += `<line x1="${margenIzq}" y1="${alto - margenInf}" x2="${ancho - margenDer}" y2="${alto - margenInf}" stroke="#1f2226" stroke-width="1.5" />`;
  svg += `<line x1="${margenIzq}" y1="${alto - margenInf}" x2="${margenIzq}" y2="${margenSup}" stroke="#1f2226" stroke-width="1.5" />`;

  // ---- Títulos de los ejes ----
  svg += `<text x="${margenIzq + anchoEscena / 2}" y="${alto - 10}" font-size="12.5" font-weight="700" fill="#201d1a" text-anchor="middle">x₁ (viajes Volcador Chico)</text>`;
  svg += `<text x="14" y="${margenSup + altoEscena / 2}" font-size="12.5" font-weight="700" fill="#201d1a" text-anchor="middle" transform="rotate(-90 14 ${margenSup + altoEscena / 2})">x₂ (viajes Volcador Grande)</text>`;

  // ---- Región factible (polígono ordenado angularmente) ----
  const cx = vertices.reduce((s, v) => s + v.x1, 0) / vertices.length;
  const cy = vertices.reduce((s, v) => s + v.x2, 0) / vertices.length;
  const ordenados = [...vertices].sort(
    (a, b) => Math.atan2(a.x2 - cy, a.x1 - cx) - Math.atan2(b.x2 - cy, b.x1 - cx)
  );
  const puntosPoligono = ordenados.map((v) => `${px(v.x1)},${py(v.x2)}`).join(" ");
  svg += `<polygon points="${puntosPoligono}" fill="#f5b30144" stroke="#3d6a82" stroke-width="2.2" />`;

  // ---- Vértices, resaltando el óptimo ----
  ordenados.forEach((v) => {
    const esOptimo = optimo && Math.abs(v.x1 - optimo.x1) < 1e-6 && Math.abs(v.x2 - optimo.x2) < 1e-6;
    const etiqueta = `(${formatearNumero(v.x1)}, ${formatearNumero(v.x2)})`;
    svg += `<circle cx="${px(v.x1)}" cy="${py(v.x2)}" r="${esOptimo ? 7 : 4.5}" fill="${esOptimo ? "#d9541f" : "#1f2226"}" stroke="#fff" stroke-width="1.5" />`;
    svg += `<text x="${px(v.x1) + 10}" y="${py(v.x2) - 10}" font-size="11.5" font-weight="${esOptimo ? "700" : "400"}" fill="${esOptimo ? "#d9541f" : "#201d1a"}">${etiqueta}${esOptimo ? " ← óptimo" : ""}</text>`;
  });

  svgGrafico.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
  svgGrafico.setAttribute("width", ancho);
  svgGrafico.setAttribute("height", alto);
  svgGrafico.innerHTML = svg;
}

// Vuelca los resultados en pantalla: variables óptimas, tabla de vértices y gráfico
function mostrarResultado(resolucion) {
  if (!resolucion.factible) {
    mensajeError.textContent = "El modelo no tiene región factible (o no está acotada) con las restricciones cargadas. Revisá los coeficientes.";
    mensajeError.classList.add("visible");
    resultado.classList.remove("visible");
    return;
  }

  mensajeError.classList.remove("visible");

  outX1.textContent = formatearNumero(resolucion.optimo.x1);
  outX2.textContent = formatearNumero(resolucion.optimo.x2);
  outZ.textContent = "$ " + formatearNumero(resolucion.optimo.z);

  cuerpoVertices.innerHTML = "";
  resolucion.vertices
    .slice()
    .sort((a, b) => b.z - a.z)
    .forEach((v) => {
      const fila = document.createElement("tr");
      const esOptimo = v === resolucion.optimo;
      if (esOptimo) fila.classList.add("es-optimo");
      fila.innerHTML = `
        <td>${formatearNumero(v.x1)}</td>
        <td>${formatearNumero(v.x2)}</td>
        <td>$ ${formatearNumero(v.z)}${esOptimo ? " ← óptimo" : ""}</td>
      `;
      cuerpoVertices.appendChild(fila);
    });

  dibujarGrafico(resolucion.vertices, resolucion.optimo);
  resultado.classList.add("visible");
}

// Captura de evento: click en "Calcular óptimo"
btnCalcular.addEventListener("click", () => {
  const modelo = leerModelo();
  const resolucion = resolverPL(modelo);
  mostrarResultado(resolucion);
});

// Calcula automáticamente con el modelo precargado apenas termina de cargar la página
window.addEventListener("load", () => {
  btnCalcular.click();
});
