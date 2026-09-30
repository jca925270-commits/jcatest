-- ============================================================
-- Migración: stock por cantidad (histórico de STOCK_2026.xlsx)
-- Esto es INDEPENDIENTE de la tabla `dispositivos` (que es por MAC).
-- Sirve para llevar la cuenta de cantidades por categoría tal como
-- estaba organizada la planilla histórica, ya que esa planilla no
-- tiene MAC y no puede vincularse a un dispositivo puntual.
-- Ejecutar después de schema.sql y migracion_sync.sql
-- ============================================================
USE stock_db;

CREATE TABLE IF NOT EXISTS categorias_stock (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,          -- ej: "Oficina (EBD para Venta)"
    pais            VARCHAR(50)  NOT NULL DEFAULT 'ARGENTINA',
    cantidad_actual INT NOT NULL DEFAULT 0,
    actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_categoria_pais UNIQUE (nombre, pais)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_cantidad (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id  INT NOT NULL,
    fecha         DATE NULL,
    estado        VARCHAR(50) NULL,     -- CONTEO, VENTA, etc. (columna "ESTADO" del Excel)
    remito        VARCHAR(50) NULL,
    factura       VARCHAR(50) NULL,
    razon_social  VARCHAR(255) NULL,
    ticket        VARCHAR(50) NULL,
    motivo        VARCHAR(255) NULL,
    ingreso       INT NULL,
    egreso        INT NULL,
    origen_hoja   VARCHAR(100) NOT NULL,
    origen_fila   INT NOT NULL,

    CONSTRAINT fk_movcant_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_stock(id),
    CONSTRAINT uq_movcant_origen UNIQUE (origen_hoja, origen_fila, categoria_id),
    INDEX idx_movcant_fecha (fecha)
) ENGINE=InnoDB;
