-- =====================================================================
-- GaMa — Sistema de Gestión de Flota y Logística (AE4)
-- Capa de datos MySQL / MariaDB.
--
-- Cómo usarlo: phpMyAdmin → pestaña "Importar" → elegir este archivo.
-- (o pestaña "SQL" → pegar todo y "Continuar"). Es repetible: se puede
-- importar más de una vez sin duplicar datos.
--
-- Trazabilidad con la AE1:
--   usuarios      → actores Cliente / Operario / Gerente
--   unidades      → RF1 Módulo de Flota y RF5 Catálogo Web
--   pedidos/items → RF6 Sistema de Pedidos (y RF3 Operaciones: estado)
--   cupones, reglas_volumen → cálculo automático del total (RF6)
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS gama
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gama;

-- ---------------------------------------------------------------------
-- usuarios: los tres actores de la AE1.
-- `password` es VARCHAR(255): guarda el hash BCRYPT (hoy 60 caracteres;
-- PHP recomienda 255 por si el algoritmo por defecto cambia).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    telefono   VARCHAR(30)  NOT NULL,
    password   VARCHAR(255) NOT NULL,                 -- hash BCRYPT, nunca texto plano
    rol        ENUM('cliente', 'operario', 'gerente') NOT NULL DEFAULT 'cliente',
    creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- unidades: la flota (RF1) que se muestra en el catálogo (RF5).
-- El precio vive en el servidor: el total de un pedido se calcula con
-- estos valores, nunca con el precio que manda el navegador.
-- `activo` permite dar de baja una unidad sin romper pedidos viejos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unidades (
    id           VARCHAR(40)   PRIMARY KEY,
    nombre       VARCHAR(100)  NOT NULL,
    categoria    VARCHAR(50)   NOT NULL,
    capacidad    VARCHAR(60)   NOT NULL,
    carga_maxima VARCHAR(40)   NOT NULL,
    uso          VARCHAR(200)  NOT NULL,
    precio       DECIMAL(12,2) NOT NULL,
    tarifa       VARCHAR(60)   NOT NULL,              -- "por viaje", "por km", etc.
    activo       TINYINT(1)    NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- pedidos: cada solicitud de transporte hecha por un cliente (RF6).
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
-- pedido_items: unidades y cantidad de viajes/jornadas de cada pedido.
-- Se guarda el precio unitario del momento, por si después cambia.
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
-- cupones y reglas_volumen: los descuentos viven en la base, no en
-- archivos sueltos, así el servidor es la única fuente de verdad.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cupones (
    codigo     VARCHAR(20)  PRIMARY KEY,
    porcentaje DECIMAL(5,2) NOT NULL,
    etiqueta   VARCHAR(80)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reglas_volumen (
    min_viajes INT          PRIMARY KEY,
    porcentaje DECIMAL(5,2) NOT NULL,
    etiqueta   VARCHAR(80)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- intentos_login: registro de ingresos fallidos para frenar la fuerza
-- bruta (5 intentos en 10 minutos por e-mail → HTTP 429).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intentos_login (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    email     VARCHAR(150) NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_fecha (email, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Datos iniciales (INSERT IGNORE: se pueden reimportar sin duplicar)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO unidades (id, nombre, categoria, capacidad, carga_maxima, uso, precio, tarifa) VALUES
('volcador-chico',  'Volcador Chico 5 m³',    'Volcador',          '5 m³',              '6.500 kg',  'Escombros y áridos en obras urbanas, calles angostas',     45000, 'por viaje (hasta 15 km)'),
('volcador-grande', 'Volcador Grande 12 m³',  'Volcador',          '12 m³',             '14.000 kg', 'Movimiento de tierra en obras de mayor escala',            78000, 'por viaje (hasta 15 km)'),
('acoplado',        'Camión con Acoplado',    'Transporte pesado', '20 m³ combinados',  '22.000 kg', 'Traslados de larga distancia entre obras o depósitos',     15000, 'por km recorrido'),
('semi-banadera',   'Semirremolque Bañadera', 'Transporte pesado', '30 m³',              '30.000 kg', 'Áridos a granel para grandes volúmenes',                   18500, 'por km recorrido'),
('mixer',           'Mixer Hormigonero',      'Servicio especial', '6 m³',              '12.000 kg', 'Entrega de hormigón elaborado en obra',                    95000, 'por viaje'),
('hidrogrua',       'Hidrogrúa 8 Tn',         'Servicio especial', '8.000 kg de izaje', '8.000 kg',  'Carga y descarga de materiales pesados, vigas y paneles', 60000, 'por media jornada');

INSERT IGNORE INTO cupones (codigo, porcentaje, etiqueta) VALUES
('UCP10', 10, 'Cupón UCP10'),
('GAMA20', 20, 'Cupón GAMA20');

INSERT IGNORE INTO reglas_volumen (min_viajes, porcentaje, etiqueta) VALUES
(5, 10, '10% por volumen (5+ viajes)'),
(10, 15, '15% por volumen alto (10+ viajes)');

-- Cuentas de prueba (contraseñas hasheadas con BCRYPT, costo 12):
--   obras.lopez@gama.com  →  volcador2026   (cliente)
--   despacho@gama.com     →  hormigon2026   (operario)
--   gerencia@gama.com     →  gerente2026    (gerente)
INSERT IGNORE INTO usuarios (nombre, email, telefono, password, rol) VALUES
('Constructora López', 'obras.lopez@gama.com', '376 4123456', '$2y$12$8SfspBhd/kQDg91vfOlVD.TPI6.3qZDb/N1EHlJrPrakz0mmLXou2', 'cliente'),
('Despacho GaMa',      'despacho@gama.com',    '376 4000000', '$2y$12$0T0lYUjIVWco1rOpJyQkaustifnswlACYCTdgYZ8cKT16KSTz1U9K', 'operario'),
('Gerencia GaMa',      'gerencia@gama.com',    '376 4000001', '$2y$12$ukUA8idVO0sqMpT9pZ6Pu.DJoO/tMpfnXiBoewbULLV8LUp0tXMKm', 'gerente');
