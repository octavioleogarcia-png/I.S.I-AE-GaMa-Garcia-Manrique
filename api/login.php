<?php
/* =====================================================================
   POST api/login.php
   Cuerpo JSON: { "email", "password" }
   200 autenticado · 400 faltan datos · 401 credenciales incorrectas
   429 demasiados intentos fallidos
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('POST');

$input    = leerJson();
$email    = mb_strtolower(texto($input, 'email'));
$password = is_string($input['password'] ?? null) ? $input['password'] : '';

if ($email === '' || $password === '') {
    error(400, 'Ingresá tu e-mail y tu contraseña.');
}

$usuarios = new UsuarioModel(Conexion::obtener());

// Freno a la fuerza bruta: 5 fallos en 10 minutos bloquean ese e-mail.
if ($usuarios->intentosRecientes($email) >= 5) {
    header('Retry-After: 600');
    error(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
}

$usuario = $usuarios->buscarPorEmail($email);

// Si el e-mail no existe se verifica igual contra un hash ficticio:
// así el tiempo de respuesta no delata qué cuentas están registradas.
$hashFicticio = '$2y$12$LulIL6wMiLdhdB6kdnJTruR.1kAb9g/e1zxUb1/ePfB67u/xKLdaG';
$passwordOk   = password_verify($password, $usuario['password'] ?? $hashFicticio);

if (!$usuario || !$passwordOk) {
    $usuarios->registrarIntentoFallido($email);
    // Mismo mensaje para e-mail inexistente y contraseña incorrecta.
    error(401, 'El e-mail o la contraseña no son correctos.');
}

// Si el hash viejo usa un costo menor al actual, se actualiza al ingresar.
if (password_needs_rehash($usuario['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
    $usuarios->actualizarHash((int) $usuario['id'], password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]));
}
$usuarios->limpiarIntentos($email);

// ===== Credenciales válidas: se inicia la sesión en el servidor =====
iniciarSesionDe((int) $usuario['id'], $usuario['rol']);

responder(200, [
    'estado'  => 'exito',
    'mensaje' => 'Autenticación exitosa.',
    'csrf'    => $_SESSION['csrf'],
    'usuario' => [
        'nombre'   => $usuario['nombre'],
        'email'    => $usuario['email'],
        'telefono' => $usuario['telefono'],
        'rol'      => $usuario['rol'],
    ],
]);
