const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

async function stockPorTipoDeposito() {
  const [rows] = await pool.query(
    `SELECT nombre AS tipo_nombre, pais AS deposito_nombre, cantidad_actual AS cantidad
     FROM categorias_stock
     ORDER BY pais, nombre`
  );
  return rows;
}

async function asegurarAlertasVenta() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS alertas_planilla (
       id INT AUTO_INCREMENT PRIMARY KEY,
       categoria_id INT NOT NULL,
       stock_minimo INT NOT NULL,
       UNIQUE KEY uq_alerta_planilla (categoria_id),
       CONSTRAINT fk_alerta_planilla_cat FOREIGN KEY (categoria_id) REFERENCES categorias_stock(id)
     ) ENGINE=InnoDB`
  );
  const reglas = [
    { nombre: "Oficina (EBD para Venta)", minimo: 20 },
    { nombre: "Oficina (D3 para Venta)", minimo: 8 },
  ];
  for (const regla of reglas) {
    const [cats] = await pool.query(
      "SELECT id FROM categorias_stock WHERE nombre = ? AND pais = 'ARGENTINA'",
      [regla.nombre]
    );
    for (const cat of cats) {
      await pool.query(
        "INSERT IGNORE INTO alertas_planilla (categoria_id, stock_minimo) VALUES (?, ?)",
        [cat.id, regla.minimo]
      );
    }
  }
  await pool.query(
    `DELETE a FROM alertas_planilla a
     JOIN categorias_stock c ON c.id = a.categoria_id
     WHERE c.nombre IN ('Oficina (EBD para Venta)', 'Oficina (D3 para Venta)')
       AND c.pais <> 'ARGENTINA'`
  );
}

async function listarAlertasPlanilla() {
  await asegurarAlertasVenta();
  const [rows] = await pool.query(
    `SELECT a.id, a.stock_minimo, c.nombre AS tipo_nombre,
            CASE
              WHEN c.pais = 'ARGENTINA' AND c.nombre LIKE 'Oficina%' THEN 'Oficina'
              ELSE c.pais
            END AS deposito_nombre,
            c.cantidad_actual
     FROM alertas_planilla a
     JOIN categorias_stock c ON c.id = a.categoria_id
     ORDER BY c.nombre, c.pais`
  );
  return rows;
}

function tipoDispositivo(nombre) {
  const n = String(nombre || "").toLowerCase();
  if (n.includes("16")) return null;
  if (n.includes("repar") || n.includes("prueba")) return null;
  if (n.includes("d3+")) return "d3plus";
  if (n.includes("d3")) return "d3";
  if (n.includes("ebd")) return "ebd";
  return null;
}

function lugarDispositivo(nombre, pais) {
  if (pais === "PARAGUAY") return "paraguay";
  const n = String(nombre || "").toLowerCase();
  if (n.includes("campi")) return "campina";
  if (n.includes("showroom")) return "showroom";
  if (n.includes("oficina")) return "oficina";
  return null;
}

function vacioLugar() {
  return { ebd: 0, d3: 0, d3plus: 0, total: 0 };
}

async function resumenPlanilla() {
  const [cats] = await pool.query(
    "SELECT nombre, pais, cantidad_actual FROM categorias_stock"
  );
  const lugares = {
    campina: vacioLugar(),
    showroom: vacioLugar(),
    paraguay: vacioLugar(),
    oficina: vacioLugar(),
  };
  for (const c of cats) {
    const tipo = tipoDispositivo(c.nombre);
    const lugar = lugarDispositivo(c.nombre, c.pais);
    if (!tipo || !lugar) continue;
    const cantidad = Number(c.cantidad_actual) || 0;
    lugares[lugar][tipo] += cantidad;
    lugares[lugar].total += cantidad;
  }
  const campina = lugares.campina.ebd;
  const oficina = lugares.oficina.ebd;

  const [estados] = await pool.query(
    `SELECT estado, COUNT(*) AS movimientos,
            COALESCE(SUM(ingreso), 0) AS ingresos,
            COALESCE(SUM(egreso), 0) AS egresos
     FROM movimientos_cantidad
     WHERE estado IN ('VENTA', 'VENTA COSTO 0', 'GARANTIA', 'DEVOLUCION')
     GROUP BY estado`
  );
  const porEstado = Object.fromEntries(estados.map((e) => [e.estado, e]));
  const sumar = (...claves) => claves.reduce((acc, clave) => {
    const fila = porEstado[clave] || {};
    acc.movimientos += Number(fila.movimientos) || 0;
    acc.ingresos += Number(fila.ingresos) || 0;
    acc.egresos += Number(fila.egresos) || 0;
    return acc;
  }, { movimientos: 0, ingresos: 0, egresos: 0 });

  const [ventasCat] = await pool.query(
    `SELECT c.nombre, COALESCE(SUM(m.egreso), 0) AS egresos
     FROM movimientos_cantidad m
     JOIN categorias_stock c ON c.id = m.categoria_id
     WHERE m.estado IN ('VENTA', 'VENTA COSTO 0')
     GROUP BY c.id`
  );
  const venta = sumar("VENTA", "VENTA COSTO 0");
  venta.ebd = 0;
  venta.d3 = 0;
  venta.d3plus = 0;
  for (const fila of ventasCat) {
    const n = String(fila.nombre || "").toLowerCase();
    const cantidad = Number(fila.egresos) || 0;
    if (n.includes("d3+")) venta.d3plus += cantidad;
    else if (n.includes("d3")) venta.d3 += cantidad;
    else if (n.includes("ebd")) venta.ebd += cantidad;
  }

  const [garantiasCat] = await pool.query(
    `SELECT c.nombre, COALESCE(SUM(m.egreso), 0) AS egresos
     FROM movimientos_cantidad m
     JOIN categorias_stock c ON c.id = m.categoria_id
     WHERE m.estado = 'GARANTIA'
     GROUP BY c.id`
  );
  const [devolucionesCat] = await pool.query(
    `SELECT c.nombre, m.razon_social, COALESCE(m.ingreso, 0) AS ingreso
     FROM movimientos_cantidad m
     JOIN categorias_stock c ON c.id = m.categoria_id
     WHERE m.estado = 'DEVOLUCION'`
  );
  const devolucion = sumar("DEVOLUCION");
  devolucion.ebd_venta = 0;
  devolucion.d3_venta = 0;
  devolucion.prueba = 0;
  devolucion.comodato = 0;
  for (const fila of devolucionesCat) {
    const texto = String(fila.razon_social || "").toLowerCase();
    const n = String(fila.nombre || "").toLowerCase();
    const cantidad = Number(fila.ingreso) || 0;
    if (texto.includes("comodat")) devolucion.comodato += cantidad;
    else if (texto.includes("prueba")) devolucion.prueba += cantidad;
    else if (n.includes("ebd") && n.includes("venta")) devolucion.ebd_venta += cantidad;
    else if (n.includes("d3") && !n.includes("d3+") && n.includes("venta")) devolucion.d3_venta += cantidad;
  }

  const garantia = sumar("GARANTIA");
  garantia.ebd_nuevo = 0;
  garantia.d3_venta = 0;
  garantia.ebd_reparado = 0;
  for (const fila of garantiasCat) {
    const n = String(fila.nombre || "").toLowerCase();
    const cantidad = Number(fila.egresos) || 0;
    if (n.includes("d3") && !n.includes("d3+") && n.includes("venta")) garantia.d3_venta += cantidad;
    else if (n.includes("ebd") && n.includes("repar")) garantia.ebd_reparado += cantidad;
    else if (n.includes("ebd") && n.includes("venta")) garantia.ebd_nuevo += cantidad;
  }

  let d3Prueba = 0;
  let ebdReparados = 0;
  for (const c of cats) {
    const n = c.nombre.toLowerCase();
    const cantidad = Number(c.cantidad_actual) || 0;
    if (n.includes("d3") && !n.includes("d3+") && n.includes("prueba")) d3Prueba += cantidad;
    if (n.includes("ebd") && n.includes("ya reparados")) ebdReparados += cantidad;
  }

  return {
    ebd_campina: campina,
    ebd_oficina: oficina,
    ebd_total: campina + oficina,
    lugares,
    venta,
    garantia,
    devolucion,
    d3_prueba: d3Prueba,
    ebd_reparados: ebdReparados,
  };
}

async function calcularAlertas() {
  const rows = await listarAlertasPlanilla();
  return rows.filter((r) => Number(r.cantidad_actual) <= Number(r.stock_minimo));
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
      const alertasOficina = await listarAlertasPlanilla();
      return res.json({
        total_en_stock: enStock,
        total_vendidos: vendidos,
        stock_por_tipo_deposito: await stockPorTipoDeposito(),
        alertas: alertasOficina.filter((r) => Number(r.cantidad_actual) <= Number(r.stock_minimo)),
        alertas_oficina: alertasOficina,
        planilla: await resumenPlanilla(),
      });
    }

    if (accion === "ultima_sync") {
      const [filas] = await pool.query(
        `SELECT DATE_FORMAT(ultima_sync, '%d/%m/%Y %H:%i:%s') AS ultima_sync
         FROM sync_control
         WHERE archivo = 'STOCK_2026'
         LIMIT 1`
      );
      return res.json({ ultima_sync: filas[0] ? filas[0].ultima_sync : null });
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
      return res.json(await listarAlertasPlanilla());
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
           LEFT JOIN depositos dep ON dep.id_deposito = d.deposito_actual_id
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
    if (!b.categoria_id || !b.stock_minimo) {
      return res.status(400).json({ error: "categoria_id y stock_minimo son obligatorios" });
    }
    try {
      await asegurarAlertasVenta();
      await pool.query(
        `INSERT INTO alertas_planilla (categoria_id, stock_minimo)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE stock_minimo = VALUES(stock_minimo)`,
        [b.categoria_id, parseInt(b.stock_minimo)]
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
      await pool.query("DELETE FROM alertas_planilla WHERE id = ?", [id]);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.status(404).json({ error: "Acción no encontrada" });
});

module.exports = router;
