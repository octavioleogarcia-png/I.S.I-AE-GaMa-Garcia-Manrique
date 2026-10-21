<?php
/* =====================================================================
   POST api/logout.php — destruye la sesión y borra la cookie
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

configurarCookieSesion();
session_start();

$_SESSION = [];

$params = session_get_cookie_params();
setcookie(session_name(), '', [
    'expires'  => time() - 42000,
    'path'     => $params['path'],
    'domain'   => $params['domain'],
    'secure'   => $params['secure'],
    'httponly' => $params['httponly'],
    'samesite' => $params['samesite'],
]);

session_destroy();

responder(200, ['estado' => 'exito', 'mensaje' => 'Sesión cerrada correctamente.']);
