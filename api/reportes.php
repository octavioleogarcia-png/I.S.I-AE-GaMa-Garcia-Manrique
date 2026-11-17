<?php
/* =====================================================================
   GET api/reportes.php — estadísticas de la empresa (RF4, solo Gerente)
   200 · 401 sin sesión · 403 si el rol no es gerente
   ===================================================================== */

require_once __DIR__ . '/../config/sesion.php';
exigirMetodo('GET');

$usuario = exigirSesion();
exigirRol($usuario, 'gerente');

responder(200, ['estado' => 'exito', 'data' => (new ReporteModel(Conexion::obtener()))->resumen()]);
