<?php
/* =====================================================================
   api/unidades.php — recurso REST «unidades» (la flota)
   RF5 Catálogo Web (público) · RF1 Módulo de Flota (operario/gerente)

   GET    ?id=…  &categoria=…  &q=…   → 200 / 404            (público)
          ?todas=1 incluye dadas de baja → 200 / 401 / 403
   POST   { id, nombre, categoria, capacidad, carga_maxima,
            uso, precio, tarifa }      → 201 / 400 / 401 / 403 / 409
   PUT    ?id=…  { …mismos campos…, activo? } → 200 / 400 / 404
   DELETE ?id=…  (baja lógica)         → 200 / 404
   Escrituras: sesión + rol operario|gerente + cabecera X-CSRF-Token.
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET', 'POST', 'PUT', 'DELETE');

$unidades = new UnidadModel(Conexion::obtener());
$metodo   = $_SERVER['REQUEST_METHOD'];
$id       = isset($_GET['id']) && is_string($_GET['id']) ? $_GET['id'] : null;

if ($metodo === 'GET') {
    $usuario = sesionOpcional();
    $esStaff = $usuario !== null && in_array($usuario['rol'], ['operario', 'gerente'], true);

    if (isset($_GET['todas'])) {
        $usuario = exigirSesion();
        exigirRol($usuario, 'operario', 'gerente');
    }

    if ($id !== null) {
        $u = $unidades->obtener($id);
        if ($u === null || (!$u['activo'] && !$esStaff)) {
            error(404, 'La unidad no existe.');
        }
        responder(200, ['estado' => 'exito', 'data' => $u]);
    }

    $categoria = is_string($_GET['categoria'] ?? null) ? trim($_GET['categoria']) : null;
    $q         = is_string($_GET['q'] ?? null) ? mb_substr(trim($_GET['q']), 0, 60) : null;
    responder(200, [
        'estado'     => 'exito',
        'data'       => $unidades->listar($categoria, $q, isset($_GET['todas'])),
        'categorias' => $unidades->categorias(),
    ]);
}

// ===== Escrituras: solo personal de GaMa =====
$usuario = exigirSesion();
exigirRol($usuario, 'operario', 'gerente');
exigirCsrf();

if ($metodo === 'POST') {
    [$datos, $errores] = Validador::unidad(leerJson(), true);
    if ($errores) {
        error(400, implode(' ', $errores));
    }
    try {
        $unidades->crear($datos);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            error(409, 'Ya existe una unidad con ese identificador.');
        }
        throw $e;
    }
    responder(201, ['estado' => 'exito', 'mensaje' => 'Unidad creada.', 'data' => $unidades->obtener($datos['id'])]);
}

if ($id === null) {
    error(400, 'Falta el parámetro id.');
}
if ($unidades->obtener($id) === null) {
    error(404, 'La unidad no existe.');
}

if ($metodo === 'PUT') {
    $entrada = leerJson();
    [$datos, $errores] = Validador::unidad($entrada, false);
    if ($errores) {
        error(400, implode(' ', $errores));
    }
    $unidades->actualizar($id, $datos);
    if (array_key_exists('activo', $entrada) && is_bool($entrada['activo'])) {
        $entrada['activo'] ? $unidades->reactivar($id) : $unidades->darDeBaja($id);
    }
    responder(200, ['estado' => 'exito', 'mensaje' => 'Unidad actualizada.', 'data' => $unidades->obtener($id)]);
}

// DELETE: baja lógica (los pedidos históricos siguen apuntando a la unidad)
$unidades->darDeBaja($id);
responder(200, ['estado' => 'exito', 'mensaje' => 'Unidad dada de baja.']);
