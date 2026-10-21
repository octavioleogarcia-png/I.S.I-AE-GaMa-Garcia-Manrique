-- =====================================================================
-- GaMa — Sistema de Gestión de Flota y Logística
-- Paso 1: Capa de datos (MySQL / phpMyAdmin)
--
-- Cómo usarlo: phpMyAdmin → pestaña "SQL" → pegar todo y "Continuar".
-- Crea la base `gama`, las tablas y dos cuentas de prueba.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS gama
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gama;

-- ---------------------------------------------------------------------
-- usuarios: clientes que piden camiones y operadores de despacho.
-- `password` es VARCHAR(255) para guardar el hash BCRYPT
-- (hoy ocupa 60 caracteres, pero PHP recomienda 255 por si el
-- algoritmo por defecto cambia en el futuro).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    telefono   VARCHAR(30)  NOT NULL,
    password   VARCHAR(255) NOT NULL,                 -- hash BCRYPT, nunca texto plano
    rol        ENUM('cliente', 'operador') NOT NULL DEFAULT 'cliente',
    creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- unidades: la flota (mismo catálogo que assets/data/catalogo.json).
-- El precio vive en el servidor: el total de un pedido se calcula
-- con estos valores, nunca con el precio que manda el navegador.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unidades (
    id         VARCHAR(40)   PRIMARY KEY,
    nombre     VARCHAR(100)  NOT NULL,
    categoria  VARCHAR(50)   NOT NULL,
    precio     DECIMAL(12,2) NOT NULL,
    tarifa     VARCHAR(60)   NOT NULL                 -- "por viaje", "por km", etc.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- pedidos: cada solicitud de camión hecha por un usuario.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id    INT           NOT NULL,
    direccion     VARCHAR(200)  NOT NULL,
    telefono      VARCHAR(30)   NOT NULL,
    medio_pago    VARCHAR(40)   NOT NULL,
    comentarios   VARCHAR(500)  NULL,
    cupon         VARCHAR(20)   NULL,
    subtotal      DECIMAL(12,2) NOT NULL,
    descuento_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
    total         DECIMAL(12,2) NOT NULL,
    estado        ENUM('pendiente', 'confirmado', 'en viaje', 'entregado', 'cancelado')
                  NOT NULL DEFAULT 'pendiente',
    creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- pedido_items: qué unidades y cuántos viajes/jornadas tiene cada pedido.
-- Se guarda el precio unitario del momento, por si después cambia la tarifa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_items (
    pedido_id       INT           NOT NULL,
    unidad_id       VARCHAR(40)   NOT NULL,
    cantidad        INT           NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (pedido_id, unidad_id),
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id)  ON DELETE CASCADE,
    FOREIGN KEY (unidad_id) REFERENCES unidades (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
INSERT IGNORE INTO unidades (id, nombre, categoria, precio, tarifa) VALUES
('volcador-chico',  'Volcador Chico 5 m³',    'Volcador',          45000, 'por viaje (hasta 15 km)'),
('volcador-grande', 'Volcador Grande 12 m³',  'Volcador',          78000, 'por viaje (hasta 15 km)'),
('acoplado',        'Camión con Acoplado',    'Transporte pesado', 15000, 'por km recorrido'),
('semi-banadera',   'Semirremolque Bañadera', 'Transporte pesado', 18500, 'por km recorrido'),
('mixer',           'Mixer Hormigonero',      'Servicio especial', 95000, 'por viaje'),
('hidrogrua',       'Hidrogrúa 8 Tn',         'Servicio especial', 60000, 'por media jornada');

-- Cuentas de prueba. Las contraseñas se guardan hasheadas con BCRYPT:
--   obras.lopez@gama.com  →  volcador2026   (cliente)
--   despacho@gama.com     →  hormigon2026   (operador)
INSERT IGNORE INTO usuarios (nombre, email, telefono, password, rol) VALUES
('Constructora López', 'obras.lopez@gama.com', '376 4123456',
 '$2y$10$8XPkmSn2xhenrpwyPK4YbeXvk8jiLn3.nunyAXNHh4veiwxFjVIR.', 'cliente'),
('Despacho GaMa', 'despacho@gama.com', '376 4000000',
 '$2y$10$Ocnuqmlu9kMSqWgFxa6NmeCSAJZspQISfWUXPLQY/l0cjHPOtUO0u', 'operador');
