<?php
/* =====================================================================
   GaMa — Conexión a MySQL con PDO
   XAMPP trae el usuario `root` SIN contraseña. Si tu MySQL tiene
   contraseña, completala en $pass.
   ===================================================================== */

$host    = 'localhost';
$db      = 'gama';
$user    = 'root';
$pass    = '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // los errores lanzan PDOException
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,                  // consultas preparadas REALES en MySQL
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    error_log('GaMa - error de conexión: ' . $e->getMessage()); // el detalle queda en el log, no en pantalla
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['estado' => 'error', 'mensaje' => 'Error de conexión con la base de datos.']);
    exit;
}
