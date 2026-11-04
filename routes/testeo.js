const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const HOJAS = {
  ebd: {
    tabla: "testeo_ebd_reparados",
    titulo: "Testeo EBD Reparados",
    etiquetaTipo: "Tipo de fuente",
    etiquetaLugar: "Ubicación",
  },
  d3: {
    tabla: "testeo_d3_refresh",
    titulo: "D3 reutilizados/devueltos/sin antena wifi",
    etiquetaTipo: "Tipo de equipo",
    etiquetaLugar: "Orientación",
  },
  no_pasaron: {
    tabla: "testeo_no_pasaron_prueba",
    titulo: "No pasaron prueba",
    etiquetaTipo: "Tipo de fuente",
    etiquetaLugar: "Ubicación",
  },
};

router.get("/", async (req, res) => {
  const hoja = HOJAS[String(req.query.hoja || "ebd")];
  if (!hoja) return res.status(400).json({ error: "Pestaña de testeo desconocida" });
  try {
    const [totales] = await pool.query(
      `SELECT clave, etiqueta, cantidad
       FROM testeo_totales
       WHERE hoja = ?
       ORDER BY orden`,
      [String(req.query.hoja || "ebd")]
    );
    const [rows] = await pool.query(
      `SELECT numero,
         DATE_FORMAT(fecha_comienzo, '%Y-%m-%d') AS fecha_comienzo, fecha_comienzo_texto,
         semanas,
         DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin, fecha_fin_texto,
         mac_wifi, mac_eth, wifi, eth, tipo, observaciones, entidad, ubicacion, estado
       FROM ${hoja.tabla}
       ORDER BY COALESCE(fecha_fin, fecha_comienzo) IS NULL,
                COALESCE(fecha_fin, fecha_comienzo) DESC,
                origen_fila DESC`
    );
    res.json({
      titulo: hoja.titulo,
      etiquetaTipo: hoja.etiquetaTipo,
      etiquetaLugar: hoja.etiquetaLugar,
      filas: rows,
      totales,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
