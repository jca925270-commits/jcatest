const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirRol(["admin"]));

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, rol, activo, created_at FROM usuarios ORDER BY nombre"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  const b = req.body;
  for (const campo of ["nombre", "password", "rol"]) {
    if (!b[campo]) return res.status(400).json({ error: `Falta ${campo}` });
  }
  try {
    const hash = await bcrypt.hash(b.password, 10);
    const [result] = await pool.query(
      "INSERT INTO usuarios (nombre, password_hash, rol) VALUES (?,?,?)",
      [b.nombre, hash, b.rol]
    );
    res.json({ id: result.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ese nombre de usuario ya está registrado" });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put("/", async (req, res) => {
  const b = req.body;
  const id = parseInt(b.id);
  if (!id) return res.status(400).json({ error: "Falta id" });

  const sets = ["nombre = ?", "rol = ?", "activo = ?"];
  const params = [b.nombre, b.rol, b.activo ? 1 : 0];
  if (b.password) {
    sets.push("password_hash = ?");
    params.push(await bcrypt.hash(b.password, 10));
  }
  params.push(id);

  try {
    await pool.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete("/", async (req, res) => {
  const usuarioActual = req.session.usuario;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: "Falta id" });

  if (id === usuarioActual.id) {
    return res.status(400).json({ error: "No podés eliminar tu propio usuario mientras estás logueado con él" });
  }

  try {
    const [rows] = await pool.query("SELECT rol FROM usuarios WHERE id = ?", [id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

    if (u.rol === "admin") {
      const [[{ c }]] = await pool.query("SELECT COUNT(*) c FROM usuarios WHERE rol = 'admin'");
      if (c <= 1) {
        return res.status(400).json({ error: "No se puede eliminar: es el único usuario administrador que queda" });
      }
    }

    await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "ER_ROW_IS_REFERENCED_2" || e.code === "ER_ROW_IS_REFERENCED") {
      return res.status(409).json({
        error: "No se puede eliminar: este usuario tiene movimientos registrados a su nombre. "
          + "Podés desactivarlo en su lugar (destildar \"Activo\") para bloquear el acceso sin perder el historial.",
      });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;