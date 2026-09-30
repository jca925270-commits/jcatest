-- ============================================================
-- Completa la tabla `clientes` con las razones sociales que
-- quedaron guardadas como texto suelto en movimientos_cantidad
-- (historial de STOCK_2026.xlsx), y que nunca se habían creado
-- como clientes reales.
--
-- Es seguro correrla de nuevo: no duplica (compara por nombre
-- exacto, igual que el resto del sistema).
-- ============================================================
USE stock_db;

INSERT INTO clientes (razon_social)
SELECT DISTINCT TRIM(razon_social)
FROM movimientos_cantidad
WHERE razon_social IS NOT NULL
  AND TRIM(razon_social) <> ''
  AND TRIM(razon_social) NOT IN (SELECT razon_social FROM clientes);

-- Mostrar el total actualizado de clientes en la base
SELECT COUNT(*) AS total_clientes FROM clientes;
