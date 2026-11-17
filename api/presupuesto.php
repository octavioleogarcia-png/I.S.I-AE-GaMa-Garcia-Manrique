<?php
/* =====================================================================
   POST api/presupuesto.php — calcula el total SIN guardar nada
   Cuerpo JSON: { "cupon"?, "items": [ { "id", "cantidad" } ] }
   200 con el desglose · 400 datos inválidos
   Lo usa la SPA para mostrar el total en vivo: el cálculo lo hace el
   servidor, el navegador solo lo muestra.
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

$input = leerJson();
[$cantidades, $problema] = Validador::items($input['items'] ?? null);
if ($problema !== null) {
    error(400, $problema);
}

$pdo = Conexion::obtener();
try {
    $calculo = (new PresupuestoService(new UnidadModel($pdo), new DescuentoModel($pdo)))
        ->calcular($cantidades, strtoupper(texto($input, 'cupon')));
} catch (InvalidArgumentException $e) {
    error(400, $e->getMessage());
}

unset($calculo['lineas']);
responder(200, ['estado' => 'exito', 'data' => $calculo]);
