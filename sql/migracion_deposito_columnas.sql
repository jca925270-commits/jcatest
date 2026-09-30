-- ============================================================
-- Migración: renombrar columnas de "ubicacion_..." a "deposito_..."
-- (la tabla ya se había renombrado antes con migracion_menu_v2.sql;
-- esto completa el cambio a nivel de columnas, para que en toda la
-- base de datos diga "depósito" en vez de "ubicación").
-- ============================================================
USE stock_db;

ALTER TABLE dispositivos
    CHANGE COLUMN ubicacion_actual_id deposito_actual_id INT NULL;

ALTER TABLE movimientos
    CHANGE COLUMN ubicacion_origen_id deposito_origen_id INT NULL,
    CHANGE COLUMN ubicacion_destino_id deposito_destino_id INT NULL;

ALTER TABLE alertas_config
    CHANGE COLUMN ubicacion_id deposito_id INT NULL;
