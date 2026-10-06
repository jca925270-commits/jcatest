const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const HOJAS = {
  ingreso_ebd: { tabla: "trazabilidad_ingreso_ebd", titulo: "Ingreso EBD Oficina", tipo: "ingreso" },
  egreso_ebd: { tabla: "trazabilidad_egreso_ebd", titulo: "Egreso EBD 2.0", tipo: "egreso" },
  ingreso_d3: { tabla: "trazabilidad_ingreso_d3", titulo: "Ingreso D3 Oficina", tipo: "ingreso" },
  egreso_d3: {
    tabla: "trazabilidad_egreso_d3",
    titulo: "Egreso D3 2.0 (venta/comodato desde Comercial)",
    tipo: "egreso",
  },
};

router.get("/", async (req, res) => {
  const hoja = HOJAS[String(req.query.hoja || "ingreso_ebd")];
  if (!hoja) return res.status(400).json({ error: "Pestaña de trazabilidad desconocida" });

  const campos = hoja.tipo === "ingreso"
    ? `DATE_FORMAT(fecha_llegada, '%Y-%m-%d') AS fecha_llegada, fecha_llegada_texto,
       DATE_FORMAT(fecha_carga, '%Y-%m-%d') AS fecha_carga, fecha_carga_texto,
       mac_wifi, mac_eth, lote, caja, numero_equipo`
    : `cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho, fecha_despacho_texto,
       mac_wifi, mac_eth, lote, caja, numero_equipo`;

  try {
    const [rows] = await pool.query(
      `SELECT ${campos} FROM ${hoja.tabla} ORDER BY ${hoja.tipo === "ingreso" ? "fecha_llegada" : "fecha_despacho"} IS NULL, ${hoja.tipo === "ingreso" ? "fecha_llegada" : "fecha_despacho"} DESC, origen_fila DESC`
    );
    res.json({ titulo: hoja.titulo, tipo: hoja.tipo, filas: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
