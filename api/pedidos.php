<?php
/* =====================================================================
   api/mis_pedidos.php — ENDPOINT PRIVADO del dominio GaMa
   Los pedidos de camiones de un cliente son datos personales:
   muestran dónde está su obra, qué contrata y cuánto paga.

   GET   → lista los pedidos del usuario logueado         200 / 401
   POST  → registra un pedido nuevo desde comprar.html    201 / 400 / 401
           { "direccion", "telefono", "medio_pago", "comentarios",
             "cupon", "items": [ { "id": "mixer", "cantidad": 2 } ] }
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET', 'POST');

configurarCookieSesion();
session_start();

// ===== GUARDIÁN DE SESIÓN =====
// Sin sesión no se ejecuta nada más: ni consultas ni lectura del cuerpo.
if (!isset($_SESSION['usuario_id'])) {
    http_response_code(401); // Unauthorized
    echo json_encode(['estado' => 'error', 'mensaje' => 'Acceso no autorizado. Iniciá sesión.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// El usuario SIEMPRE sale de la sesión, nunca de un parámetro del cliente:
// así nadie puede leer ni crear pedidos a nombre de otra persona.
$usuarioId = (int) $_SESSION['usuario_id'];

require_once __DIR__ . '/../config/conexion.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    listarPedidos($pdo, $usuarioId);
} else {
    crearPedido($pdo, $usuarioId);
}

/* ---------------------------------------------------------------------
   GET: pedidos del usuario con el detalle de unidades
   --------------------------------------------------------------------- */
function listarPedidos(PDO $pdo, int $usuarioId): void
{
    $stmt = $pdo->prepare(
        'SELECT p.id, p.direccion, p.medio_pago, p.cupon, p.subtotal, p.descuento_pct,
                p.total, p.estado, p.creado_en,
                i.cantidad, i.precio_unitario, u.nombre AS unidad, u.tarifa
           FROM pedidos p
           JOIN pedido_items i ON i.pedido_id = p.id
           JOIN unidades u     ON u.id = i.unidad_id
          WHERE p.usuario_id = :usuario
       ORDER BY p.creado_en DESC, p.id DESC, u.nombre'
    );
    $stmt->bindValue(':usuario', $usuarioId, PDO::PARAM_INT);
    $stmt->execute();

    // Se agrupan las filas del JOIN en un pedido con su lista de ítems.
    $pedidos = [];
    foreach ($stmt->fetchAll() as $fila) {
        $id = (int) $fila['id'];
        if (!isset($pedidos[$id])) {
            $pedidos[$id] = [
                'id'            => $id,
                'fecha'         => $fila['creado_en'],
                'direccion'     => $fila['direccion'],
                'medio_pago'    => $fila['medio_pago'],
                'cupon'         => $fila['cupon'],
                'subtotal'      => (float) $fila['subtotal'],
                'descuento_pct' => (float) $fila['descuento_pct'],
                'total'         => (float) $fila['total'],
                'estado'        => $fila['estado'],
                'items'         => [],
            ];
        }
        $pedidos[$id]['items'][] = [
            'unidad'          => $fila['unidad'],
            'tarifa'          => $fila['tarifa'],
            'cantidad'        => (int) $fila['cantidad'],
            'precio_unitario' => (float) $fila['precio_unitario'],
        ];
    }

    responder(200, ['estado' => 'exito', 'data' => array_values($pedidos)]);
}

/* ---------------------------------------------------------------------
   POST: alta de un pedido. El total se recalcula en el servidor con
   los precios de la tabla `unidades` y las reglas de descuentos.json.
   --------------------------------------------------------------------- */
function crearPedido(PDO $pdo, int $usuarioId): void
{
    $input = leerJson();

    $direccion   = texto($input, 'direccion');
    $telefono    = texto($input, 'telefono');
    $medioPago   = texto($input, 'medio_pago');
    $comentarios = texto($input, 'comentarios');
    $cupon       = strtoupper(texto($input, 'cupon'));
    $items       = $input['items'] ?? null;

    $mediosValidos = ['Efectivo', 'Transferencia bancaria', 'Tarjeta de débito/crédito', 'Cheque'];

    $errores = [];
    if (mb_strlen($direccion) < 5 || mb_strlen($direccion) > 200) {
        $errores[] = 'Ingresá la dirección de entrega.';
    }
    if (!preg_match('/^[0-9 +()-]{6,30}$/', $telefono)) {
        $errores[] = 'El teléfono no es válido.';
    }
    if (!in_array($medioPago, $mediosValidos, true)) {
        $errores[] = 'Elegí un medio de pago válido.';
    }
    if (mb_strlen($comentarios) > 500) {
        $errores[] = 'Los comentarios no pueden superar los 500 caracteres.';
    }

    // Ítems: lista de { id, cantidad } sin repetidos, cantidad entera de 1 a 100.
    $cantidades = [];
    if (!is_array($items) || count($items) === 0 || count($items) > 20) {
        $errores[] = 'Elegí al menos una unidad.';
    } else {
        foreach ($items as $item) {
            $id       = is_array($item) && is_string($item['id'] ?? null) ? $item['id'] : '';
            $cantidad = is_array($item) ? filter_var($item['cantidad'] ?? null, FILTER_VALIDATE_INT) : false;
            if ($id === '' || $cantidad === false || $cantidad < 1 || $cantidad > 100 || isset($cantidades[$id])) {
                $errores[] = 'Hay unidades con datos inválidos.';
                break;
            }
            $cantidades[$id] = $cantidad;
        }
    }

    if ($errores) {
        responder(400, ['estado' => 'error', 'mensaje' => implode(' ', array_unique($errores))]);
    }

    // Precios reales desde la base (consulta preparada con un marcador por id).
    $marcadores = implode(',', array_fill(0, count($cantidades), '?'));
    $stmt = $pdo->prepare("SELECT id, precio FROM unidades WHERE id IN ($marcadores)");
    $stmt->execute(array_keys($cantidades));
    $precios = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    if (count($precios) !== count($cantidades)) {
        responder(400, ['estado' => 'error', 'mensaje' => 'Alguna de las unidades elegidas no existe.']);
    }

    // Subtotal y cantidad total de viajes/jornadas
    $subtotal = 0;
    $viajes   = 0;
    foreach ($cantidades as $id => $cantidad) {
        $subtotal += (float) $precios[$id] * $cantidad;
        $viajes   += $cantidad;
    }

    // Descuentos: misma regla que el presupuesto de comprar.html
    // (mejor descuento por volumen + cupón, con tope del 100 %).
    $reglas = json_decode((string) @file_get_contents(__DIR__ . '/../assets/data/descuentos.json'), true) ?: [];

    $pctVolumen = 0;
    foreach ($reglas['reglasPorVolumen'] ?? [] as $regla) {
        if ($viajes >= $regla['minViajes']) {
            $pctVolumen = max($pctVolumen, $regla['porcentaje']);
        }
    }

    $pctCupon = 0;
    if ($cupon !== '') {
        if (!isset($reglas['cupones'][$cupon])) {
            responder(400, ['estado' => 'error', 'mensaje' => 'El código de descuento no es válido.']);
        }
        $pctCupon = $reglas['cupones'][$cupon]['porcentaje'];
    }

    $pctTotal = min($pctVolumen + $pctCupon, 100);
    $total    = round($subtotal * (1 - $pctTotal / 100), 2);

    try {
        // Pedido + ítems en una transacción: se guarda todo o nada.
        $pdo->beginTransaction();

        $stmt = $pdo->prepare(
            'INSERT INTO pedidos (usuario_id, direccion, telefono, medio_pago, comentarios,
                                  cupon, subtotal, descuento_pct, total)
             VALUES (:usuario, :direccion, :telefono, :medio, :comentarios,
                     :cupon, :subtotal, :pct, :total)'
        );
        $stmt->bindValue(':usuario',     $usuarioId, PDO::PARAM_INT);
        $stmt->bindValue(':direccion',   $direccion, PDO::PARAM_STR);
        $stmt->bindValue(':telefono',    $telefono,  PDO::PARAM_STR);
        $stmt->bindValue(':medio',       $medioPago, PDO::PARAM_STR);
        $stmt->bindValue(':comentarios', $comentarios !== '' ? $comentarios : null, $comentarios !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $stmt->bindValue(':cupon',       $cupon !== '' ? $cupon : null,             $cupon !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $stmt->bindValue(':subtotal',    number_format($subtotal, 2, '.', ''), PDO::PARAM_STR);
        $stmt->bindValue(':pct',         number_format($pctTotal, 2, '.', ''), PDO::PARAM_STR);
        $stmt->bindValue(':total',       number_format($total, 2, '.', ''),    PDO::PARAM_STR);
        $stmt->execute();

        $pedidoId = (int) $pdo->lastInsertId();

        $stmtItem = $pdo->prepare(
            'INSERT INTO pedido_items (pedido_id, unidad_id, cantidad, precio_unitario)
             VALUES (:pedido, :unidad, :cantidad, :precio)'
        );
        foreach ($cantidades as $id => $cantidad) {
            $stmtItem->bindValue(':pedido',   $pedidoId,       PDO::PARAM_INT);
            $stmtItem->bindValue(':unidad',   $id,             PDO::PARAM_STR);
            $stmtItem->bindValue(':cantidad', $cantidad,       PDO::PARAM_INT);
            $stmtItem->bindValue(':precio',   $precios[$id],   PDO::PARAM_STR);
            $stmtItem->execute();
        }

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('GaMa mis_pedidos: ' . $e->getMessage());
        responder(500, ['estado' => 'error', 'mensaje' => 'No se pudo registrar el pedido.']);
    }

    responder(201, [
        'estado'  => 'exito',
        'mensaje' => 'Pedido registrado.',
        'data'    => [
            'id'            => $pedidoId,
            'subtotal'      => $subtotal,
            'descuento_pct' => $pctTotal,
            'total'         => $total,
            'estado'        => 'pendiente',
        ],
    ]);
}
