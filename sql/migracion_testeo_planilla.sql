-- Planilla de equipos reparados y reutilizados para venta.
-- Testeo EBD-Reparados, D3refresh y No pasaron prueba. No se copian a movimientos.

CREATE TABLE IF NOT EXISTS testeo_ebd_reparados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NULL,
    fecha_comienzo DATE NULL,
    fecha_comienzo_texto VARCHAR(40) NULL,
    semanas VARCHAR(40) NULL,
    fecha_fin DATE NULL,
    fecha_fin_texto VARCHAR(40) NULL,
    mac_wifi VARCHAR(20) NULL,
    mac_eth VARCHAR(20) NULL,
    wifi VARCHAR(40) NULL,
    eth VARCHAR(40) NULL,
    tipo VARCHAR(120) NULL,
    observaciones TEXT NULL,
    entidad VARCHAR(255) NULL,
    ubicacion VARCHAR(255) NULL,
    estado VARCHAR(80) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS testeo_d3_refresh (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NULL,
    fecha_comienzo DATE NULL,
    fecha_comienzo_texto VARCHAR(40) NULL,
    semanas VARCHAR(40) NULL,
    fecha_fin DATE NULL,
    fecha_fin_texto VARCHAR(40) NULL,
    mac_wifi VARCHAR(20) NULL,
    mac_eth VARCHAR(20) NULL,
    wifi VARCHAR(40) NULL,
    eth VARCHAR(40) NULL,
    tipo VARCHAR(120) NULL,
    observaciones TEXT NULL,
    entidad VARCHAR(255) NULL,
    ubicacion VARCHAR(255) NULL,
    estado VARCHAR(80) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS testeo_no_pasaron_prueba (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NULL,
    fecha_comienzo DATE NULL,
    fecha_comienzo_texto VARCHAR(40) NULL,
    semanas VARCHAR(40) NULL,
    fecha_fin DATE NULL,
    fecha_fin_texto VARCHAR(40) NULL,
    mac_wifi VARCHAR(20) NULL,
    mac_eth VARCHAR(20) NULL,
    wifi VARCHAR(40) NULL,
    eth VARCHAR(40) NULL,
    tipo VARCHAR(120) NULL,
    observaciones TEXT NULL,
    entidad VARCHAR(255) NULL,
    ubicacion VARCHAR(255) NULL,
    estado VARCHAR(80) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS testeo_totales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hoja VARCHAR(20) NOT NULL,
    clave VARCHAR(40) NOT NULL,
    etiqueta VARCHAR(80) NOT NULL,
    cantidad INT NOT NULL,
    orden INT NOT NULL,
    UNIQUE KEY uq_hoja_clave (hoja, clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
