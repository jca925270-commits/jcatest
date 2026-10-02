const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

// GET /api/accesorios?deposito_id=1
router.get("/", async (req, res) => {
  try {
    const condiciones = [];
    const params = [];
    if (req.query.deposito_id) {
      condiciones.push("a.deposito_id = ?");
      params.push(req.query.deposito_id);
    }
    const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";
    const [rows] = await pool.query(
      `SELECT a.id, a.accesorio, a.cantidad, a.deposito_id, d.nombre AS deposito_nombre
       FROM accesorios a
       LEFT JOIN depositos d ON d.id_deposito = a.deposito_id
       ${where}
       ORDER BY d.nombre, a.accesorio`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/accesorios  { accesorio_id, tipo_movimiento: 'ingreso'|'egreso'|'ajuste', cantidad, motivo }
router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const { accesorio_id, tipo_movimiento, cantidad, motivo } = req.body;
  const cant = parseInt(cantidad);

  if (!accesorio_id || !["ingreso", "egreso", "ajuste"].includes(tipo_movimiento) || isNaN(cant)) {
    return res.status(400).json({ error: "accesorio_id, tipo_movimiento y cantidad son obligatorios" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let delta = cant;
    if (tipo_movimiento === "egreso") delta = -Math.abs(cant);
    if (tipo_movimiento === "ingreso") delta = Math.abs(cant);
    // "ajuste" usa el signo que venga tal cual (puede ser positivo o negativo)

    const [result] = await conn.query(
      "UPDATE accesorios SET cantidad = GREATEST(cantidad + ?, 0) WHERE id = ?",
      [delta, accesorio_id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Accesorio no encontrado" });
    }

    await conn.query(
      `INSERT INTO movimientos_accesorio (accesorio_id, tipo_movimiento, cantidad, motivo, usuario_id)
       VALUES (?,?,?,?,?)`,
      [accesorio_id, tipo_movimiento, cant, motivo || null, req.session.usuario.id]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
