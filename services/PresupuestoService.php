<?php
/* =====================================================================
   PresupuestoService — regla de negocio del cálculo del total (RF6)
   Es la ÚNICA fuente de verdad del precio: la usan tanto la vista previa
   (api/presupuesto.php) como el alta del pedido (api/pedidos.php), así
   el total que ve el cliente es siempre el que se guarda.
   ===================================================================== */

final class PresupuestoService
{
    public function __construct(private UnidadModel $unidades, private DescuentoModel $descuentos) {}

    /**
     * @param array<string,int> $cantidades unidad_id => cantidad
     * @throws InvalidArgumentException con un mensaje apto para mostrar al usuario
     */
    public function calcular(array $cantidades, string $cupon): array
    {
        $precios = $this->unidades->preciosActivos(array_keys($cantidades));
        if (count($precios) !== count($cantidades)) {
            throw new InvalidArgumentException('Alguna de las unidades elegidas no existe o ya no está disponible.');
        }

        $subtotal = 0.0;
        $viajes   = 0;
        $lineas   = [];
        foreach ($cantidades as $id => $cantidad) {
            $precio = (float) $precios[$id];
            $subtotal += $precio * $cantidad;
            $viajes   += $cantidad;
            $lineas[$id] = ['cantidad' => $cantidad, 'precio' => $precio];
        }

        // Mejor descuento por volumen entre las reglas que se cumplen.
        $pctVolumen = 0.0;
        foreach ($this->descuentos->reglasVolumen() as $regla) {
            if ($viajes >= $regla['min_viajes']) {
                $pctVolumen = max($pctVolumen, $regla['porcentaje']);
            }
        }

        $pctCupon = 0.0;
        if ($cupon !== '') {
            $datosCupon = $this->descuentos->cupon($cupon);
            if ($datosCupon === null) {
                throw new InvalidArgumentException('El código de descuento no es válido.');
            }
            $pctCupon = $datosCupon['porcentaje'];
        }

        $pctTotal = min($pctVolumen + $pctCupon, 100.0);   // tope del 100 %
        return [
            'lineas'        => $lineas,
            'viajes'        => $viajes,
            'subtotal'      => round($subtotal, 2),
            'pct_volumen'   => $pctVolumen,
            'pct_cupon'     => $pctCupon,
            'descuento_pct' => $pctTotal,
            'total'         => round($subtotal * (1 - $pctTotal / 100), 2),
        ];
    }
}
