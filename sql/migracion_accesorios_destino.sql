-- Accesorios: cada pieza se guarda por depósito y por destino
-- (venta u uso interno). La pantalla suma Oficina, Showroom,
-- Casa Santi y Uso interno como Todo Banner.

ALTER TABLE accesorios
  ADD COLUMN destino ENUM('venta','uso_interno') NOT NULL DEFAULT 'venta' AFTER deposito_id;

ALTER TABLE accesorios DROP INDEX uq_accesorio_deposito;
ALTER TABLE accesorios ADD UNIQUE KEY uq_accesorio_lugar (accesorio, deposito_id, destino);
