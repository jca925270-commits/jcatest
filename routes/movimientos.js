const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const ESTADO_POR_MOVIMIENTO = {
  ingreso: "en_stock",
  venta: "vendido",
  comodato: "comodato",
  garantia: "garantia",
  devolucion: "en_stock",
  a_reparar: "a_reparar",
  reparado: "reparado",
  movimiento_interno: null,
  ajuste: null,
  prueba: "prueba",
};

router.get("/", async (req, res) => {
  try {
    const condiciones = [];
    const params = [];

    if (req.query.dispositivo_id) {
      condiciones.push("m.dispositivo_id = ?");
      params.push(req.query.dispositivo_id);
    }
    if (req.query.desde) {
      condiciones.push("m.fecha >= ?");
      params.push(req.query.desde);
    }
    if (req.query.hasta) {
      condiciones.push("m.fecha <= ?");
      params.push(req.query.hasta);
    }
    if (req.query.origen_hoja) {
      const hojas = req.query.origen_hoja.split(",").map((h) => h.trim()).filter(Boolean);
      if (hojas.length) {
        condiciones.push(`m.origen_hoja IN (${hojas.map(() => "?").join(",")})`);
        params.push(...hojas);
      }
    }
    if (req.query.cliente_id) {
      condiciones.push("m.cliente_id = ?");
      params.push(req.query.cliente_id);
    }
    if (req.query.mac) {
      const macLimpia = String(req.query.mac).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
      const macNorm = macLimpia.length === 12 ? macLimpia.match(/.{2}/g).join(":") : macLimpia;
      condiciones.push("(d.mac_wifi = ? OR d.mac_eth = ? OR d.mac_wifi LIKE ? OR d.mac_eth LIKE ?)");
      params.push(macNorm, macNorm, `%${req.query.mac}%`, `%${req.query.mac}%`);
    }
    if (req.query.tipo_movimiento) {
      const tipos = req.query.tipo_movimiento.split(",").map((t) => t.trim()).filter(Boolean);
      if (tipos.length) {
        condiciones.push(`m.tipo_movimiento IN (${tipos.map(() => "?").join(",")})`);
        params.push(...tipos);
      }
    }

    const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";
    const limite = Math.min(parseInt(req.query.limite) || 100, 500);

    const [rows] = await pool.query(
      `SELECT m.*, d.mac_wifi, d.mac_eth, c.razon_social AS cliente_nombre,
              uo.nombre AS origen_nombre, ud.nombre AS destino_nombre, us.nombre AS usuario_nombre
       FROM movimientos m
       LEFT JOIN dispositivos d ON d.id = m.dispositivo_id
       LEFT JOIN clientes c ON c.id = m.cliente_id
       LEFT JOIN depositos uo ON uo.id_deposito = m.deposito_origen_id
       LEFT JOIN depositos ud ON ud.id_deposito = m.deposito_destino_id
       LEFT JOIN usuarios us ON us.id = m.usuario_id
       ${where}
       ORDER BY m.fecha DESC
       LIMIT ${limite}`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  const dispositivoId = parseInt(b.dispositivo_id);
  const tipo = b.tipo_movimiento;

  if (!dispositivoId || !(tipo in ESTADO_POR_MOVIMIENTO)) {
    return res.status(400).json({ error: "dispositivo_id y tipo_movimiento válido son obligatorios" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO movimientos
       (dispositivo_id, tipo_movimiento, deposito_origen_id, deposito_destino_id,
        cliente_id, remito, factura, ticket, motivo, usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        dispositivoId, tipo, b.deposito_origen_id || null, b.deposito_destino_id || null,
        b.cliente_id || null, b.remito || null, b.factura || null, b.ticket || null,
        b.motivo || null, req.session.usuario.id,
      ]
    );

    const sets = [];
    const params = [];
    if (b.deposito_destino_id) {
      sets.push("deposito_actual_id = ?");
      params.push(b.deposito_destino_id);
    }
    const nuevoEstado = ESTADO_POR_MOVIMIENTO[tipo];
    if (nuevoEstado !== null) {
      sets.push("estado = ?");
      params.push(nuevoEstado);
    }
    if (["venta", "comodato", "garantia"].includes(tipo)) {
      sets.push("cliente_actual_id = ?");
      params.push(b.cliente_id || null);
    } else if (tipo === "devolucion") {
      sets.push("cliente_actual_id = NULL");
    }

    if (sets.length) {
      params.push(dispositivoId);
      await conn.query(`UPDATE dispositivos SET ${sets.join(", ")} WHERE id = ?`, params);
    }

    await conn.commit();
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: "No se pudo registrar el movimiento: " + e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
