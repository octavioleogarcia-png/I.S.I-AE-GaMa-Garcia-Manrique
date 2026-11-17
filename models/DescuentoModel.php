<?php
/* =====================================================================
   DescuentoModel — cupones y reglas por volumen (tablas `cupones` y
   `reglas_volumen`). Solo lee datos; el cálculo está en
   services/PresupuestoService.php.
   ===================================================================== */

final class DescuentoModel
{
    public function __construct(private PDO $pdo) {}

    public function cupon(string $codigo): ?array
    {
        $stmt = $this->pdo->prepare('SELECT codigo, porcentaje, etiqueta FROM cupones WHERE codigo = :codigo');
        $stmt->bindValue(':codigo', $codigo, PDO::PARAM_STR);
        $stmt->execute();
        $fila = $stmt->fetch();
        return $fila ? ['codigo' => $fila['codigo'], 'porcentaje' => (float) $fila['porcentaje'], 'etiqueta' => $fila['etiqueta']] : null;
    }

    /** Reglas ordenadas de menor a mayor cantidad de viajes. */
    public function reglasVolumen(): array
    {
        $filas = $this->pdo->query('SELECT min_viajes, porcentaje, etiqueta FROM reglas_volumen ORDER BY min_viajes')->fetchAll();
        return array_map(fn ($f) => [
            'min_viajes' => (int) $f['min_viajes'], 'porcentaje' => (float) $f['porcentaje'], 'etiqueta' => $f['etiqueta'],
        ], $filas);
    }
}
