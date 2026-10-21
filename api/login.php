<?php
/* =====================================================================
   POST api/login.php
   Cuerpo JSON: { "email", "password" }
   200 autenticado · 400 faltan datos · 401 credenciales incorrectas
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

$input    = leerJson();
$email    = mb_strtolower(texto($input, 'email'));
$password = is_string($input['password'] ?? null) ? $input['password'] : '';

if ($email === '' || $password === '') {
    responder(400, ['estado' => 'error', 'mensaje' => 'Ingresá tu e-mail y tu contraseña.']);
}

require_once __DIR__ . '/../config/conexion.php';

try {
    // Se busca SOLO por e-mail; la contraseña se compara en PHP con password_verify().
    $stmt = $pdo->prepare(
        'SELECT id, nombre, email, telefono, password, rol
           FROM usuarios
          WHERE email = :email
          LIMIT 1'
    );
    $stmt->bindValue(':email', $email, PDO::PARAM_STR);
    $stmt->execute();
    $usuario = $stmt->fetch();
} catch (PDOException $e) {
    error_log('GaMa login: ' . $e->getMessage());
    responder(500, ['estado' => 'error', 'mensaje' => 'Error interno del servidor.']);
}

// Si el e-mail no existe se verifica igual contra un hash ficticio:
// así el tiempo de respuesta no delata qué cuentas están registradas.
$hashFicticio = '$2y$10$MMjOu4cwwRptW8E7rr5ojOr5/9GNE0czwCR4FjISPTlagIxYBOJEm';
$passwordOk   = password_verify($password, $usuario['password'] ?? $hashFicticio);

if (!$usuario || !$passwordOk) {
    // Mismo mensaje para e-mail inexistente y contraseña incorrecta.
    responder(401, ['estado' => 'error', 'mensaje' => 'El e-mail o la contraseña no son correctos.']);
}

// ===== Credenciales válidas: se inicia la sesión en el servidor =====
configurarCookieSesion();
session_start();
session_regenerate_id(true);  // ID nuevo al autenticarse: evita la fijación de sesión

// Solo se guarda el identificador y el rol; nunca la contraseña ni el hash.
$_SESSION['usuario_id']  = (int) $usuario['id'];
$_SESSION['usuario_rol'] = $usuario['rol'];

responder(200, [
    'estado'  => 'exito',
    'mensaje' => 'Autenticación exitosa.',
    'usuario' => [
        'nombre'   => $usuario['nombre'],
        'email'    => $usuario['email'],
        'telefono' => $usuario['telefono'],
        'rol'      => $usuario['rol'],
    ],
]);
