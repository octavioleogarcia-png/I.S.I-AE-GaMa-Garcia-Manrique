<?php
/* =====================================================================
   UsuarioModel — acceso a datos de la tabla `usuarios`
   Solo habla con la base (consultas preparadas con marcadores :campo).
   No lee $_POST, no arma JSON, no decide códigos HTTP: eso es del
   controlador (api/*.php).
   ===================================================================== */

final class UsuarioModel
{
    public function __construct(private PDO $pdo) {}

    public function buscarPorEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, nombre, email, telefono, password, rol
               FROM usuarios WHERE email = :email LIMIT 1'
        );
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->execute();
        return $stmt->fetch() ?: null;
    }

    // Sin el hash: este método es el que usa el perfil.
    public function buscarPorId(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, nombre, email, telefono, rol FROM usuarios WHERE id = :id'
        );
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetch() ?: null;
    }

    // Lanza PDOException con código 23000 si el e-mail ya existe (UNIQUE).
    public function crear(string $nombre, string $email, string $telefono, string $hash, string $rol): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO usuarios (nombre, email, telefono, password, rol)
             VALUES (:nombre, :email, :telefono, :pass, :rol)'
        );
        $stmt->bindValue(':nombre',   $nombre,   PDO::PARAM_STR);
        $stmt->bindValue(':email',    $email,    PDO::PARAM_STR);
        $stmt->bindValue(':telefono', $telefono, PDO::PARAM_STR);
        $stmt->bindValue(':pass',     $hash,     PDO::PARAM_STR);
        $stmt->bindValue(':rol',      $rol,      PDO::PARAM_STR);
        $stmt->execute();
        return (int) $this->pdo->lastInsertId();
    }

    public function actualizarHash(int $id, string $hash): void
    {
        $stmt = $this->pdo->prepare('UPDATE usuarios SET password = :pass WHERE id = :id');
        $stmt->bindValue(':pass', $hash, PDO::PARAM_STR);
        $stmt->bindValue(':id',   $id,   PDO::PARAM_INT);
        $stmt->execute();
    }

    /* ---- Control de fuerza bruta ---- */

    public function intentosRecientes(string $email): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM intentos_login
              WHERE email = :email AND creado_en > (NOW() - INTERVAL 10 MINUTE)'
        );
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->execute();
        return (int) $stmt->fetchColumn();
    }

    public function registrarIntentoFallido(string $email): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO intentos_login (email) VALUES (:email)');
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->execute();
    }

    public function limpiarIntentos(string $email): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM intentos_login WHERE email = :email');
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->execute();
    }
}
