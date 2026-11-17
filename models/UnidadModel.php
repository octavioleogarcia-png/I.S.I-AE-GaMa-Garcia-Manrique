<?php
/* =====================================================================
   UnidadModel — acceso a datos de la flota (tabla `unidades`)
   RF1 (Módulo de Flota) y RF5 (Catálogo Web) de la AE1.
   ===================================================================== */

final class UnidadModel
{
    public function __construct(private PDO $pdo) {}

    private const COLUMNAS = 'id, nombre, categoria, capacidad, carga_maxima, uso, precio, tarifa, activo';

    /** Filtros opcionales: categoria (exacta) y q (busca en nombre y uso). */
    public function listar(?string $categoria, ?string $q, bool $incluirInactivas): array
    {
        $condiciones = [];
        if (!$incluirInactivas) {
            $condiciones[] = 'activo = 1';
        }
        if ($categoria !== null && $categoria !== '') {
            $condiciones[] = 'categoria = :categoria';
        }
        if ($q !== null && $q !== '') {
            $condiciones[] = '(nombre LIKE :q OR uso LIKE :q2)';
        }
        // Solo se concatenan fragmentos FIJOS de SQL; los valores van siempre por marcador.
        $sql = 'SELECT ' . self::COLUMNAS . ' FROM unidades'
             . ($condiciones ? ' WHERE ' . implode(' AND ', $condiciones) : '')
             . ' ORDER BY categoria, precio';

        $stmt = $this->pdo->prepare($sql);
        if ($categoria !== null && $categoria !== '') {
            $stmt->bindValue(':categoria', $categoria, PDO::PARAM_STR);
        }
        if ($q !== null && $q !== '') {
            // Se escapan % y _ para que el usuario no pueda armar comodines.
            $patron = '%' . addcslashes($q, '%_\\') . '%';
            $stmt->bindValue(':q',  $patron, PDO::PARAM_STR);
            $stmt->bindValue(':q2', $patron, PDO::PARAM_STR);
        }
        $stmt->execute();
        return array_map([$this, 'normalizar'], $stmt->fetchAll());
    }

    public function categorias(): array
    {
        return $this->pdo->query('SELECT DISTINCT categoria FROM unidades WHERE activo = 1 ORDER BY categoria')
                         ->fetchAll(PDO::FETCH_COLUMN);
    }

    public function obtener(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNAS . ' FROM unidades WHERE id = :id');
        $stmt->bindValue(':id', $id, PDO::PARAM_STR);
        $stmt->execute();
        $fila = $stmt->fetch();
        return $fila ? $this->normalizar($fila) : null;
    }

    /** Precios de las unidades ACTIVAS pedidas: [ id => precio ]. */
    public function preciosActivos(array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $marcadores = [];
        foreach (array_values($ids) as $i => $_) {
            $marcadores[] = ':id' . $i;           // :id0, :id1, … (nunca se concatena un valor)
        }
        $stmt = $this->pdo->prepare(
            'SELECT id, precio FROM unidades WHERE activo = 1 AND id IN (' . implode(',', $marcadores) . ')'
        );
        foreach (array_values($ids) as $i => $id) {
            $stmt->bindValue(':id' . $i, $id, PDO::PARAM_STR);
        }
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    }

    // Lanza PDOException 23000 si el id ya existe.
    public function crear(array $d): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO unidades (id, nombre, categoria, capacidad, carga_maxima, uso, precio, tarifa)
             VALUES (:id, :nombre, :categoria, :capacidad, :carga, :uso, :precio, :tarifa)'
        );
        $this->enlazar($stmt, $d);
        $stmt->execute();
    }

    public function actualizar(string $id, array $d): bool
    {
        $d['id'] = $id;
        $stmt = $this->pdo->prepare(
            'UPDATE unidades SET nombre = :nombre, categoria = :categoria, capacidad = :capacidad,
                    carga_maxima = :carga, uso = :uso, precio = :precio, tarifa = :tarifa
              WHERE id = :id'
        );
        $this->enlazar($stmt, $d);
        $stmt->execute();
        return $stmt->rowCount() > 0 || $this->obtener($id) !== null; // MySQL devuelve 0 si no hubo cambios
    }

    /** Baja lógica: la unidad deja de ofrecerse pero los pedidos viejos siguen intactos. */
    public function darDeBaja(string $id): void
    {
        $stmt = $this->pdo->prepare('UPDATE unidades SET activo = 0 WHERE id = :id');
        $stmt->bindValue(':id', $id, PDO::PARAM_STR);
        $stmt->execute();
    }

    public function reactivar(string $id): void
    {
        $stmt = $this->pdo->prepare('UPDATE unidades SET activo = 1 WHERE id = :id');
        $stmt->bindValue(':id', $id, PDO::PARAM_STR);
        $stmt->execute();
    }

    private function enlazar(PDOStatement $stmt, array $d): void
    {
        $stmt->bindValue(':id',        $d['id'],           PDO::PARAM_STR);
        $stmt->bindValue(':nombre',    $d['nombre'],       PDO::PARAM_STR);
        $stmt->bindValue(':categoria', $d['categoria'],    PDO::PARAM_STR);
        $stmt->bindValue(':capacidad', $d['capacidad'],    PDO::PARAM_STR);
        $stmt->bindValue(':carga',     $d['carga_maxima'], PDO::PARAM_STR);
        $stmt->bindValue(':uso',       $d['uso'],          PDO::PARAM_STR);
        $stmt->bindValue(':precio',    number_format((float) $d['precio'], 2, '.', ''), PDO::PARAM_STR);
        $stmt->bindValue(':tarifa',    $d['tarifa'],       PDO::PARAM_STR);
    }

    // DECIMAL llega como texto: se entrega como número en el JSON.
    private function normalizar(array $f): array
    {
        $f['precio'] = (float) $f['precio'];
        $f['activo'] = (bool) $f['activo'];
        return $f;
    }
}
