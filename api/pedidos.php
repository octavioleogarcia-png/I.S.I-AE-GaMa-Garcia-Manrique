<?php
/* =====================================================================
   api/pedidos.php — recurso REST «pedidos» (RF6 Sistema de Pedidos, RF3)
   Todo requiere sesión (401 si no hay).

   GET    (cliente) sus pedidos · ?id=… uno solo
          ?todos=1&estado=… (operario/gerente) todos        → 200 / 401 / 403 / 404
   POST   { direccion, telefono, medio_pago, comentarios?, cupon?,
            items:[{id,cantidad}] }                           → 201 / 400 / 401 / 403
   PUT    ?id=… { "estado": "confirmado" } (operario/gerente) → 200 / 400 / 404 / 409
   DELETE ?id=…  cancela el pedido (el cliente solo si está pendiente)
                                                              → 200 / 404 / 409
   Escrituras: cabecera X-CSRF-Token obligatoria.
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET', 'POST', 'PUT', 'DELETE');

$usuario = exigirSesion();                 // guardián: sin sesión no se ejecuta nada más
$pdo     = Conexion::obtener();
$pedidos = new PedidoModel($pdo);
$metodo  = $_SERVER['REQUEST_METHOD'];
$esStaff = in_array($usuario['rol'], ['operario', 'gerente'], true);

// El id de pedido llega por URL y se valida como entero positivo.
$id = null;
if (isset($_GET['id'])) {
    $id = filter_var($_GET['id'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) {
        error(400, 'El id del pedido no es válido.');
    }
}

// Un cliente solo "ve" sus propios pedidos; si no es suyo, responde 404 (no 403)
// para no confirmar que ese pedido existe.
function pedidoVisible(PedidoModel $m, int $id, array $usuario, bool $esStaff): array
{
    $p = $m->obtener($id);
    if ($p === null || (!$esStaff && $p['usuario_id'] !== $usuario['id'])) {
        error(404, 'El pedido no existe.');
    }
    return $p;
}

switch ($metodo) {
    case 'GET':
        if ($id !== null) {
            responder(200, ['estado' => 'exito', 'data' => pedidoVisible($pedidos, $id, $usuario, $esStaff)]);
        }
        if (isset($_GET['todos'])) {
            exigirRol($usuario, 'operario', 'gerente');
            $estado = is_string($_GET['estado'] ?? null) ? $_GET['estado'] : null;
            if ($estado !== null && !in_array($estado, PedidoModel::ESTADOS, true)) {
                error(400, 'El estado indicado no es válido.');
            }
            responder(200, ['estado' => 'exito', 'data' => $pedidos->listarTodos($estado)]);
        }
        // El usuario SIEMPRE sale de la sesión, nunca de un parámetro del cliente.
        responder(200, ['estado' => 'exito', 'data' => $pedidos->listarPorUsuario($usuario['id'])]);

    case 'POST':
        exigirCsrf();
        $in = leerJson();
        $datos = [
            'direccion'   => texto($in, 'direccion'),
            'telefono'    => texto($in, 'telefono'),
            'medio_pago'  => texto($in, 'medio_pago'),
            'comentarios' => texto($in, 'comentarios'),
            'cupon'       => strtoupper(texto($in, 'cupon')),
        ];
        $errores = [];
        if (mb_strlen($datos['direccion']) < 5 || mb_strlen($datos['direccion']) > 200) {
            $errores[] = 'Ingresá la dirección de entrega.';
        }
        if (!Validador::telefono($datos['telefono'])) {
            $errores[] = 'El teléfono no es válido.';
        }
        if (!in_array($datos['medio_pago'], Validador::MEDIOS_PAGO, true)) {
            $errores[] = 'Elegí un medio de pago válido.';
        }
        if (mb_strlen($datos['comentarios']) > 500) {
            $errores[] = 'Los comentarios no pueden superar los 500 caracteres.';
        }
        [$cantidades, $problema] = Validador::items($in['items'] ?? null);
        if ($problema !== null) {
            $errores[] = $problema;
        }
        if ($errores) {
            error(400, implode(' ', array_unique($errores)));
        }

        // El total se recalcula en el servidor: el precio que mande el navegador no cuenta.
        try {
            $calculo = (new PresupuestoService(new UnidadModel($pdo), new DescuentoModel($pdo)))
                ->calcular($cantidades, $datos['cupon']);
        } catch (InvalidArgumentException $e) {
            error(400, $e->getMessage());
        }
        $nuevoId = $pedidos->crear($usuario['id'], $datos, $calculo['lineas'], $calculo);

        responder(201, [
            'estado' => 'exito', 'mensaje' => 'Pedido registrado.',
            'data'   => [
                'id' => $nuevoId, 'subtotal' => $calculo['subtotal'],
                'descuento_pct' => $calculo['descuento_pct'], 'total' => $calculo['total'],
                'estado' => 'pendiente',
            ],
        ]);

    case 'PUT':
        exigirRol($usuario, 'operario', 'gerente');
        exigirCsrf();
        if ($id === null) {
            error(400, 'Falta el parámetro id.');
        }
        $nuevo = texto(leerJson(), 'estado');
        if (!in_array($nuevo, PedidoModel::ESTADOS, true)) {
            error(400, 'El estado indicado no es válido.');
        }
        $actual = pedidoVisible($pedidos, $id, $usuario, true);

        // Flujo permitido: pendiente → confirmado → en viaje → entregado (se puede cancelar antes de salir).
        $transiciones = [
            'pendiente'  => ['confirmado', 'cancelado'],
            'confirmado' => ['en viaje', 'cancelado'],
            'en viaje'   => ['entregado'],
            'entregado'  => [],
            'cancelado'  => [],
        ];
        if (!in_array($nuevo, $transiciones[$actual['estado']], true)) {
            error(409, "No se puede pasar de «{$actual['estado']}» a «$nuevo».");
        }
        $pedidos->cambiarEstado($id, $nuevo);
        responder(200, ['estado' => 'exito', 'mensaje' => 'Estado actualizado.', 'data' => $pedidos->obtener($id)]);

    case 'DELETE':
        exigirCsrf();
        if ($id === null) {
            error(400, 'Falta el parámetro id.');
        }
        $actual = pedidoVisible($pedidos, $id, $usuario, $esStaff);
        $cancelables = $esStaff ? ['pendiente', 'confirmado'] : ['pendiente'];
        if (!in_array($actual['estado'], $cancelables, true)) {
            error(409, 'Este pedido ya no se puede cancelar.');
        }
        $pedidos->cambiarEstado($id, 'cancelado');
        responder(200, ['estado' => 'exito', 'mensaje' => 'Pedido cancelado.']);
}
