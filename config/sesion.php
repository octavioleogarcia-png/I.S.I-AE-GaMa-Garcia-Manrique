<?php
/* =====================================================================
   GaMa — Utilidades compartidas por los servicios de la API
   - configurarCookieSesion(): deja la cookie de sesión segura ANTES
     de llamar a session_start().
   - responder(): devuelve JSON con su código HTTP y corta la ejecución.
   - leerJson(): lee y valida el cuerpo JSON de la petición.
   ===================================================================== */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function configurarCookieSesion(): void
{
    $esHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

    ini_set('session.use_strict_mode', '1');   // rechaza IDs de sesión que no generó el servidor
    ini_set('session.use_only_cookies', '1');  // el ID nunca viaja en la URL

    session_name('GAMA_SESION');
    session_set_cookie_params([
        'lifetime' => 0,        // dura hasta cerrar el navegador
        'path'     => '/',
        'secure'   => $esHttps, // solo por HTTPS cuando el sitio lo usa
        'httponly' => true,     // JavaScript no puede leer la cookie (mitiga robo por XSS)
        'samesite' => 'Lax',    // no se envía en POST desde otros sitios (mitiga CSRF)
    ]);
}

function responder(int $codigo, array $cuerpo): void
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

function exigirMetodo(string ...$metodos): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'], $metodos, true)) {
        header('Allow: ' . implode(', ', $metodos));
        responder(405, ['estado' => 'error', 'mensaje' => 'Método no permitido.']);
    }
}

function leerJson(): array
{
    // Solo se acepta JSON: un formulario HTML de otro sitio no puede mandar
    // este Content-Type sin permiso del navegador (otra capa contra CSRF).
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($tipo, 'application/json') !== 0) {
        responder(415, ['estado' => 'error', 'mensaje' => 'El cuerpo debe enviarse como JSON.']);
    }

    $datos = json_decode(file_get_contents('php://input'), true);
    if (!is_array($datos)) {
        responder(400, ['estado' => 'error', 'mensaje' => 'JSON inválido.']);
    }
    return $datos;
}

// Lee un campo de texto del JSON sin romperse si llega un array u otro tipo.
function texto(array $datos, string $clave): string
{
    return is_string($datos[$clave] ?? null) ? trim($datos[$clave]) : '';
}
