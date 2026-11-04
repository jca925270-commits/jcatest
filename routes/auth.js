const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { anotar } = require("../lib/registro-usuarios");

const router = express.Router();

router.get("/", async (req, res) => {
  if (req.query.accion === "me") {
    return res.json({ usuario: req.session.usuario || null });
  }
  res.status(404).json({ error: "Acción no encontrada" });
});

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

      if (!u || !u.activo) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      }
      if (!(await bcrypt.compare(pass, u.password_hash))) {
        return res.status(401).json({
          error: "La contraseña es incorrecta. Pedile al administrador que te la cambie desde Usuarios.",
        });
      }

      req.session.usuario = { id: u.id, nombre: u.nombre, rol: u.rol };
      try {
        await anotar({ usuario: req.session.usuario, tipo: "ingreso", detalle: "Ingresó al sistema" });
      } catch (_) { /* el ingreso no depende del registro */ }
      res.json({ usuario: req.session.usuario });
    } catch (e) {
      res.status(500).json({ error: "Error de servidor: " + e.message });
    }
    return;
  }

  if (accion === "logout") {
    const usuario = req.session.usuario;
    const cerrar = () => req.session.destroy(() => res.json({ ok: true }));
    if (!usuario) return cerrar();
    anotar({ usuario, tipo: "salida", detalle: "Cerró sesión" }).finally(cerrar);
    return;
  }

  if (accion === "cambiar") {
    if (!req.session.usuario) return res.status(401).json({ error: "Sesión no iniciada" });
    const actual = req.body.actual || "";
    const nueva = String(req.body.nueva || "");
    if (nueva.length < 6) {
      return res.status(400).json({ error: "La contraseña nueva tiene que tener al menos 6 caracteres." });
    }
    try {
      const [rows] = await pool.query(
        "SELECT password_hash FROM usuarios WHERE id = ? AND activo = 1",
        [req.session.usuario.id]
      );
      if (!rows[0] || !(await bcrypt.compare(actual, rows[0].password_hash))) {
        return res.status(400).json({ error: "La contraseña actual es incorrecta." });
      }
      const hash = await bcrypt.hash(nueva, 10);
      await pool.query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [hash, req.session.usuario.id]);
      try {
        await anotar({ usuario: req.session.usuario, tipo: "cambio", detalle: "Cambió su contraseña" });
      } catch (_) { /* el cambio de clave no depende del registro */ }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(404).json({ error: "Acción no encontrada" });
});

module.exports = router;
