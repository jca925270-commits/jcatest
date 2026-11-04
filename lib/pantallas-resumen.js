const pool = require("../config/db");

let columnasListas = null;

function asegurarColumnas() {
  if (!columnasListas) {
    columnasListas = (async () => {
      for (const columna of ["estado_wifi", "estado_pantalla", "estado_audio", "estado_auto"]) {
        const [existe] = await pool.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trazabilidad_ingreso_pantalla' AND COLUMN_NAME = ?`,
          [columna]
        );
        if (!existe.length) {
          await pool.query(`ALTER TABLE trazabilidad_ingreso_pantalla ADD COLUMN ${columna} VARCHAR(40) NULL`);
        }
      }
    })().catch((error) => {
      columnasListas = null;
      throw error;
    });
  }
  return columnasListas;
}

async function calcularPantallas(categorias) {
  const cats = categorias || (await pool.query(
    "SELECT id, nombre, cantidad_actual FROM categorias_stock"
  ))[0];
  let total = 0;
  const ids = [];
  for (const categoria of cats) {
    const nombre = String(categoria.nombre || "").toLowerCase();
    if (nombre.includes("pantalla") && nombre.includes("colectiv")) {
      total += Number(categoria.cantidad_actual) || 0;
      ids.push(categoria.id);
    }
  }
  let vendidas = 0;
  if (ids.length) {
    const [ventas] = await pool.query(
      `SELECT COALESCE(SUM(egreso), 0) AS vendidas
       FROM movimientos_cantidad
       WHERE categoria_id IN (${ids.map(() => "?").join(",")})
         AND estado IN ('VENTA', 'VENTA COSTO 0')`,
      ids
    );
    vendidas = Number(ventas[0].vendidas) || 0;
  }
  await asegurarColumnas();
  const filtroFalla = `COALESCE(i.estado_pantalla, '') IN ('Falla', 'Con falla', 'Para repuestos')`;
  const [ingresos] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM trazabilidad_ingreso_pantalla i
     WHERE i.mac_wifi IS NOT NULL AND i.mac_wifi <> ''
       AND NOT (${filtroFalla})`
  );
  const [fallas] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM trazabilidad_ingreso_pantalla i
     WHERE i.mac_wifi IS NOT NULL AND i.mac_wifi <> ''
       AND ${filtroFalla}`
  );
  const comprobadasOk = Number(ingresos[0].n) || 0;
  const conFalla = Number(fallas[0].n) || 0;
  return {
    total,
    comprobadas_ok: comprobadasOk,
    con_falla: conFalla,
    vendidas,
    sin_comprobar: Math.max(0, total - comprobadasOk - vendidas),
  };
}

module.exports = { calcularPantallas };
