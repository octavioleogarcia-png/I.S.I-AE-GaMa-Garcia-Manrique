<?php
/* =====================================================================
   GET api/sesion.php — «¿hay alguien logueado?» (siempre 200)
   La SPA lo consulta al cargar. A diferencia de perfil.php (recurso
   protegido: 401 si no hay sesión), esta consulta es pública y responde
   { autenticado: false } al visitante, sin generar un error en consola.
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET');

$sesion = sesionOpcional();
if ($sesion === null) {
    responder(200, ['estado' => 'exito', 'autenticado' => false]);
}

$usuario = (new UsuarioModel(Conexion::obtener()))->buscarPorId($sesion['id']);
if (!$usuario) {
    destruirSesion();
    responder(200, ['estado' => 'exito', 'autenticado' => false]);
}
unset($usuario['id']);

responder(200, ['estado' => 'exito', 'autenticado' => true, 'data' => $usuario, 'csrf' => $_SESSION['csrf']]);
