const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");
const {
  armarConteo,
  guardarItemBorrador,
  resetBorrador,
  guardarCorreos,
  enviarConteo,
} = require("../lib/conteo");
const { calcularPantallas } = require("../lib/pantallas-resumen");
const { generarInformeCierre } = require("../lib/informe-cierre");

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
  if (n.includes("repar") || n.includes("prueba") || n.includes("interno")) return null;
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

let pantallasTablaLista = null;
let pantallasFirmaGuardada = "";
let estadosPantallaListos = null;

function asegurarEstadosPantalla() {
  if (!estadosPantallaListos) {
    estadosPantallaListos = (async () => {
      for (const columna of ["estado_wifi", "estado_pantalla", "estado_audio", "estado_auto"]) {
        const [existe] = await pool.query(
          `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trazabilidad_ingreso_pantalla' AND COLUMN_NAME = ?`,
          [columna]
        );
        if (!Number(existe[0].n)) {
          await pool.query(`ALTER TABLE trazabilidad_ingreso_pantalla ADD COLUMN ${columna} VARCHAR(40) NULL`);
        }
      }
    })().catch((error) => {
      estadosPantallaListos = null;
      throw error;
    });
  }
  return estadosPantallaListos;
}

function asegurarPantallasResumen() {
  if (!pantallasTablaLista) {
    pantallasTablaLista = pool.query(
      `CREATE TABLE IF NOT EXISTS pantallas_colectivo_resumen (
         clave VARCHAR(40) NOT NULL PRIMARY KEY,
         etiqueta VARCHAR(80) NOT NULL,
         cantidad INT NULL,
         actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).then(() => pool.query(
      "ALTER TABLE pantallas_colectivo_resumen MODIFY cantidad INT NULL"
    )).catch((error) => {
      pantallasTablaLista = null;
      throw error;
    });
  }
  return pantallasTablaLista;
}

async function guardarPantallasResumen(filas) {
  const firma = filas.map((fila) => `${fila.clave}:${fila.cantidad}`).join("|");
  if (firma === pantallasFirmaGuardada) return;
  await asegurarPantallasResumen();
  for (const fila of filas) {
    await pool.query(
      `INSERT INTO pantallas_colectivo_resumen (clave, etiqueta, cantidad)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE etiqueta = VALUES(etiqueta), cantidad = VALUES(cantidad)`,
      [fila.clave, fila.etiqueta, fila.cantidad]
    );
  }
  await pool.query(
    `DELETE FROM pantallas_colectivo_resumen WHERE clave NOT IN (${filas.map(() => "?").join(",")})`,
    filas.map((fila) => fila.clave)
  );
  pantallasFirmaGuardada = firma;
}

async function resumenPlanilla() {
  const [cats] = await pool.query(
    "SELECT id, nombre, pais, cantidad_actual FROM categorias_stock"
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
  let ventaOficina = 0;
  for (const c of cats) {
    const n = String(c.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (String(c.pais || "").toUpperCase() === "PARAGUAY") continue;
    if (!n.includes("oficina") || !n.includes("ebd") || !n.includes("venta")) continue;
    if (n.includes("16") || n.includes("interno")) continue;
    ventaOficina += Number(c.cantidad_actual) || 0;
  }
  lugares.oficina.total -= lugares.oficina.ebd - ventaOficina;
  lugares.oficina.ebd = ventaOficina;
  const campina = lugares.campina.ebd;
  const oficina = ventaOficina;
  const internos = [];
  for (const c of cats) {
    const n = String(c.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!n.includes("ebd") || !n.includes("interno")) continue;
    const nombre = String(c.nombre || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    internos.push({ nombre: nombre || c.nombre, cantidad: Number(c.cantidad_actual) || 0 });
  }
  internos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const ebdInterno = {
    total: internos.reduce((suma, fila) => suma + fila.cantidad, 0),
    lugares: internos,
  };

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
    if (n.includes("interno")) continue;
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
  const idsReparados = [];
  for (const c of cats) {
    const n = c.nombre.toLowerCase();
    const cantidad = Number(c.cantidad_actual) || 0;
    if (n.includes("d3") && !n.includes("d3+") && n.includes("prueba")) d3Prueba += cantidad;
    if (n.includes("ebd") && n.includes("ya reparados")) {
      ebdReparados += cantidad;
      idsReparados.push(c.id);
    }
  }

  let vendidosReparados = 0;
  if (idsReparados.length) {
    const [ventasReparados] = await pool.query(
      `SELECT COALESCE(SUM(egreso), 0) AS vendidos
       FROM movimientos_cantidad
       WHERE categoria_id IN (${idsReparados.map(() => "?").join(",")})
         AND estado IN ('VENTA', 'VENTA COSTO 0')`,
      idsReparados
    );
    vendidosReparados = Number(ventasReparados[0].vendidos) || 0;
  }

  const [estadosTesteo] = await pool.query(
    "SELECT estado, COUNT(*) AS cantidad FROM testeo_ebd_reparados GROUP BY estado"
  );
  const testeo = { falla: 0, prueba: 0, funcionamiento: 0, deposito: 0 };
  for (const fila of estadosTesteo) {
    const grupo = grupoTesteo(fila.estado);
    if (grupo) testeo[grupo] += Number(fila.cantidad) || 0;
  }
  const identificados = testeo.falla + testeo.prueba + testeo.funcionamiento + testeo.deposito;

  const pantallas = await calcularPantallas(cats);
  await guardarPantallasResumen([
    { clave: "total_oficina", etiqueta: "En oficina", cantidad: pantallas.total },
    { clave: "comprobadas_ok", etiqueta: "Comprobadas OK", cantidad: pantallas.comprobadas_ok },
    { clave: "con_falla", etiqueta: "Con falla/para repuestos", cantidad: pantallas.con_falla },
    { clave: "vendidas", etiqueta: "Vendidas", cantidad: pantallas.vendidas },
    { clave: "sin_comprobar", etiqueta: "Sin comprobar", cantidad: pantallas.sin_comprobar },
  ]);

  return {
    ebd_campina: campina,
    ebd_oficina: oficina,
    ebd_total: campina + oficina,
    ebd_interno: ebdInterno,
    lugares,
    venta,
    garantia,
    devolucion,
    d3_prueba: d3Prueba,
    ebd_reparados: ebdReparados,
    reparados: {
      stock: ebdReparados,
      vendidos: vendidosReparados,
      deposito: testeo.deposito,
      funcionamiento: testeo.funcionamiento,
      prueba: testeo.prueba,
      falla: testeo.falla,
      sin_testear: Math.max(0, ebdReparados - identificados),
    },
    pantallas,
  };
}

function grupoTesteo(estado) {
  const n = String(estado || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (n === "falla" || n.startsWith("falla")) return "falla";
  if (n.includes("prueba")) return "prueba";
  if (n.includes("funcion")) return "funcionamiento";
  if (n === "finalizado" || n.includes("deposito")) return "deposito";
  return "";
}

async function calcularAlertas() {
  const rows = await listarAlertasPlanilla();
  return rows.filter((r) => Number(r.cantidad_actual) <= Number(r.stock_minimo));
}

router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const accion = req.query.accion;
  try {
    if (accion === "conteo") {
      return res.json(await armarConteo());
    }

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

    if (accion === "informe_pdf") {
      const informe = await generarInformeCierre();
      res.set("Cache-Control", "no-store");
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${informe.nombre}"`);
      return res.send(informe.pdf);
    }

    if (accion === "ultima_sync") {
      const [filas] = await pool.query(
        `SELECT DATE_FORMAT(CONVERT_TZ(ultima_sync, '+00:00', '-03:00'), '%d/%m/%Y %H:%i:%s') AS ultima_sync
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

  if (accion === "conteo_correos" || accion === "conteo_borrador" || accion === "conteo_enviar") {
    try {
      if (accion === "conteo_correos") {
        await guardarCorreos(b.aviso, b.correos);
        return res.json(await armarConteo());
      }
      if (accion === "conteo_borrador") {
        if (b.reset) await resetBorrador();
        else await guardarItemBorrador(b.clave, b.cantidad, b.finalizado);
        return res.json(await armarConteo());
      }
      const resultado = await enviarConteo({
        destino: b.destino,
        cantidades: b.cantidades,
        aviso: b.aviso,
        correos: b.correos,
      });
      return res.json({ ok: true, enviados: resultado.enviados });
    } catch (e) {
      const status = e.status || 500;
      const fallback = accion === "conteo_enviar"
        ? "No se pudo enviar el correo."
        : "No se pudo guardar el conteo.";
      return res.status(status).json({
        error: status === 500 ? fallback : e.message,
      });
    }
  }

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
