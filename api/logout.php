<?php
/* =====================================================================
   POST api/logout.php — destruye la sesión y borra la cookie
   200 · 401 si no había sesión · 403 si falta el token CSRF
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

exigirSesion();
exigirCsrf();
destruirSesion();

responder(200, ['estado' => 'exito', 'mensaje' => 'Sesión cerrada correctamente.']);
