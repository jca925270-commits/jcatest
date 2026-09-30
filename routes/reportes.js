const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

async function stockPorTipoDeposito() {
  const [rows] = await pool.query(
    `SELECT t.nombre AS tipo_nombre, u.nombre AS deposito_nombre, COUNT(*) AS cantidad
     FROM dispositivos d
     JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
     LEFT JOIN depositos u ON u.id = d.deposito_actual_id
     WHERE d.estado = 'en_stock'
     GROUP BY t.nombre, u.nombre
     ORDER BY t.nombre, u.nombre`
  );
  return rows;
}

async function calcularAlertas() {
  const [rows] = await pool.query(
    `SELECT ac.id, ac.stock_minimo, t.nombre AS tipo_nombre, u.nombre AS deposito_nombre,
            COALESCE((
                SELECT COUNT(*) FROM dispositivos d
                WHERE d.tipo_equipo_id = ac.tipo_equipo_id
                  AND d.estado = 'en_stock'
                  AND (ac.deposito_id IS NULL OR d.deposito_actual_id = ac.deposito_id)
            ), 0) AS cantidad_actual
     FROM alertas_config ac
     JOIN tipos_equipo t ON t.id = ac.tipo_equipo_id
     LEFT JOIN depositos u ON u.id = ac.deposito_id`
  );
  return rows.filter((r) => r.cantidad_actual < r.stock_minimo);
}

router.get("/", async (req, res) => {
  const accion = req.query.accion;
  try {
    if (accion === "dashboard") {
      const [[{ c: enStock }]] = await pool.query(
        "SELECT COUNT(*) c FROM dispositivos WHERE estado = 'en_stock'"
      );
      const [[{ c: vendidos }]] = await pool.query(
        "SELECT COUNT(*) c FROM dispositivos WHERE estado IN ('vendido','comodato','garantia')"
      );
      return res.json({
        total_en_stock: enStock,
        total_vendidos: vendidos,
        stock_por_tipo_deposito: await stockPorTipoDeposito(),
        alertas: await calcularAlertas(),
      });
    }

    if (accion === "stock") {
      return res.json(await stockPorTipoDeposito());
    }

    if (accion === "movimientos_periodo") {
      const desde = req.query.desde || new Date().toISOString().slice(0, 8) + "01";
      const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);
      const [rows] = await pool.query(
        `SELECT tipo_movimiento, COUNT(*) AS cantidad
         FROM movimientos WHERE fecha BETWEEN ? AND ?
         GROUP BY tipo_movimiento ORDER BY cantidad DESC`,
        [desde, hasta + " 23:59:59"]
      );
      return res.json(rows);
    }

    if (accion === "alertas_config") {
      const [rows] = await pool.query(
        `SELECT ac.*, t.nombre AS tipo_nombre, u.nombre AS deposito_nombre
         FROM alertas_config ac
         JOIN tipos_equipo t ON t.id = ac.tipo_equipo_id
         LEFT JOIN depositos u ON u.id = ac.deposito_id
         ORDER BY t.nombre`
      );
      return res.json(rows);
    }

    if (accion === "categorias_stock") {
      const pais = req.query.pais;
      const [rows] = pais
        ? await pool.query("SELECT * FROM categorias_stock WHERE pais = ? ORDER BY nombre", [pais])
        : await pool.query("SELECT * FROM categorias_stock ORDER BY pais, nombre");
      return res.json(rows);
    }

    if (accion === "movimientos_cantidad") {
      const categoriaId = parseInt(req.query.categoria_id);
      if (!categoriaId) return res.status(400).json({ error: "Falta categoria_id" });
      const [rows] = await pool.query(
        `SELECT fecha, estado, remito, factura, razon_social, ticket, motivo, ingreso, egreso
         FROM movimientos_cantidad
         WHERE categoria_id = ?
         ORDER BY fecha IS NULL, fecha DESC, id DESC
         LIMIT 300`,
        [categoriaId]
      );
      return res.json(rows);
    }

    if (accion === "kanban") {
      const COLUMNAS = [
        { estado: "en_stock", etiqueta: "En stock" },
        { estado: "a_reparar", etiqueta: "A reparar" },
        { estado: "reparado", etiqueta: "Reparado" },
        { estado: "prueba", etiqueta: "Prueba" },
        { estado: "actualizacion", etiqueta: "Actualización" },
        { estado: "vendido", etiqueta: "Venta" },
        { estado: "comodato", etiqueta: "Comodato" },
        { estado: "garantia", etiqueta: "Garantía" },
        { estado: "devuelto", etiqueta: "Devolución" },
        { estado: "de_baja", etiqueta: "Baja" },
      ];
      const resultado = [];
      for (const col of COLUMNAS) {
        const [[{ c: total }]] = await pool.query(
          "SELECT COUNT(*) c FROM dispositivos WHERE estado = ?", [col.estado]
        );
        const [dispositivos] = await pool.query(
          `SELECT d.id, d.mac_wifi, d.mac_eth, t.nombre AS tipo_nombre,
                  dep.nombre AS deposito_nombre, c.razon_social AS cliente_nombre
           FROM dispositivos d
           JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
           LEFT JOIN depositos dep ON dep.id = d.deposito_actual_id
           LEFT JOIN clientes c ON c.id = d.cliente_actual_id
           WHERE d.estado = ?
           ORDER BY d.updated_at DESC
           LIMIT 30`,
          [col.estado]
        );
        resultado.push({ ...col, total, dispositivos });
      }
      return res.json(resultado);
    }

    res.status(404).json({ error: "Acción no encontrada" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const accion = req.query.accion;
  const b = req.body;

  if (accion === "alertas_config") {
    if (!b.tipo_equipo_id || !b.stock_minimo) {
      return res.status(400).json({ error: "tipo_equipo_id y stock_minimo son obligatorios" });
    }
    try {
      await pool.query(
        `INSERT INTO alertas_config (tipo_equipo_id, deposito_id, stock_minimo)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE stock_minimo = VALUES(stock_minimo)`,
        [b.tipo_equipo_id, b.deposito_id || null, parseInt(b.stock_minimo)]
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(404).json({ error: "Acción no encontrada" });
});

router.delete("/", requerirRol(["admin", "operador"]), async (req, res) => {
  if (req.query.accion === "alertas_config") {
    const id = parseInt(req.query.id);
    try {
      await pool.query("DELETE FROM alertas_config WHERE id = ?", [id]);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.status(404).json({ error: "Acción no encontrada" });
});

module.exports = router;
