<?php
/* =====================================================================
   POST api/registro.php
   Cuerpo JSON: { "nombre", "email", "telefono", "password" }
   201 creado (y sesión iniciada) · 400 datos inválidos · 409 e-mail repetido
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

// 1. Recepción del JSON enviado por fetch()
$input = leerJson();

$nombre   = texto($input, 'nombre');
$email    = mb_strtolower(texto($input, 'email'));
$telefono = texto($input, 'telefono');
$password = is_string($input['password'] ?? null) ? $input['password'] : '';

// 2. Validación en el servidor (la del navegador se puede saltear)
$errores = [];
if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 100) {
    $errores[] = 'El nombre debe tener entre 3 y 100 caracteres.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 150) {
    $errores[] = 'El e-mail no es válido.';
}
if (!preg_match('/^[0-9 +()-]{6,30}$/', $telefono)) {
    $errores[] = 'El teléfono no es válido.';
}
// BCRYPT solo usa los primeros 72 bytes: más largo se rechaza para no truncar en silencio.
if (strlen($password) < 8 || strlen($password) > 72) {
    $errores[] = 'La contraseña debe tener entre 8 y 72 caracteres.';
}
if ($errores) {
    responder(400, ['estado' => 'error', 'mensaje' => implode(' ', $errores)]);
}

// 3. Hash BCRYPT de la contraseña (incluye sal aleatoria y costo)
$passwordHash = password_hash($password, PASSWORD_BCRYPT);

require_once __DIR__ . '/../config/conexion.php';

try {
    // 4. INSERT con PDO Prepared Statement.
    //    El rol lo fija el servidor: nadie puede registrarse como "operador".
    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nombre, email, telefono, password, rol)
         VALUES (:nombre, :email, :telefono, :pass, :rol)'
    );
    $stmt->bindValue(':nombre',   $nombre,       PDO::PARAM_STR);
    $stmt->bindValue(':email',    $email,        PDO::PARAM_STR);
    $stmt->bindValue(':telefono', $telefono,     PDO::PARAM_STR);
    $stmt->bindValue(':pass',     $passwordHash, PDO::PARAM_STR);
    $stmt->bindValue(':rol',      'cliente',     PDO::PARAM_STR);
    $stmt->execute();

    $nuevoId = (int) $pdo->lastInsertId();
} catch (PDOException $e) {
    if ($e->getCode() == 23000) { // violación de UNIQUE (e-mail ya registrado)
        responder(409, ['estado' => 'error', 'mensaje' => 'Ya existe una cuenta con ese e-mail.']);
    }
    error_log('GaMa registro: ' . $e->getMessage());
    responder(500, ['estado' => 'error', 'mensaje' => 'Error interno al registrar el usuario.']);
}

// 5. La cuenta nueva queda con la sesión iniciada
configurarCookieSesion();
session_start();
session_regenerate_id(true);
$_SESSION['usuario_id']  = $nuevoId;
$_SESSION['usuario_rol'] = 'cliente';

responder(201, [
    'estado'  => 'exito',
    'mensaje' => 'Cuenta creada correctamente.',
    'usuario' => ['nombre' => $nombre, 'email' => $email, 'telefono' => $telefono, 'rol' => 'cliente'],
]);
