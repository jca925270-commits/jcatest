const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const soloPlanilla = req.query.planilla === "1";
    const filtroPlanilla = soloPlanilla ? " AND planilla = 1" : "";
    let rows;
    if (q) {
      [rows] = await pool.query(
        `SELECT * FROM clientes WHERE razon_social LIKE ?${filtroPlanilla} ORDER BY razon_social LIMIT 500`,
        [`%${q}%`]
      );
    } else {
      [rows] = await pool.query(
        `SELECT * FROM clientes WHERE 1=1${filtroPlanilla} ORDER BY razon_social LIMIT 5000`
      );
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  if (!b.razon_social) return res.status(400).json({ error: "razon_social es obligatoria" });
  try {
    const [result] = await pool.query(
      "INSERT INTO clientes (razon_social, email, entidad, sucursal) VALUES (?,?,?,?)",
      [b.razon_social, b.email || null, b.entidad || null, b.sucursal || null]
    );
    res.json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  const id = parseInt(b.id);
  if (!id) return res.status(400).json({ error: "Falta id" });
  try {
    await pool.query(
      "UPDATE clientes SET razon_social=?, email=?, entidad=?, sucursal=? WHERE id=?",
      [b.razon_social, b.email || null, b.entidad || null, b.sucursal || null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
