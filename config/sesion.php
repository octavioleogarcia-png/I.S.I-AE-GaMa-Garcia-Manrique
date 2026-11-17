<?php
/* =====================================================================
   GaMa — Utilidades compartidas por todos los endpoints (controladores)
   ---------------------------------------------------------------------
   - Cabeceras JSON y manejo global de errores (500 sin filtrar datos).
   - responder(): devuelve JSON con su código HTTP y corta la ejecución.
   - leerJson(): lee y valida el cuerpo JSON de la petición.
   - Sesión: abrirSesion(), exigirSesion(), exigirRol(), exigirCsrf().
   ===================================================================== */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Cualquier excepción que nadie atrape termina acá: el detalle va al log del
// servidor y el navegador solo recibe un mensaje genérico (OWASP A05/A09).
set_exception_handler(function (Throwable $e): void {
    error_log('GaMa: ' . get_class($e) . ' · ' . $e->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo json_encode(['estado' => 'error', 'mensaje' => 'Error interno del servidor.'], JSON_UNESCAPED_UNICODE);
    exit;
});

// Los modelos y servicios se cargan una sola vez desde acá.
foreach (['conexion'] as $archivo) {
    require_once __DIR__ . "/$archivo.php";
}
foreach (['UsuarioModel', 'UnidadModel', 'PedidoModel', 'DescuentoModel', 'ReporteModel'] as $archivo) {
    require_once __DIR__ . "/../models/$archivo.php";
}
foreach (['Validador', 'PresupuestoService'] as $archivo) {
    require_once __DIR__ . "/../services/$archivo.php";
}

const SESION_NOMBRE      = 'GAMA_SESION';
const SESION_INACTIVIDAD = 1800; // 30 minutos sin actividad cierran la sesión

function responder(int $codigo, array $cuerpo): void
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

function error(int $codigo, string $mensaje): void
{
    responder($codigo, ['estado' => 'error', 'mensaje' => $mensaje]);
}

function exigirMetodo(string ...$metodos): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'], $metodos, true)) {
        header('Allow: ' . implode(', ', $metodos));
        error(405, 'Método no permitido.');
    }
}

function leerJson(): array
{
    // Solo se acepta JSON: un formulario HTML de otro sitio no puede mandar
    // este Content-Type sin permiso del navegador (otra capa contra CSRF).
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($tipo, 'application/json') !== 0) {
        error(415, 'El cuerpo debe enviarse como JSON.');
    }
    $datos = json_decode(file_get_contents('php://input'), true);
    if (!is_array($datos)) {
        error(400, 'JSON inválido.');
    }
    return $datos;
}

// Lee un campo de texto del JSON sin romperse si llega un array u otro tipo.
function texto(array $datos, string $clave): string
{
    return is_string($datos[$clave] ?? null) ? trim($datos[$clave]) : '';
}

/* ------------------------------ Sesión ------------------------------ */

function configurarCookieSesion(): void
{
    $esHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

    ini_set('session.use_strict_mode', '1');   // rechaza IDs de sesión que no generó el servidor
    ini_set('session.use_only_cookies', '1');  // el ID nunca viaja en la URL

    session_name(SESION_NOMBRE);
    session_set_cookie_params([
        'lifetime' => 0,        // dura hasta cerrar el navegador
        'path'     => '/',
        'secure'   => $esHttps, // solo por HTTPS cuando el sitio lo usa
        'httponly' => true,     // JavaScript no puede leer la cookie (mitiga robo por XSS)
        'samesite' => 'Lax',    // no se envía en POST desde otros sitios (mitiga CSRF)
    ]);
}

// Abre la sesión una sola vez por petición.
function abrirSesion(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        configurarCookieSesion();
        session_start();
    }
}

// Para endpoints públicos que solo quieren saber SI hay alguien logueado:
// no crea una sesión nueva para visitantes anónimos.
function sesionOpcional(): ?array
{
    if (!isset($_COOKIE[SESION_NOMBRE])) {
        return null;
    }
    abrirSesion();
    return usuarioDeSesion();
}

function usuarioDeSesion(): ?array
{
    if (!isset($_SESSION['usuario_id'])) {
        return null;
    }
    if (time() - (int) ($_SESSION['ultimo_acceso'] ?? 0) > SESION_INACTIVIDAD) {
        destruirSesion();
        return null;
    }
    $_SESSION['ultimo_acceso'] = time();
    return ['id' => (int) $_SESSION['usuario_id'], 'rol' => (string) $_SESSION['usuario_rol']];
}

// Guardián de los endpoints protegidos: sin sesión válida → 401 y se corta todo.
function exigirSesion(): array
{
    abrirSesion();
    $usuario = usuarioDeSesion();
    if ($usuario === null) {
        error(401, 'Acceso no autorizado. Iniciá sesión.');
    }
    return $usuario;
}

// Autorización por rol: con sesión pero sin permiso → 403.
function exigirRol(array $usuario, string ...$roles): void
{
    if (!in_array($usuario['rol'], $roles, true)) {
        error(403, 'No tenés permiso para esta operación.');
    }
}

function iniciarSesionDe(int $id, string $rol): void
{
    abrirSesion();
    session_regenerate_id(true);               // ID nuevo al autenticarse: evita la fijación de sesión
    $_SESSION['usuario_id']    = $id;          // solo el id y el rol; nunca la contraseña ni el hash
    $_SESSION['usuario_rol']   = $rol;
    $_SESSION['ultimo_acceso'] = time();
    $_SESSION['csrf']          = bin2hex(random_bytes(32));
}

function destruirSesion(): void
{
    $_SESSION = [];
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000, 'path' => $p['path'], 'domain' => $p['domain'],
        'secure' => $p['secure'], 'httponly' => $p['httponly'], 'samesite' => $p['samesite'],
    ]);
    session_destroy();
}

// Token anti-CSRF: toda operación que modifica datos debe mandarlo en la
// cabecera X-CSRF-Token (el cliente lo obtiene en login/registro/perfil).
function exigirCsrf(): void
{
    $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $real    = $_SESSION['csrf'] ?? '';
    if ($real === '' || !is_string($enviado) || !hash_equals($real, $enviado)) {
        error(403, 'Token de seguridad inválido. Recargá la página.');
    }
}
