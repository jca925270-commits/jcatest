const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const UBICACIONES = [
  "Campiña del Sur",
  "Casa Santi",
  "Oficina",
  "Showroom",
  "Contenedor",
  "Casas varias",
  "Paraguay",
];

function ubicacionDe(nombre, pais) {
  if (pais === "PARAGUAY") return "Paraguay";
  const n = String(nombre || "").toLowerCase();
  if (n.includes("campi")) return "Campiña del Sur";
  if (n.includes("casa santi")) return "Casa Santi";
  if (n.includes("contenedor")) return "Contenedor";
  if (n.includes("showroom")) return "Showroom";
  if (n.includes("casas varias")) return "Casas varias";
  return "Oficina";
}

function normalizarPedido(nombre) {
  const p = String(nombre || "").toLowerCase();
  if (p.includes("campi")) return "Campiña del Sur";
  if (p.includes("casa")) return "Casa Santi";
  if (p.includes("contenedor")) return "Contenedor";
  if (p.includes("showroom")) return "Showroom";
  if (p.includes("casa") && p.includes("varia")) return "Casas varias";
  if (p.includes("varia")) return "Casas varias";
  if (p.includes("paraguay")) return "Paraguay";
  if (p.includes("oficina")) return "Oficina";
  return nombre;
}

async function stockPorCategoria() {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.pais, c.cantidad_actual,
            COALESCE(SUM(m.ingreso), 0) AS ingresos,
            COALESCE(SUM(m.egreso), 0) AS egresos,
            MIN(m.fecha) AS desde,
            MAX(m.fecha) AS hasta
     FROM categorias_stock c
     LEFT JOIN movimientos_cantidad m ON m.categoria_id = c.id
     GROUP BY c.id
     ORDER BY c.pais, c.nombre`
  );
  return rows.map((r) => ({ ...r, ubicacion: ubicacionDe(r.nombre, r.pais) }));
}

router.get("/resumen", async (req, res) => {
  try {
    const filas = await stockPorCategoria();
    const resumen = UBICACIONES.map((nombre) => {
      const propias = filas.filter((f) => f.ubicacion === nombre);
      const cantidad = propias.reduce((s, f) => s + Number(f.cantidad_actual || 0), 0);
      return { nombre, cantidad, categorias: propias.length };
    });
    res.json(resumen);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const pedido = normalizarPedido(req.query.nombre);
    const filas = await stockPorCategoria();
    const propias = filas.filter((f) => f.ubicacion === pedido);
    res.json(propias.map((f) => ({
      nombre: f.nombre,
      tipo: f.nombre,
      cantidad: Number(f.cantidad_actual || 0),
      ingresos: Number(f.ingresos || 0),
      egresos: Number(f.egresos || 0),
      fecha_ingreso: f.desde,
      fecha_egreso: f.hasta,
      estado: null,
      mac_wifi: null,
      mac_ethernet: null,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
