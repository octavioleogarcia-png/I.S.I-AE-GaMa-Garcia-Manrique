<?php
/* =====================================================================
   GET api/perfil.php — datos de la cuenta logueada
   200 con sesión · 401 sin sesión
   Lo usa assets/js/sesion.js en TODAS las páginas para saber si
   mostrar "Ingresar" o "Hola, Nombre · Salir".
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET');

configurarCookieSesion();
session_start();

// ===== GUARDIÁN DE SESIÓN =====
if (!isset($_SESSION['usuario_id'])) {
    http_response_code(401); // Unauthorized
    echo json_encode(['estado' => 'error', 'mensaje' => 'Acceso no autorizado. Iniciá sesión.'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/../config/conexion.php';

// Se leen los datos actuales de la base (no una copia vieja guardada en la sesión).
$stmt = $pdo->prepare('SELECT nombre, email, telefono, rol FROM usuarios WHERE id = :id');
$stmt->bindValue(':id', (int) $_SESSION['usuario_id'], PDO::PARAM_INT);
$stmt->execute();
$usuario = $stmt->fetch();

if (!$usuario) { // la cuenta fue borrada mientras la sesión seguía abierta
    $_SESSION = [];
    session_destroy();
    responder(401, ['estado' => 'error', 'mensaje' => 'La cuenta ya no existe.']);
}

responder(200, ['estado' => 'exito', 'data' => $usuario]);
