-- Trazabilidad de MAC desde la planilla BASE MAC ADDRESS.
-- Una tabla por pestaña. La sync las crea si todavía no existen.

CREATE TABLE IF NOT EXISTS trazabilidad_ingreso_ebd (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_llegada DATE NULL,
    fecha_llegada_texto VARCHAR(40) NULL,
    fecha_carga DATE NULL,
    fecha_carga_texto VARCHAR(40) NULL,
    mac_wifi VARCHAR(20) NOT NULL,
    mac_eth VARCHAR(20) NULL,
    lote VARCHAR(80) NULL,
    caja VARCHAR(40) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trazabilidad_ingreso_d3 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_llegada DATE NULL,
    fecha_llegada_texto VARCHAR(40) NULL,
    fecha_carga DATE NULL,
    fecha_carga_texto VARCHAR(40) NULL,
    mac_wifi VARCHAR(20) NOT NULL,
    mac_eth VARCHAR(20) NULL,
    lote VARCHAR(80) NULL,
    caja VARCHAR(40) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trazabilidad_egreso_ebd (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente VARCHAR(255) NULL,
    fecha_despacho DATE NULL,
    fecha_despacho_texto VARCHAR(80) NULL,
    mac_wifi VARCHAR(20) NOT NULL,
    mac_eth VARCHAR(20) NULL,
    lote VARCHAR(80) NULL,
    caja VARCHAR(40) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trazabilidad_egreso_d3 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente VARCHAR(255) NULL,
    fecha_despacho DATE NULL,
    fecha_despacho_texto VARCHAR(80) NULL,
    mac_wifi VARCHAR(20) NOT NULL,
    mac_eth VARCHAR(20) NULL,
    lote VARCHAR(80) NULL,
    caja VARCHAR(40) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
