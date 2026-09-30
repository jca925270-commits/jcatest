-- ============================================================
-- Migración: soporte para sincronización automática desde Excel
-- Ejecutar una sola vez después de schema.sql
-- ============================================================
USE stock_db;

ALTER TABLE movimientos
    ADD COLUMN origen_hoja VARCHAR(150) NULL COMMENT 'Nombre de la hoja de Excel de donde vino el movimiento',
    ADD COLUMN origen_fila INT NULL COMMENT 'N° de fila de la hoja de Excel',
    ADD CONSTRAINT uq_origen UNIQUE (origen_hoja, origen_fila);

-- Tabla de control: guarda cuándo se sincronizó cada archivo por última vez
CREATE TABLE IF NOT EXISTS sync_control (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    archivo      VARCHAR(255) NOT NULL UNIQUE,
    ultima_sync  DATETIME NOT NULL,
    filas_ok     INT NOT NULL DEFAULT 0,
    filas_error  INT NOT NULL DEFAULT 0,
    detalle      TEXT NULL
) ENGINE=InnoDB;
