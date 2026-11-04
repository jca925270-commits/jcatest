const pool = require("../config/db");

const TABLAS = [
  "movimientos_cantidad",
  "trazabilidad_egreso_ebd",
  "trazabilidad_egreso_d3",
  "trazabilidad_egreso_ebd_reparado",
  "trazabilidad_egreso_pantalla",
  "trazabilidad_egreso_ebd_interno",
  "trazabilidad_devolucion_ebd",
  "trazabilidad_devolucion_d3",
];

const TABLAS_MOVIMIENTO = [
  "trazabilidad_egreso_ebd",
  "trazabilidad_egreso_d3",
  "trazabilidad_egreso_ebd_reparado",
  "trazabilidad_egreso_pantalla",
  "trazabilidad_ingreso_ebd",
  "trazabilidad_ingreso_d3",
  "trazabilidad_ingreso_ebd_reparado",
  "trazabilidad_ingreso_pantalla",
  "trazabilidad_ingreso_ebd_interno",
  "trazabilidad_egreso_ebd_interno",
  "trazabilidad_devolucion_ebd",
  "trazabilidad_devolucion_d3",
];

let columnaLista = null;
let movimientoListo = null;
let tablasExtraListas = null;

function asegurarTablasExtra() {
  if (!tablasExtraListas) {
    tablasExtraListas = (async () => {
      const ingreso = [
        "trazabilidad_ingreso_ebd_reparado",
        "trazabilidad_ingreso_pantalla",
        "trazabilidad_ingreso_ebd_interno",
      ];
      const egreso = [
        "trazabilidad_egreso_ebd_reparado",
        "trazabilidad_egreso_pantalla",
        "trazabilidad_egreso_ebd_interno",
      ];
      for (const tabla of ingreso) {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS ${tabla} (
             id INT AUTO_INCREMENT PRIMARY KEY,
             fecha_llegada DATE NULL,
             fecha_llegada_texto VARCHAR(40) NULL,
             fecha_carga DATE NULL,
             fecha_carga_texto VARCHAR(40) NULL,
             mac_wifi VARCHAR(20) NOT NULL,
             mac_eth VARCHAR(20) NULL,
             lote VARCHAR(80) NULL,
             caja VARCHAR(40) NULL,
             numero_equipo VARCHAR(20) NULL,
             origen_fila INT NOT NULL,
             UNIQUE KEY uq_fila (origen_fila),
             KEY idx_mac_wifi (mac_wifi),
             KEY idx_mac_eth (mac_eth)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
      }
      for (const tabla of egreso) {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS ${tabla} (
             id INT AUTO_INCREMENT PRIMARY KEY,
             cliente VARCHAR(255) NULL,
             fecha_despacho DATE NULL,
             fecha_despacho_texto VARCHAR(80) NULL,
             mac_wifi VARCHAR(20) NOT NULL,
             mac_eth VARCHAR(20) NULL,
             lote VARCHAR(80) NULL,
             caja VARCHAR(40) NULL,
             numero_equipo VARCHAR(20) NULL,
             origen_fila INT NOT NULL,
             UNIQUE KEY uq_fila (origen_fila),
             KEY idx_mac_wifi (mac_wifi),
             KEY idx_mac_eth (mac_eth)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
      }
      const [columnasCliente] = await pool.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trazabilidad_ingreso_ebd_interno' AND COLUMN_NAME = 'cliente'`
      );
      if (columnasCliente[0].n) return;
      const [tablas] = await pool.query(
        `SELECT COUNT(*) AS n FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trazabilidad_ingreso_ebd_interno'`
      );
      if (tablas[0].n) {
        await pool.query("ALTER TABLE trazabilidad_ingreso_ebd_interno ADD COLUMN cliente VARCHAR(255) NULL");
      }
    })().catch((error) => {
      tablasExtraListas = null;
      throw error;
    });
  }
  return tablasExtraListas;
}

function asegurarColumnaLite() {
  if (!columnaLista) {
    columnaLista = (async () => {
      for (const tabla of TABLAS) {
        const [tablas] = await pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [tabla]
        );
        if (!tablas[0].n) continue;
        const [columnas] = await pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'con_2_0'`,
          [tabla]
        );
        if (!columnas[0].n) await pool.query(`ALTER TABLE ${tabla} ADD COLUMN con_2_0 VARCHAR(40) NULL`);
      }
    })().catch((error) => {
      columnaLista = null;
      throw error;
    });
  }
  return columnaLista;
}

function asegurarMovimientoMac() {
  if (!movimientoListo) {
    movimientoListo = (async () => {
      await asegurarTablasExtra();
      for (const tabla of TABLAS_MOVIMIENTO) {
        const [tablas] = await pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [tabla]
        );
        if (!tablas[0].n) continue;
        const [columnas] = await pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'movimiento_id'`,
          [tabla]
        );
        if (!columnas[0].n) {
          await pool.query(`ALTER TABLE ${tabla} ADD COLUMN movimiento_id INT NULL, ADD KEY idx_movimiento (movimiento_id)`);
        }
      }
    })().catch((error) => {
      movimientoListo = null;
      throw error;
    });
  }
  return movimientoListo;
}

function textoLite(familia) {
  const clave = String(familia || "").toUpperCase();
  if (clave === "D3") return "D3 con 2.0 Lite";
  if (clave === "EBD" || clave === "EBD_REP" || clave === "EBD_INT") return "EBD con 2.0 Lite";
  return null;
}

function familiaDe(valor) {
  const texto = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\bD3\b/.test(texto)) return "D3";
  if (/\bEBD\b/.test(texto)) return "EBD";
  return "";
}

function partirLite(nombre) {
  const original = String(nombre || "").trim();
  const hallado = original.match(/\((EBD|D3)\s+con\s+2\.0\s+Lite\)/i);
  const limpio = original.replace(/\s*\((EBD|D3)\s+con\s+2\.0\s+Lite\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  return {
    limpio,
    marca: hallado ? textoLite(hallado[1]) : null,
  };
}

function razonPlanilla(nombre, marca) {
  const limpio = String(nombre || "").trim();
  if (!limpio || !marca) return limpio;
  if (limpio.toUpperCase().includes(String(marca).toUpperCase())) return limpio;
  return `${limpio} (${marca})`;
}

module.exports = { asegurarColumnaLite, asegurarMovimientoMac, asegurarTablasExtra, textoLite, familiaDe, partirLite, razonPlanilla };
