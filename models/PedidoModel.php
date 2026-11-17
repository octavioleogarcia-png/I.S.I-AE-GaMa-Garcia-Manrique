<?php
/* =====================================================================
   PedidoModel — tablas `pedidos` y `pedido_items` (RF6 y RF3 de la AE1)
   ===================================================================== */

final class PedidoModel
{
    public const ESTADOS = ['pendiente', 'confirmado', 'en viaje', 'entregado', 'cancelado'];

    public function __construct(private PDO $pdo) {}

    private const SELECT_BASE =
        'SELECT p.id, p.usuario_id, us.nombre AS cliente, us.email AS cliente_email,
                p.direccion, p.telefono, p.medio_pago, p.comentarios, p.cupon,
                p.subtotal, p.descuento_pct, p.total, p.estado, p.creado_en,
                i.unidad_id, i.cantidad, i.precio_unitario, u.nombre AS unidad, u.tarifa
           FROM pedidos p
           JOIN usuarios us    ON us.id = p.usuario_id
           JOIN pedido_items i ON i.pedido_id = p.id
           JOIN unidades u     ON u.id = i.unidad_id';

    /** Pedidos de UN cliente (el id sale de la sesión, nunca del cliente). */
    public function listarPorUsuario(int $usuarioId): array
    {
        $stmt = $this->pdo->prepare(
            self::SELECT_BASE . ' WHERE p.usuario_id = :usuario ORDER BY p.creado_en DESC, p.id DESC, u.nombre'
        );
        $stmt->bindValue(':usuario', $usuarioId, PDO::PARAM_INT);
        $stmt->execute();
        return $this->agrupar($stmt->fetchAll());
    }

    /** Todos los pedidos (operario / gerente), con filtro opcional de estado. */
    public function listarTodos(?string $estado): array
    {
        $sql = self::SELECT_BASE . ($estado !== null ? ' WHERE p.estado = :estado' : '')
             . ' ORDER BY p.creado_en DESC, p.id DESC, u.nombre';
        $stmt = $this->pdo->prepare($sql);
        if ($estado !== null) {
            $stmt->bindValue(':estado', $estado, PDO::PARAM_STR);
        }
        $stmt->execute();
        return $this->agrupar($stmt->fetchAll());
    }

    public function obtener(int $id): ?array
    {
        $stmt = $this->pdo->prepare(self::SELECT_BASE . ' WHERE p.id = :id ORDER BY u.nombre');
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $lista = $this->agrupar($stmt->fetchAll());
        return $lista[0] ?? null;
    }

    /**
     * Alta del pedido y sus ítems en UNA transacción: se guarda todo o nada.
     * $lineas = [ unidad_id => ['cantidad' => int, 'precio' => float] ]
     */
    public function crear(int $usuarioId, array $d, array $lineas, array $calculo): int
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO pedidos (usuario_id, direccion, telefono, medio_pago, comentarios,
                                      cupon, subtotal, descuento_pct, total)
                 VALUES (:usuario, :direccion, :telefono, :medio, :comentarios,
                         :cupon, :subtotal, :pct, :total)'
            );
            $stmt->bindValue(':usuario',   $usuarioId,    PDO::PARAM_INT);
            $stmt->bindValue(':direccion', $d['direccion'], PDO::PARAM_STR);
            $stmt->bindValue(':telefono',  $d['telefono'],  PDO::PARAM_STR);
            $stmt->bindValue(':medio',     $d['medio_pago'], PDO::PARAM_STR);
            $stmt->bindValue(':comentarios', $d['comentarios'] !== '' ? $d['comentarios'] : null,
                             $d['comentarios'] !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $stmt->bindValue(':cupon', $d['cupon'] !== '' ? $d['cupon'] : null,
                             $d['cupon'] !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $stmt->bindValue(':subtotal', number_format($calculo['subtotal'], 2, '.', ''), PDO::PARAM_STR);
            $stmt->bindValue(':pct',      number_format($calculo['descuento_pct'], 2, '.', ''), PDO::PARAM_STR);
            $stmt->bindValue(':total',    number_format($calculo['total'], 2, '.', ''), PDO::PARAM_STR);
            $stmt->execute();
            $pedidoId = (int) $this->pdo->lastInsertId();

            $item = $this->pdo->prepare(
                'INSERT INTO pedido_items (pedido_id, unidad_id, cantidad, precio_unitario)
                 VALUES (:pedido, :unidad, :cantidad, :precio)'
            );
            foreach ($lineas as $unidadId => $l) {
                $item->bindValue(':pedido',   $pedidoId,   PDO::PARAM_INT);
                $item->bindValue(':unidad',   $unidadId,   PDO::PARAM_STR);
                $item->bindValue(':cantidad', $l['cantidad'], PDO::PARAM_INT);
                $item->bindValue(':precio',   number_format($l['precio'], 2, '.', ''), PDO::PARAM_STR);
                $item->execute();
            }
            $this->pdo->commit();
            return $pedidoId;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function cambiarEstado(int $id, string $estado): void
    {
        $stmt = $this->pdo->prepare('UPDATE pedidos SET estado = :estado WHERE id = :id');
        $stmt->bindValue(':estado', $estado, PDO::PARAM_STR);
        $stmt->bindValue(':id',     $id,     PDO::PARAM_INT);
        $stmt->execute();
    }

    // El JOIN devuelve una fila por ítem: se agrupan en un pedido con su lista de ítems.
    private function agrupar(array $filas): array
    {
        $pedidos = [];
        foreach ($filas as $f) {
            $id = (int) $f['id'];
            if (!isset($pedidos[$id])) {
                $pedidos[$id] = [
                    'id' => $id, 'usuario_id' => (int) $f['usuario_id'],
                    'cliente' => $f['cliente'], 'cliente_email' => $f['cliente_email'],
                    'direccion' => $f['direccion'], 'telefono' => $f['telefono'],
                    'medio_pago' => $f['medio_pago'], 'comentarios' => $f['comentarios'],
                    'cupon' => $f['cupon'], 'subtotal' => (float) $f['subtotal'],
                    'descuento_pct' => (float) $f['descuento_pct'], 'total' => (float) $f['total'],
                    'estado' => $f['estado'], 'creado_en' => $f['creado_en'], 'items' => [],
                ];
            }
            $pedidos[$id]['items'][] = [
                'unidad_id' => $f['unidad_id'], 'unidad' => $f['unidad'], 'tarifa' => $f['tarifa'],
                'cantidad' => (int) $f['cantidad'], 'precio_unitario' => (float) $f['precio_unitario'],
            ];
        }
        return array_values($pedidos);
    }
}
