-- Planilla BASE DE DATOS 2025-2026.
-- IngresosVarios3 y EgresosVarios3, separadas de movimientos y de la trazabilidad de MAC.

CREATE TABLE IF NOT EXISTS ingreso_soporte (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_ingreso DATE NULL,
    fecha_ingreso_texto VARCHAR(40) NULL,
    razsocial_agreg VARCHAR(255) NULL,
    razon_social VARCHAR(255) NULL,
    dispositivo_ingreso VARCHAR(120) NULL,
    estado_ingreso VARCHAR(80) NULL,
    mac VARCHAR(80) NULL,
    segui_ingreso VARCHAR(80) NULL,
    correo_ingreso VARCHAR(80) NULL,
    num_ticket VARCHAR(80) NULL,
    obs_encomienda_ingreso TEXT NULL,
    con_soporte_ingreso VARCHAR(255) NULL,
    motivo VARCHAR(255) NULL,
    instancia_gestion VARCHAR(80) NULL,
    mac_wifi VARCHAR(20) NULL,
    mac_eth VARCHAR(20) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS egreso_soporte (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_egreso DATE NULL,
    fecha_egreso_texto VARCHAR(40) NULL,
    razsocial_agreg VARCHAR(255) NULL,
    razon_social VARCHAR(255) NULL,
    dispositivo_egreso VARCHAR(120) NULL,
    estado_egreso VARCHAR(80) NULL,
    mac VARCHAR(80) NULL,
    envio_retiro VARCHAR(80) NULL,
    correo_egreso VARCHAR(80) NULL,
    segui_egreso VARCHAR(80) NULL,
    num_ticket VARCHAR(80) NULL,
    obs_encomienda_egreso TEXT NULL,
    con_soporte_egreso VARCHAR(255) NULL,
    instancia_gestion VARCHAR(80) NULL,
    mac_wifi VARCHAR(20) NULL,
    mac_eth VARCHAR(20) NULL,
    origen_fila INT NOT NULL,
    UNIQUE KEY uq_fila (origen_fila),
    KEY idx_mac_wifi (mac_wifi),
    KEY idx_mac_eth (mac_eth)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
