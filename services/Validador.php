<?php
/* =====================================================================
   Validador — reglas de validación en el SERVIDOR.
   La validación del navegador es solo comodidad: se puede saltear,
   por eso cada dato se vuelve a validar acá antes de tocar la base.
   ===================================================================== */

final class Validador
{
    public const MEDIOS_PAGO = ['Efectivo', 'Transferencia bancaria', 'Tarjeta de débito/crédito', 'Cheque'];

    public static function telefono(string $v): bool
    {
        return (bool) preg_match('/^[0-9 +()-]{6,30}$/', $v);
    }

    public static function email(string $v): bool
    {
        return filter_var($v, FILTER_VALIDATE_EMAIL) !== false && strlen($v) <= 150;
    }

    /**
     * Ítems del pedido: lista de { id, cantidad } sin repetidos,
     * cantidad entera de 1 a 100. Devuelve [cantidades, error|null].
     */
    public static function items(mixed $items): array
    {
        if (!is_array($items) || count($items) === 0 || count($items) > 20) {
            return [[], 'Elegí al menos una unidad.'];
        }
        $cantidades = [];
        foreach ($items as $item) {
            $id       = is_array($item) && is_string($item['id'] ?? null) ? $item['id'] : '';
            $cantidad = is_array($item) ? filter_var($item['cantidad'] ?? null, FILTER_VALIDATE_INT) : false;
            if ($id === '' || $cantidad === false || $cantidad < 1 || $cantidad > 100 || isset($cantidades[$id])) {
                return [[], 'Hay unidades con datos inválidos.'];
            }
            $cantidades[$id] = $cantidad;
        }
        return [$cantidades, null];
    }

    /** Datos de una unidad de la flota (alta/edición). Devuelve [datos, errores[]]. */
    public static function unidad(array $in, bool $conId): array
    {
        $g = fn (string $k) => is_string($in[$k] ?? null) ? trim($in[$k]) : '';
        $d = [
            'id' => $g('id'), 'nombre' => $g('nombre'), 'categoria' => $g('categoria'),
            'capacidad' => $g('capacidad'), 'carga_maxima' => $g('carga_maxima'),
            'uso' => $g('uso'), 'tarifa' => $g('tarifa'), 'precio' => $in['precio'] ?? null,
        ];
        $e = [];
        if ($conId && !preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $d['id'])) {
            $e[] = 'El identificador solo admite minúsculas, números y guiones.';
        }
        if ($conId && strlen($d['id']) > 40) {
            $e[] = 'El identificador no puede superar los 40 caracteres.';
        }
        $limites = ['nombre' => 100, 'categoria' => 50, 'capacidad' => 60, 'carga_maxima' => 40, 'uso' => 200, 'tarifa' => 60];
        foreach ($limites as $campo => $max) {
            if ($d[$campo] === '' || mb_strlen($d[$campo]) > $max) {
                $e[] = "El campo $campo es obligatorio y admite hasta $max caracteres.";
            }
        }
        $precio = filter_var($d['precio'], FILTER_VALIDATE_FLOAT);
        if ($precio === false || $precio <= 0 || $precio > 99999999) {
            $e[] = 'El precio debe ser un número mayor que cero.';
        }
        $d['precio'] = $precio === false ? 0 : $precio;
        return [$d, $e];
    }
}
