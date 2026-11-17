<?php
/* =====================================================================
   GET api/perfil.php — datos de la cuenta logueada + token CSRF
   200 con sesión · 401 sin sesión
   La SPA lo consulta al cargar para saber si mostrar "Ingresar" o
   "Hola, Nombre · Salir".
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET');

$sesion = exigirSesion();

// Se leen los datos actuales de la base (no una copia vieja guardada en la sesión).
$usuario = (new UsuarioModel(Conexion::obtener()))->buscarPorId($sesion['id']);

if (!$usuario) { // la cuenta fue borrada mientras la sesión seguía abierta
    destruirSesion();
    error(401, 'La cuenta ya no existe.');
}
unset($usuario['id']);

responder(200, ['estado' => 'exito', 'data' => $usuario, 'csrf' => $_SESSION['csrf']]);
