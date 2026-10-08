const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const COLUMNAS_INGRESO = [
  ["perifericos", "VARCHAR(255) NULL"],
  ["codigo_seguimiento", "VARCHAR(80) NULL"],
  ["deposito", "VARCHAR(120) NULL"],
  ["lote", "VARCHAR(80) NULL"],
  ["remito", "VARCHAR(80) NULL"],
  ["factura", "VARCHAR(80) NULL"],
  ["caja", "VARCHAR(40) NULL"],
  ["origen", "VARCHAR(20) NOT NULL DEFAULT 'planilla'"],
];

async function asegurarColumnasIngreso() {
  for (const [nombre, tipo] of COLUMNAS_INGRESO) {
    const [[{ c }]] = await pool.query(
      `SELECT COUNT(*) c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingreso_soporte' AND COLUMN_NAME = ?`,
      [nombre]
    );
    if (!Number(c)) await pool.query(`ALTER TABLE ingreso_soporte ADD COLUMN ${nombre} ${tipo}`);
  }
}

function texto(valor, max) {
  const limpio = String(valor ?? "").trim();
  if (!limpio) return null;
  return limpio.slice(0, max);
}

function macsDe(valor) {
  const tokens = String(valor || "").toUpperCase().match(/[0-9A-F]{2}(?::[0-9A-F]{2}){5}|[0-9A-F]{12}/g) || [];
  return tokens.map((token) => token.replace(/[^0-9A-F]/g, ""));
}

const CONSULTAS = {
  ingreso: `SELECT DATE_FORMAT(fecha_ingreso, '%Y-%m-%d') AS fecha, fecha_ingreso_texto AS fecha_texto,
      razsocial_agreg, razon_social, dispositivo_ingreso AS dispositivo, estado_ingreso AS estado,
      mac, NULL AS envio_retiro, correo_ingreso AS correo, segui_ingreso AS seguimiento,
      codigo_seguimiento, num_ticket, obs_encomienda_ingreso AS observacion, con_soporte_ingreso AS contacto,
      motivo, instancia_gestion, mac_wifi, mac_eth, perifericos, deposito, lote, remito, factura, caja, origen
    FROM ingreso_soporte ORDER BY fecha_ingreso IS NULL, fecha_ingreso DESC, origen_fila DESC`,
  egreso: `SELECT DATE_FORMAT(fecha_egreso, '%Y-%m-%d') AS fecha, fecha_egreso_texto AS fecha_texto,
      razsocial_agreg, razon_social, dispositivo_egreso AS dispositivo, estado_egreso AS estado,
      mac, envio_retiro, correo_egreso AS correo, segui_egreso AS seguimiento,
      num_ticket, obs_encomienda_egreso AS observacion, con_soporte_egreso AS contacto,
      NULL AS motivo, instancia_gestion, mac_wifi, mac_eth
    FROM egreso_soporte ORDER BY fecha_egreso IS NULL, fecha_egreso DESC, origen_fila DESC`,
};

router.get("/opciones", async (req, res) => {
  try {
    await asegurarColumnasIngreso();
    const distintos = async (sql) => {
      const [rows] = await pool.query(sql);
      return rows.map((r) => r.v).filter(Boolean);
    };
    const [tipos] = await pool.query("SELECT nombre FROM tipos_equipo ORDER BY nombre");
    const [depositos] = await pool.query("SELECT nombre FROM depositos ORDER BY nombre");
    const [lotes] = await pool.query("SELECT nombre FROM lotes ORDER BY nombre");
    const dispositivosHoja = await distintos(
      "SELECT DISTINCT dispositivo_ingreso AS v FROM ingreso_soporte WHERE dispositivo_ingreso IS NOT NULL AND dispositivo_ingreso <> '' ORDER BY v"
    );
    const dispositivos = [...new Set([...dispositivosHoja, ...tipos.map((t) => t.nombre)])].sort((a, b) => a.localeCompare(b, "es"));
    res.json({
      razones: await distintos("SELECT DISTINCT razon_social AS v FROM ingreso_soporte WHERE razon_social IS NOT NULL AND razon_social <> '' ORDER BY v"),
      dispositivos,
      estados: await distintos("SELECT DISTINCT estado_ingreso AS v FROM ingreso_soporte WHERE estado_ingreso IS NOT NULL AND estado_ingreso <> '' ORDER BY v"),
      carriers: await distintos("SELECT DISTINCT correo_ingreso AS v FROM ingreso_soporte WHERE correo_ingreso IS NOT NULL AND correo_ingreso <> '' ORDER BY v"),
      instancias: await distintos("SELECT DISTINCT instancia_gestion AS v FROM ingreso_soporte WHERE instancia_gestion IS NOT NULL AND instancia_gestion <> '' ORDER BY v"),
      depositos: depositos.map((d) => d.nombre),
      lotes: lotes.map((l) => l.nombre),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/ingreso", requerirRol(["admin", "operador"]), async (req, res) => {
  try {
    await asegurarColumnasIngreso();
    const b = req.body || {};
    const razonLista = texto(b.razon_social, 255);
    const razonNueva = texto(b.razsocial_agreg, 255);
    const razon = razonLista || razonNueva;
    const dispositivo = texto(b.dispositivo, 120) || texto(b.dispositivo_otro, 120);
    const macTexto = texto(b.mac, 80);
    const partesMac = macsDe(macTexto);
    const wifiIngresada = macsDe(b.mac_wifi)[0] || null;
    const ethIngresada = macsDe(b.mac_eth)[0] || null;
    const macWifi = wifiIngresada || partesMac[0] || null;
    const macEth = ethIngresada || partesMac[1] || null;
    const mac = macTexto || [macWifi, macEth].filter(Boolean).join(" | ") || null;
    if (!razon && !dispositivo && !mac) {
      return res.status(400).json({ error: "Completá al menos la razón social, el dispositivo o una MAC." });
    }
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || "")) ? b.fecha : new Date().toISOString().slice(0, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[fila]] = await conn.query(
        "SELECT COALESCE(MIN(CASE WHEN origen_fila < 0 THEN origen_fila END), 0) - 1 AS n FROM ingreso_soporte FOR UPDATE"
      );
      const origenFila = Number(fila.n);
      await conn.query(
        `INSERT INTO ingreso_soporte (
           fecha_ingreso, razsocial_agreg, razon_social, dispositivo_ingreso, estado_ingreso,
           mac, segui_ingreso, correo_ingreso, codigo_seguimiento, num_ticket, obs_encomienda_ingreso,
           con_soporte_ingreso, motivo, instancia_gestion, mac_wifi, mac_eth, perifericos,
           deposito, lote, remito, factura, caja, origen, origen_fila
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sitio', ?)`,
        [
          fecha,
          razonNueva,
          razon,
          dispositivo,
          texto(b.estado, 80),
          mac,
          texto(b.seguimiento, 80),
          texto(b.correo, 80) || texto(b.correo_otro, 80),
          texto(b.codigo_seguimiento, 80),
          texto(b.num_ticket, 80),
          texto(b.observacion, 4000),
          texto(b.contacto, 255),
          texto(b.motivo, 255),
          texto(b.instancia_gestion, 80) || "PENDIENTE",
          macWifi,
          macEth,
          texto(b.perifericos, 255),
          texto(b.deposito, 120),
          texto(b.lote, 80),
          texto(b.remito, 80),
          texto(b.factura, 80),
          texto(b.caja, 40),
          origenFila,
        ]
      );
      await conn.commit();
      res.status(201).json({ ok: true, origen_fila: origenFila });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  const sql = CONSULTAS[String(req.query.tipo || "")];
  if (!sql) return res.status(400).json({ error: "Tipo de planilla desconocido" });
  try {
    if (req.query.tipo === "ingreso") await asegurarColumnasIngreso();
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
