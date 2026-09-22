// ===== Validación de cupón de descuento =====

function validarCupon() {
  // 1. Capturar los elementos del DOM
  const input = document.getElementById("inputCupon");
  const mensaje = document.getElementById("mensaje");

  // 2. Capturar el texto, limpiar espacios y pasar a mayúsculas
  const codigo = input.value.trim().toUpperCase();

  // 3. Quitar clases anteriores para que no se acumulen
  mensaje.classList.remove("mensaje-error", "mensaje-exito");

  // 4. Evaluar con if / else
  if (codigo === "") {
    mensaje.textContent = "Por favor, ingrese un código";
    mensaje.classList.add("mensaje-error");
  } else if (codigo === "UCP10") {
    mensaje.textContent = "¡Cupón aplicado! Tenés un 10% de descuento";
    mensaje.classList.add("mensaje-exito");
  } else {
    mensaje.textContent = "Código inválido o vencido";
    mensaje.classList.add("mensaje-error");
  }
}

// Conectar el botón cuando la página termina de cargar
document.addEventListener("DOMContentLoaded", function () {
  const boton = document.getElementById("btnAplicar");
  if (boton) {
    boton.addEventListener("click", validarCupon);
  }
});
