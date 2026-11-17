<?php
/* =====================================================================
   POST api/registro.php
   Cuerpo JSON: { "nombre", "email", "telefono", "password" }
   201 creado (y sesión iniciada) · 400 datos inválidos · 409 e-mail repetido
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

$input    = leerJson();
$nombre   = texto($input, 'nombre');
$email    = mb_strtolower(texto($input, 'email'));
$telefono = texto($input, 'telefono');
$password = is_string($input['password'] ?? null) ? $input['password'] : '';

// Validación en el servidor (la del navegador se puede saltear)
$errores = [];
if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 100) {
    $errores[] = 'El nombre debe tener entre 3 y 100 caracteres.';
}
if (!Validador::email($email)) {
    $errores[] = 'El e-mail no es válido.';
}
if (!Validador::telefono($telefono)) {
    $errores[] = 'El teléfono no es válido.';
}
// BCRYPT solo usa los primeros 72 bytes: más largo se rechaza para no truncar en silencio.
if (strlen($password) < 8 || strlen($password) > 72) {
    $errores[] = 'La contraseña debe tener entre 8 y 72 caracteres.';
}
if ($errores) {
    error(400, implode(' ', $errores));
}

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]); // incluye sal aleatoria

try {
    // El rol lo fija el servidor: nadie puede registrarse como operario o gerente.
    $id = (new UsuarioModel(Conexion::obtener()))->crear($nombre, $email, $telefono, $hash, 'cliente');
} catch (PDOException $e) {
    if ($e->getCode() == 23000) { // violación de UNIQUE (e-mail ya registrado)
        error(409, 'Ya existe una cuenta con ese e-mail.');
    }
    throw $e; // cualquier otro error lo resuelve el manejador global (500 genérico)
}

iniciarSesionDe($id, 'cliente');

responder(201, [
    'estado'  => 'exito',
    'mensaje' => 'Cuenta creada correctamente.',
    'csrf'    => $_SESSION['csrf'],
    'usuario' => ['nombre' => $nombre, 'email' => $email, 'telefono' => $telefono, 'rol' => 'cliente'],
]);
