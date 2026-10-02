const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

/** Normaliza una MAC a formato AA:BB:CC:DD:EE:FF en mayúsculas. */
function normalizarMac(mac) {
  if (!mac) return null;
  const limpio = String(mac).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (!limpio) return null;
  if (limpio.length !== 12) return limpio;
  return limpio.match(/.{2}/g).join(":");
}

// GET /api/dispositivos?id=1  |  ?q=...&estado=...&tipo_equipo_id=...&deposito_id=...
router.get("/", async (req, res) => {
  try {
    if (req.query.id) {
      const [rows] = await pool.query(
        `SELECT d.*, t.nombre AS tipo_nombre, u.nombre AS deposito_nombre,
                l.nombre AS lote_nombre, c.razon_social AS cliente_nombre
         FROM dispositivos d
         LEFT JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
         LEFT JOIN depositos u ON u.id_deposito = d.deposito_actual_id
         LEFT JOIN lotes l ON l.id = d.lote_id
         LEFT JOIN clientes c ON c.id = d.cliente_actual_id
         WHERE d.id = ?`,
        [req.query.id]
      );
      return res.json(rows[0] || null);
    }

    const condiciones = [];
    const params = [];

    const q = (req.query.q || "").trim();
    if (q) {
      const macNorm = normalizarMac(q);
      condiciones.push(
        "(d.mac_wifi = ? OR d.mac_eth = ? OR d.codigo_barras_fabrica = ? OR d.codigo_barras_interno = ? OR d.mac_wifi LIKE ? OR d.mac_eth LIKE ?)"
      );
      params.push(macNorm, macNorm, q, q, `%${q}%`, `%${q}%`);
    }

    if (req.query.estado) {
      const estados = req.query.estado.split(",").map((e) => e.trim()).filter(Boolean);
      if (estados.length === 1) {
        condiciones.push("d.estado = ?");
        params.push(estados[0]);
      } else if (estados.length > 1) {
        condiciones.push(`d.estado IN (${estados.map(() => "?").join(",")})`);
        params.push(...estados);
      }
    }
    if (req.query.tipo_equipo_id) {
      condiciones.push("d.tipo_equipo_id = ?");
      params.push(req.query.tipo_equipo_id);
    }
    if (req.query.deposito_id) {
      condiciones.push("d.deposito_actual_id = ?");
      params.push(req.query.deposito_id);
    }

    const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";
    const limite = Math.min(parseInt(req.query.limite) || 100, 500);

    const [rows] = await pool.query(
      `SELECT d.id, d.mac_wifi, d.mac_eth, d.estado, d.caja_n,
              d.codigo_barras_fabrica, d.codigo_barras_interno, d.fecha_llegada,
              t.nombre AS tipo_nombre, u.nombre AS deposito_nombre,
              l.nombre AS lote_nombre, c.razon_social AS cliente_nombre
       FROM dispositivos d
       LEFT JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
       LEFT JOIN depositos u ON u.id_deposito = d.deposito_actual_id
       LEFT JOIN lotes l ON l.id = d.lote_id
       LEFT JOIN clientes c ON c.id = d.cliente_actual_id
       ${where}
       ORDER BY d.updated_at DESC
       LIMIT ${limite}`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dispositivos
router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  const macWifi = normalizarMac(b.mac_wifi);
  const macEth = normalizarMac(b.mac_eth);

  if (!macWifi && !macEth) {
    return res.status(400).json({ error: "Debe ingresar al menos una MAC (WiFi o Ethernet)" });
  }
  if (!b.tipo_equipo_id) {
    return res.status(400).json({ error: "El tipo de equipo es obligatorio" });
  }

  const codigoInterno = "INT-" + (macWifi || macEth).replace(/:/g, "");

  try {
    const [result] = await pool.query(
      `INSERT INTO dispositivos
       (mac_wifi, mac_eth, tipo_equipo_id, lote_id, caja_n, deposito_actual_id,
        estado, codigo_barras_fabrica, codigo_barras_interno, fecha_llegada, fecha_carga, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        macWifi, macEth, b.tipo_equipo_id, b.lote_id || null, b.caja_n || null,
        b.deposito_actual_id || null, b.estado || "en_stock", b.codigo_barras_fabrica || null,
        codigoInterno, b.fecha_llegada || null, b.fecha_carga || null, b.observaciones || null,
      ]
    );
    res.json({ id: result.insertId, codigo_barras_interno: codigoInterno });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ya existe un dispositivo con esa MAC o código de barras" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/dispositivos
router.put("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  const id = parseInt(b.id);
  if (!id) return res.status(400).json({ error: "Falta id" });

  const campos = ["mac_wifi", "mac_eth", "tipo_equipo_id", "lote_id", "caja_n",
    "deposito_actual_id", "cliente_actual_id", "estado", "codigo_barras_fabrica", "observaciones"];
  const sets = [];
  const params = [];

  for (const c of campos) {
    if (Object.prototype.hasOwnProperty.call(b, c)) {
      let valor = b[c];
      if (c === "mac_wifi" || c === "mac_eth") valor = normalizarMac(valor);
      sets.push(`${c} = ?`);
      params.push(valor === "" ? null : valor);
    }
  }
  if (!sets.length) return res.json({ ok: true });
  params.push(id);

  try {
    await pool.query(`UPDATE dispositivos SET ${sets.join(", ")} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Conflicto: la MAC o código ya está en uso" });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/dispositivos?id=1  (da de baja, no borra físicamente)
router.delete("/", requerirRol(["admin"]), async (req, res) => {
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: "Falta id" });
  try {
    await pool.query("UPDATE dispositivos SET estado = 'de_baja' WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
