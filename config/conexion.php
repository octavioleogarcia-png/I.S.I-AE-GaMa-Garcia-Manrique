<?php
/* =====================================================================
   GaMa — Conexión a MySQL con PDO (patrón Singleton)
   ---------------------------------------------------------------------
   Por qué Singleton: en una misma petición todos los modelos comparten
   UNA sola conexión. Así no se abren conexiones de más y la
   configuración vive en un único lugar.

   Uso:   $pdo = Conexion::obtener();

   XAMPP trae el usuario `root` SIN contraseña. Si tu MySQL tiene
   contraseña, definila en la variable de entorno GAMA_DB_PASS o
   cambiá el valor por defecto de abajo.
   ===================================================================== */

final class Conexion
{
    private static ?PDO $instancia = null;

    // El constructor y el clon son privados: nadie puede crear otra instancia.
    private function __construct() {}
    private function __clone() {}

    public static function obtener(): PDO
    {
        if (self::$instancia === null) {
            $host    = getenv('GAMA_DB_HOST') ?: '127.0.0.1';
            $puerto  = getenv('GAMA_DB_PORT') ?: '3306';
            $base    = getenv('GAMA_DB_NAME') ?: 'gama';
            $usuario = getenv('GAMA_DB_USER') ?: 'root';
            $clave   = getenv('GAMA_DB_PASS') !== false ? getenv('GAMA_DB_PASS') : '';

            $dsn = "mysql:host=$host;port=$puerto;dbname=$base;charset=utf8mb4";

            // Si la conexión falla, PDO lanza PDOException. Nadie la atrapa acá:
            // la captura el manejador global de config/sesion.php, que registra
            // el detalle en el log y responde un 500 genérico (sin filtrar datos).
            self::$instancia = new PDO($dsn, $usuario, $clave, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // los errores lanzan excepción
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,                  // consultas preparadas REALES en MySQL
            ]);
        }
        return self::$instancia;
    }
}
