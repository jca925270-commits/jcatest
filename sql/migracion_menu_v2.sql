-- ============================================================
-- Migración: soporte para el nuevo menú (Búsqueda, Movimientos,
-- Depósito, Estado, Stock)
-- Ejecutar después de todas las migraciones anteriores.
-- ============================================================
USE stock_db;

-- 0) Renombrar "depositos" a "depositos" (mismo contenido y mismas
--    relaciones — MySQL/MariaDB actualiza automáticamente las foreign
--    keys de dispositivos, movimientos y alertas_config que ya apuntaban
--    a esta tabla, sin necesidad de tocarlas).
RENAME TABLE depositos TO depositos;

-- 1) Nuevo estado "actualizacion" para dispositivos (distinto de "reparado")
ALTER TABLE dispositivos
    MODIFY estado ENUM('en_stock','vendido','comodato','garantia',
                        'a_reparar','reparado','devuelto','prueba',
                        'de_baja','actualizacion')
    NOT NULL DEFAULT 'en_stock';

-- 2) Mismo estado disponible como tipo de movimiento, para poder
--    registrar el pasaje de un dispositivo a "actualizacion"
ALTER TABLE movimientos
    MODIFY tipo_movimiento ENUM('ingreso','venta','comodato','garantia',
                                 'devolucion','a_reparar','reparado',
                                 'movimiento_interno','ajuste','prueba',
                                 'actualizacion')
    NOT NULL;

-- 3) Stock de accesorios (no tienen MAC, se trackean por cantidad).
--    "accesorio" es un catálogo fijo (no texto libre), "deposito_id" apunta
--    a la tabla depositos (Campiña, Casa Santi, Oficina, Showroom).
CREATE TABLE IF NOT EXISTS accesorios (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    accesorio       ENUM(
                        'Control Remoto',
                        'Air Mouse',
                        'Cable ethernet',
                        'Fuente 12V D3',
                        'Fuente 24V',
                        'Fuente china EBD 5V',
                        'Fuente nueva EBD 5V 3 Amp.',
                        'Antena wifi',
                        'Mini antena wifi',
                        'Cable HDMI',
                        'Doble faz 3m',
                        'Doble faz 3m mini',
                        'Llave alem.'
                    ) NOT NULL,
    deposito_id     INT NULL,
    cantidad        INT NOT NULL DEFAULT 0,
    actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_accesorio_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id),
    CONSTRAINT uq_accesorio_deposito UNIQUE (accesorio, deposito_id)
) ENGINE=InnoDB;

-- Fila base en 0 para cada accesorio en cada depósito habitual, así ya
-- queda listo para cargar cantidades reales desde la pantalla de Stock.
INSERT IGNORE INTO depositos (nombre) VALUES ('Campiña del Sur'), ('Casa Santi'), ('Oficina'), ('Showroom');

INSERT IGNORE INTO accesorios (accesorio, deposito_id)
SELECT acc.nombre, d.id
FROM (
    SELECT 'Control Remoto' AS nombre UNION ALL SELECT 'Air Mouse' UNION ALL
    SELECT 'Cable ethernet' UNION ALL SELECT 'Fuente 12V D3' UNION ALL
    SELECT 'Fuente 24V' UNION ALL SELECT 'Fuente china EBD 5V' UNION ALL
    SELECT 'Fuente nueva EBD 5V 3 Amp.' UNION ALL SELECT 'Antena wifi' UNION ALL
    SELECT 'Mini antena wifi' UNION ALL SELECT 'Cable HDMI' UNION ALL
    SELECT 'Doble faz 3m' UNION ALL SELECT 'Doble faz 3m mini' UNION ALL
    SELECT 'Llave alem.'
) acc
CROSS JOIN depositos d
WHERE d.nombre IN ('Campiña del Sur', 'Casa Santi', 'Oficina', 'Showroom');

CREATE TABLE IF NOT EXISTS movimientos_accesorio (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    accesorio_id   INT NOT NULL,
    tipo_movimiento ENUM('ingreso','egreso','ajuste') NOT NULL,
    cantidad       INT NOT NULL,
    fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo         VARCHAR(255) NULL,
    usuario_id     INT NULL,

    CONSTRAINT fk_movacc_accesorio FOREIGN KEY (accesorio_id) REFERENCES accesorios(id),
    CONSTRAINT fk_movacc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
