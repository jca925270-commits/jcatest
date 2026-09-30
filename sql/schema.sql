-- ============================================================
-- Sistema de Stock - Esquema de base de datos
-- MySQL / MariaDB 10.4+
-- ============================================================

CREATE DATABASE IF NOT EXISTS stock_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE stock_db;

-- ------------------------------------------------------------
-- Usuarios y roles
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    rol             ENUM('admin','operador','lectura') NOT NULL DEFAULT 'operador',
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Catálogos
-- ------------------------------------------------------------
CREATE TABLE tipos_equipo (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL UNIQUE   -- EBD, D3, D3+
) ENGINE=InnoDB;

CREATE TABLE depositos (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE  -- Oficina, Campiña del Sur, Casa Santi, Contenedor, Tienda Nube...
) ENGINE=InnoDB;

CREATE TABLE lotes (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE clientes (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    razon_social  VARCHAR(200) NOT NULL,
    email         VARCHAR(150) NULL,
    entidad       VARCHAR(150) NULL,
    sucursal      VARCHAR(150) NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Dispositivos (unidad física con trazabilidad por MAC)
-- ------------------------------------------------------------
CREATE TABLE dispositivos (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    mac_wifi                VARCHAR(17) NULL,
    mac_eth                 VARCHAR(17) NULL,
    tipo_equipo_id          INT NOT NULL,
    lote_id                 INT NULL,
    caja_n                  VARCHAR(20) NULL,
    deposito_actual_id     INT NULL,
    cliente_actual_id       INT NULL,
    estado                  ENUM('en_stock','vendido','comodato','garantia',
                                  'a_reparar','reparado','devuelto','prueba','de_baja')
                             NOT NULL DEFAULT 'en_stock',
    codigo_barras_fabrica   VARCHAR(100) NULL,   -- código de fábrica escaneado, si existe
    codigo_barras_interno   VARCHAR(100) NULL,   -- código generado por el sistema a partir de la MAC
    fecha_llegada           DATE NULL,
    fecha_carga             DATE NULL,
    observaciones           TEXT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_mac_wifi UNIQUE (mac_wifi),
    CONSTRAINT uq_mac_eth UNIQUE (mac_eth),
    CONSTRAINT uq_cod_fabrica UNIQUE (codigo_barras_fabrica),
    CONSTRAINT uq_cod_interno UNIQUE (codigo_barras_interno),

    CONSTRAINT fk_disp_tipo FOREIGN KEY (tipo_equipo_id) REFERENCES tipos_equipo(id),
    CONSTRAINT fk_disp_lote FOREIGN KEY (lote_id) REFERENCES lotes(id),
    CONSTRAINT fk_disp_ubic FOREIGN KEY (deposito_actual_id) REFERENCES depositos(id),
    CONSTRAINT fk_disp_cliente FOREIGN KEY (cliente_actual_id) REFERENCES clientes(id),

    -- al menos una MAC debe estar presente
    CONSTRAINT chk_mac_presente CHECK (mac_wifi IS NOT NULL OR mac_eth IS NOT NULL),

    INDEX idx_mac_wifi (mac_wifi),
    INDEX idx_mac_eth (mac_eth),
    INDEX idx_cod_fabrica (codigo_barras_fabrica),
    INDEX idx_estado (estado)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Movimientos (trazabilidad histórica de cada dispositivo)
-- ------------------------------------------------------------
CREATE TABLE movimientos (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    dispositivo_id        INT NOT NULL,
    tipo_movimiento       ENUM('ingreso','venta','comodato','garantia','devolucion',
                                'a_reparar','reparado','movimiento_interno','ajuste','prueba')
                           NOT NULL,
    deposito_origen_id   INT NULL,
    deposito_destino_id  INT NULL,
    cliente_id            INT NULL,
    remito                VARCHAR(50) NULL,
    factura               VARCHAR(50) NULL,
    ticket                VARCHAR(50) NULL,
    motivo                VARCHAR(255) NULL,
    usuario_id            INT NULL,
    fecha                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_mov_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id),
    CONSTRAINT fk_mov_origen FOREIGN KEY (deposito_origen_id) REFERENCES depositos(id),
    CONSTRAINT fk_mov_destino FOREIGN KEY (deposito_destino_id) REFERENCES depositos(id),
    CONSTRAINT fk_mov_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),

    INDEX idx_mov_disp (dispositivo_id),
    INDEX idx_mov_fecha (fecha)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Configuración de alertas de stock bajo
-- ------------------------------------------------------------
CREATE TABLE alertas_config (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tipo_equipo_id  INT NOT NULL,
    deposito_id    INT NULL,
    stock_minimo    INT NOT NULL DEFAULT 10,

    CONSTRAINT fk_alerta_tipo FOREIGN KEY (tipo_equipo_id) REFERENCES tipos_equipo(id),
    CONSTRAINT fk_alerta_ubic FOREIGN KEY (deposito_id) REFERENCES depositos(id),
    CONSTRAINT uq_alerta UNIQUE (tipo_equipo_id, deposito_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Datos iniciales de catálogo
-- ------------------------------------------------------------
INSERT INTO tipos_equipo (nombre) VALUES ('EBD'), ('D3'), ('D3+');

INSERT INTO depositos (nombre) VALUES
 ('Oficina'), ('Campiña del Sur'), ('Casa Santi'), ('Contenedor'), ('Tienda Nube');

-- El usuario administrador inicial NO se crea acá.
-- Ejecutá /import/setup_admin.php una sola vez desde el navegador
-- (o por PHP CLI) para crear el primer usuario admin con una
-- contraseña real, generada de forma segura con password_hash().
