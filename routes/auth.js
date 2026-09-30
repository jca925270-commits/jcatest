const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const router = express.Router();

// GET /api/auth?accion=me
router.get("/", async (req, res) => {
  if (req.query.accion === "me") {
    return res.json({ usuario: req.session.usuario || null });
  }
  res.status(404).json({ error: "Acción no encontrada" });
});

// POST /api/auth?accion=login | ?accion=logout
router.post("/", async (req, res) => {
  const accion = req.query.accion;

  if (accion === "login") {
    const usuario = (req.body.nombre || req.body.usuario || "").trim();
    const pass = req.body.password || "";

    if (!usuario || !pass) {
      return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, nombre, password_hash, rol, activo FROM usuarios WHERE nombre = ?",
        [usuario]
      );
      const u = rows[0];

      if (!u || !u.activo || !(await bcrypt.compare(pass, u.password_hash))) {
        return res.status(401).json({ error: "Credenciales inválidas" });
      }

      req.session.usuario = { id: u.id, nombre: u.nombre, rol: u.rol };
      res.json({ usuario: req.session.usuario });
    } catch (e) {
      res.status(500).json({ error: "Error de servidor: " + e.message });
    }
    return;
  }

  if (accion === "logout") {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
    return;
  }

  res.status(404).json({ error: "Acción no encontrada" });
});

module.exports = router;