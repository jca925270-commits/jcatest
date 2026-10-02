const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

// Claves del menú Estado → columna ESTADO de STOCK 2026.
// Reparado no tiene un estado propio en la planilla: son las categorías
// "ya reparados".
const POR_ESTADO = {
  vendido: ["VENTA", "VENTA COSTO 0"],
  garantia: ["GARANTIA"],
  a_reparar: ["A REPARAR"],
  devuelto: ["DEVOLUCION"],
  prueba: ["PRUEBA", "PERIODO DE PRUEBA", "PRUEBAS"],
  de_baja: ["BAJA"],
  actualizacion: ["ACTUALIZACION"],
  soporte_tecnico: ["SOPORTE", "SOPORTE TECNICO"],
};

router.get("/", async (req, res) => {
  try {
    const clave = String(req.query.estado || "vendido");
    let where = "1 = 0";
    const params = [];

    if (clave === "reparado") {
      where = "c.nombre LIKE ?";
      params.push("%ya reparados%");
    } else if (clave === "actualizacion") {
      const [planilla] = await pool.query(
        `SELECT m.fecha, m.estado, c.nombre AS categoria, c.pais,
                m.remito, m.factura, m.razon_social, m.ticket, m.motivo,
                m.ingreso, m.egreso, NULL AS mac_wifi
         FROM movimientos_cantidad m
         JOIN categorias_stock c ON c.id = m.categoria_id
         WHERE m.estado IN ('ACTUALIZACION', 'ACTUALIZACIÓN')
         ORDER BY m.fecha IS NULL, m.fecha DESC, m.id DESC`
      );
      const [equipos] = await pool.query(
        `SELECT m.fecha, 'ACTUALIZACION' AS estado, NULL AS categoria, NULL AS pais,
                m.remito, m.factura, c.razon_social, m.ticket, m.motivo,
                NULL AS ingreso, NULL AS egreso, d.mac_wifi
         FROM movimientos m
         LEFT JOIN dispositivos d ON d.id = m.dispositivo_id
         LEFT JOIN clientes c ON c.id = m.cliente_id
         WHERE m.tipo_movimiento = 'actualizacion'
            OR m.motivo LIKE '%actualiz%'
            OR d.estado = 'actualizacion'
         ORDER BY m.fecha DESC, m.id DESC`
      );
      return res.json([...planilla, ...equipos]);
    } else if (POR_ESTADO[clave]) {
      where = `m.estado IN (${POR_ESTADO[clave].map(() => "?").join(",")})`;
      params.push(...POR_ESTADO[clave]);
    }

    const [rows] = await pool.query(
      `SELECT m.fecha, m.estado, c.nombre AS categoria, c.pais,
              m.remito, m.factura, m.razon_social, m.ticket, m.motivo,
              m.ingreso, m.egreso, NULL AS mac_wifi
       FROM movimientos_cantidad m
       JOIN categorias_stock c ON c.id = m.categoria_id
       WHERE ${where}
       ORDER BY m.fecha IS NULL, m.fecha DESC, m.id DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
