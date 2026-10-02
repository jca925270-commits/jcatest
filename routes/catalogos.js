const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();

router.get("/", requerirLogin, async (req, res) => {
  try {
    const [tipos] = await pool.query("SELECT id, nombre FROM tipos_equipo ORDER BY nombre");
    const [depositos] = await pool.query("SELECT id_deposito AS id, nombre FROM depositos ORDER BY nombre");
    const [lotes] = await pool.query("SELECT id, nombre FROM lotes ORDER BY nombre");
    res.json({ tipos_equipo: tipos, depositos, lotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
