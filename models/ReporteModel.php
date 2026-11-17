<?php
/* =====================================================================
   ReporteModel — estadísticas para el Gerente (RF4 de la AE1).
   Solo consultas de lectura; no modifica nada.
   Los pedidos cancelados no cuentan como ingreso.
   ===================================================================== */

final class ReporteModel
{
    public function __construct(private PDO $pdo) {}

    public function resumen(): array
    {
        $t = $this->pdo->query(
            "SELECT COUNT(*) AS pedidos,
                    COALESCE(SUM(CASE WHEN estado <> 'cancelado' THEN total END), 0) AS ingresos,
                    COALESCE(AVG(CASE WHEN estado <> 'cancelado' THEN total END), 0) AS ticket_promedio
               FROM pedidos"
        )->fetch();

        $porEstado = $this->pdo->query(
            'SELECT estado, COUNT(*) AS cantidad FROM pedidos GROUP BY estado ORDER BY cantidad DESC'
        )->fetchAll();

        $porUnidad = $this->pdo->query(
            "SELECT u.id, u.nombre, SUM(i.cantidad) AS viajes,
                    SUM(i.cantidad * i.precio_unitario) AS ingresos
               FROM pedido_items i
               JOIN pedidos p  ON p.id = i.pedido_id AND p.estado <> 'cancelado'
               JOIN unidades u ON u.id = i.unidad_id
           GROUP BY u.id, u.nombre
           ORDER BY ingresos DESC"
        )->fetchAll();

        $porCliente = $this->pdo->query(
            "SELECT us.nombre, COUNT(*) AS pedidos, SUM(p.total) AS total
               FROM pedidos p JOIN usuarios us ON us.id = p.usuario_id
              WHERE p.estado <> 'cancelado'
           GROUP BY us.id, us.nombre
           ORDER BY total DESC LIMIT 5"
        )->fetchAll();

        return [
            'totales' => [
                'pedidos'         => (int) $t['pedidos'],
                'ingresos'        => (float) $t['ingresos'],
                'ticket_promedio' => round((float) $t['ticket_promedio'], 2),
            ],
            'por_estado'  => array_map(fn ($f) => ['estado' => $f['estado'], 'cantidad' => (int) $f['cantidad']], $porEstado),
            'por_unidad'  => array_map(fn ($f) => ['id' => $f['id'], 'nombre' => $f['nombre'],
                              'viajes' => (int) $f['viajes'], 'ingresos' => (float) $f['ingresos']], $porUnidad),
            'por_cliente' => array_map(fn ($f) => ['nombre' => $f['nombre'],
                              'pedidos' => (int) $f['pedidos'], 'total' => (float) $f['total']], $porCliente),
        ];
    }
}
