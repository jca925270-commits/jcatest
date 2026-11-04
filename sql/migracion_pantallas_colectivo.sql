-- Resumen de pantallas de colectivo para el dashboard.
-- total_oficina sale de categorias_stock.
-- comprobadas_ok son los ingresos de MAC que todavía no egresaron.
-- con_falla cuenta ingresos de pantalla con wifi, pantalla o audio en falla o para repuestos.
-- Esas tres columnas viven en trazabilidad_ingreso_pantalla y en la pestaña.
-- vendidas sale de movimientos_cantidad.
-- sin_comprobar es el total de oficina menos comprobadas OK y vendidas.

CREATE TABLE IF NOT EXISTS pantallas_con_falla (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cantidad INT NOT NULL,
    detalle VARCHAR(255) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pantallas_colectivo_resumen (
    clave VARCHAR(40) NOT NULL PRIMARY KEY,
    etiqueta VARCHAR(80) NOT NULL,
    cantidad INT NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
