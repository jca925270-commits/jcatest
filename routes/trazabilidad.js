const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");
const { asegurarColumnaLite, asegurarTablasExtra, partirLite, textoLite, razonPlanilla } = require("../lib/con-2-0");
const { actualizarMacEnFila, liberarMacEnFila, escribirMac, cajaLimpia, numeroEquipo, cajaPlanilla } = require("../lib/planilla-google");

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
  ingreso_ebd_reparado: {
    tabla: "trazabilidad_ingreso_ebd_reparado",
    titulo: "Ingreso EBD REPARADO (Testeados)",
    tipo: "ingreso",
    cajaEtiqueta: "Reparado n°",
  },
  egreso_ebd_reparado: {
    tabla: "trazabilidad_egreso_ebd_reparado",
    titulo: "Egreso EBD REPARADO (Venta/Migracion/Garantia)",
    tipo: "egreso",
    cajaEtiqueta: "Reparado n°",
  },
  ingreso_pantalla: {
    tabla: "trazabilidad_ingreso_pantalla",
    titulo: "Ingreso Pantallas Colectivo (24 Pulgadas) Oficina",
    tipo: "ingreso",
  },
  egreso_pantalla: {
    tabla: "trazabilidad_egreso_pantalla",
    titulo: "Egreso Pantallas Colectivo (24 Pulgadas) Oficina",
    tipo: "egreso",
  },
  ingreso_ebd_interno: {
    tabla: "trazabilidad_ingreso_ebd_interno",
    titulo: "Ingreso EBD uso INTERNO",
    tipo: "ingreso",
    conCliente: true,
    sinLlegada: true,
  },
  egreso_ebd_interno: {
    tabla: "trazabilidad_egreso_ebd_interno",
    titulo: "Egreso EBD uso INTERNO",
    tipo: "egreso",
  },
  devolucion_ebd: { tabla: "trazabilidad_devolucion_ebd", titulo: "Devolución EBD", tipo: "egreso" },
  devolucion_d3: { tabla: "trazabilidad_devolucion_d3", titulo: "Devolución D3", tipo: "egreso" },
};

router.get("/", async (req, res) => {
  const hoja = HOJAS[String(req.query.hoja || "ingreso_ebd")];
  if (!hoja) return res.status(400).json({ error: "Pestaña de trazabilidad desconocida" });

  const campos = hoja.tipo === "ingreso"
    ? `id, origen_fila, ${hoja.conCliente ? "cliente," : ""} DATE_FORMAT(fecha_llegada, '%Y-%m-%d') AS fecha_llegada, fecha_llegada_texto,
       DATE_FORMAT(fecha_carga, '%Y-%m-%d') AS fecha_carga, fecha_carga_texto,
       mac_wifi, mac_eth, lote, caja, numero_equipo${req.query.hoja === "ingreso_pantalla" ? ", estado_wifi, estado_pantalla, estado_audio, estado_auto" : ""}`
    : `id, origen_fila, cliente, con_2_0, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho, fecha_despacho_texto,
       mac_wifi, mac_eth, lote, caja, numero_equipo`;
  const orden = hoja.sinLlegada ? "fecha_carga" : hoja.tipo === "ingreso" ? "fecha_llegada" : "fecha_despacho";

  try {
    await asegurarTablasExtra();
    if (req.query.hoja === "ingreso_pantalla") await asegurarEstadosPantalla();
    if (hoja.tipo !== "ingreso") await asegurarColumnaLite();
    const [rows] = await pool.query(
      `SELECT ${campos} FROM ${hoja.tabla} ORDER BY ${orden} IS NULL, ${orden} DESC, origen_fila DESC`
    );
    res.json({
      titulo: hoja.titulo,
      tipo: hoja.tipo,
      cajaEtiqueta: hoja.cajaEtiqueta || "Caja",
      conCliente: Boolean(hoja.conCliente),
      sinLlegada: Boolean(hoja.sinLlegada),
      filas: rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function texto(valor, largo) {
  const limpio = String(valor || "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, largo) : null;
}

function fechaIso(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || "")) ? valor : null;
}

function mac12(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return limpio.length >= 12 ? limpio.slice(0, 12) : "";
}

function resultadoPantalla(valor) {
  const limpio = String(valor || "").trim().toLowerCase();
  if (limpio === "ok") return "OK";
  if (limpio === "falla" || limpio === "con falla") return "Falla";
  if (limpio === "para repuestos") return "Para repuestos";
  return "";
}

function autoPantalla(valor) {
  const limpio = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (limpio === "si") return "Sí";
  if (limpio === "no") return "No";
  return "";
}

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

function familiaDeHoja(clave) {
  if (clave.includes("pantalla")) return "PANTALLA";
  if (clave.includes("interno")) return "EBD_INT";
  if (clave.includes("reparado")) return "EBD_REP";
  return clave.includes("d3") ? "D3" : "EBD";
}

function operacionDeHoja(hoja) {
  if (hoja.titulo.startsWith("Devolución")) return "devolucion";
  return hoja.tipo === "ingreso" ? "ingreso" : "egreso";
}

async function asegurarPantallasConFalla() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS pantallas_con_falla (
       id INT AUTO_INCREMENT PRIMARY KEY,
       cantidad INT NOT NULL,
       detalle VARCHAR(255) NULL,
       creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

router.get("/pantalla-con-falla", async (req, res) => {
  try {
    await asegurarPantallasConFalla();
    const [filas] = await pool.query(
      `SELECT id, cantidad, detalle, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS creado
       FROM pantallas_con_falla
       ORDER BY id DESC`
    );
    const total = filas.reduce((suma, fila) => suma + (Number(fila.cantidad) || 0), 0);
    res.json({ total: filas.length ? total : null, filas });
  } catch (e) {
    res.status(500).json({ error: "No se pudo leer con falla/para repuestos." });
  }
});

router.post("/pantalla-con-falla", requerirRol(["admin", "operador"]), async (req, res) => {
  const cantidad = parseInt(req.body.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) {
    return res.status(400).json({ error: "La cantidad tiene que ser un número entre 1 y 999." });
  }
  try {
    await asegurarPantallasConFalla();
    await pool.query(
      "INSERT INTO pantallas_con_falla (cantidad, detalle) VALUES (?, ?)",
      [cantidad, texto(req.body.detalle, 255)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo agregar con falla/para repuestos." });
  }
});

router.delete("/pantalla-con-falla/:id", requerirRol(["admin", "operador"]), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Registro desconocido." });
  try {
    await asegurarPantallasConFalla();
    const [resultado] = await pool.query("DELETE FROM pantallas_con_falla WHERE id = ?", [id]);
    if (!resultado.affectedRows) return res.status(404).json({ error: "No se encontró el registro." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo quitar el registro." });
  }
});

router.post("/registrar-pantalla", requerirRol(["admin", "operador"]), async (req, res) => {
  const wifi = mac12(req.body.mac_wifi);
  const eth = mac12(req.body.mac_eth);
  const llegada = fechaIso(req.body.fecha_llegada);
  const carga = fechaIso(req.body.fecha_carga);
  const estadoPantallaValor = resultadoPantalla(req.body.estado_pantalla);
  const estadoAuto = autoPantalla(req.body.estado_auto);
  const numero = numeroEquipo(req.body.numero_equipo, "") || null;
  if (!wifi || !eth) return res.status(400).json({ error: "Faltan la MAC WIFI y la MAC ETH, de 12 caracteres." });
  if (wifi === eth) return res.status(400).json({ error: "La MAC WIFI y la MAC ETH tienen que ser distintas." });
  if (!llegada || !carga) return res.status(400).json({ error: "Faltan la fecha de llegada y la fecha de carga." });
  if (!numero) return res.status(400).json({ error: "Falta el número de pantalla." });
  if (!estadoPantallaValor) return res.status(400).json({ error: "Pantalla tiene que ser OK, falla o para repuestos." });
  if (!estadoAuto) return res.status(400).json({ error: "Auto tiene que ser sí o no." });
  const lote = texto(req.body.lote, 80);
  const caja = cajaLimpia(req.body.caja).slice(0, 40) || null;
  try {
    await asegurarEstadosPantalla();
    const claves = [wifi, eth];
    const [ya] = await pool.query(
      `SELECT id FROM trazabilidad_ingreso_pantalla
       WHERE mac_wifi IN (?, ?) OR mac_eth IN (?, ?) LIMIT 1`,
      [...claves, ...claves]
    );
    if (ya.length) return res.status(409).json({ error: "Esa MAC ya está en Ingreso Pantallas Colectivo (24 Pulgadas) Oficina." });
    const escrita = await escribirMac({
      familia: "PANTALLA",
      operacion: "ingreso",
      fechaLlegada: llegada,
      fechaCarga: carga,
      wifi,
      eth,
      lote,
      caja,
      numeroPantalla: numero,
      estadoPantalla: estadoPantallaValor,
      estadoAuto,
    });
    let fila = escrita && escrita.ok ? escrita.fila : 0;
    if (!fila) {
      const [[reservada]] = await pool.query(
        `SELECT COALESCE(MIN(CASE WHEN origen_fila < 0 THEN origen_fila END), 0) - 1 AS fila
         FROM trazabilidad_ingreso_pantalla`
      );
      fila = reservada.fila;
    }
    await pool.query(
      `INSERT INTO trazabilidad_ingreso_pantalla
         (fecha_llegada, fecha_carga, mac_wifi, mac_eth, lote, caja, numero_equipo, origen_fila,
          estado_pantalla, estado_auto)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [llegada, carga, wifi, eth, lote, caja, numero, fila, estadoPantallaValor, estadoAuto]
    );
    res.json({
      ok: true,
      aviso: escrita && escrita.ok
        ? "Quedó en Ingreso Pantallas Colectivo (24 Pulgadas) Oficina y en MySQL."
        : "Quedó en MySQL. Google todavía no deja editar la planilla.",
    });
  } catch (e) {
    res.status(500).json({ error: "No se pudo registrar la pantalla." });
  }
});

router.put("/:hoja/:id", requerirRol(["admin"]), async (req, res) => {
  const hoja = HOJAS[String(req.params.hoja || "")];
  const id = parseInt(req.params.id, 10);
  if (!hoja || !id) return res.status(400).json({ error: "Equipo desconocido." });
  try {
    if (hoja.tipo !== "ingreso") await asegurarColumnaLite();
    const [filas] = await pool.query(`SELECT id, origen_fila FROM ${hoja.tabla} WHERE id = ?`, [id]);
    if (!filas[0]) return res.status(404).json({ error: "No se encontró el equipo." });
    const familia = familiaDeHoja(req.params.hoja);
    const operacion = operacionDeHoja(hoja);
    const numero = numeroEquipo(req.body.numero_equipo, req.body.caja) || null;
    const caja = cajaLimpia(req.body.caja).slice(0, 40) || null;
    const cajaHoja = cajaPlanilla(caja, numero);
    let estados = null;
    if (req.params.hoja === "ingreso_pantalla") {
      await asegurarEstadosPantalla();
      const estadoPantallaValor = resultadoPantalla(req.body.estado_pantalla);
      const estadoAuto = autoPantalla(req.body.estado_auto);
      if ((req.body.estado_pantalla && !estadoPantallaValor) || (req.body.estado_auto && !estadoAuto)) {
        return res.status(400).json({ error: "Pantalla tiene que ser OK, falla o para repuestos, y auto sí o no." });
      }
      estados = { estadoPantalla: estadoPantallaValor, estadoAuto, numeroPantalla: numero || "" };
    }
    if (hoja.tipo === "ingreso") {
      const datos = {
        cliente: hoja.conCliente ? texto(req.body.cliente, 255) : undefined,
        llegada: fechaIso(req.body.fecha_llegada),
        carga: fechaIso(req.body.fecha_carga),
        lote: texto(req.body.lote, 80),
        caja,
        numero,
      };
      if (filas[0].origen_fila > 0) {
        const escrita = await actualizarMacEnFila({
          familia, operacion, fila: filas[0].origen_fila,
          cliente: datos.cliente,
          fechaLlegada: datos.llegada, fechaCarga: datos.carga, lote: datos.lote, caja: req.params.hoja === "ingreso_pantalla" ? caja : cajaHoja,
          ...(estados || {}),
        });
        if (!escrita || !escrita.ok) {
          return res.status(502).json({ error: "Google no dejó editar la planilla. No se cambió el equipo." });
        }
      }
      if (hoja.conCliente) {
        await pool.query(
          `UPDATE ${hoja.tabla}
           SET cliente = ?, fecha_llegada = ?, fecha_carga = ?, lote = ?, caja = ?, numero_equipo = ?
           WHERE id = ?`,
          [datos.cliente, datos.llegada, datos.carga, datos.lote, datos.caja, datos.numero, id]
        );
      } else {
        await pool.query(
          `UPDATE ${hoja.tabla}
           SET fecha_llegada = ?, fecha_carga = ?, lote = ?, caja = ?, numero_equipo = ?
           WHERE id = ?`,
          [datos.llegada, datos.carga, datos.lote, datos.caja, datos.numero, id]
        );
      }
      if (estados) {
        await pool.query(
          `UPDATE trazabilidad_ingreso_pantalla
           SET estado_pantalla = ?, estado_auto = ?
           WHERE id = ?`,
          [estados.estadoPantalla || null, estados.estadoAuto || null, id]
        );
      }
    } else {
      const partida = partirLite(texto(req.body.cliente, 255));
      const marca = req.body.con_2_0 ? textoLite(familia) : partida.marca;
      const datos = {
        cliente: partida.limpio,
        fecha: fechaIso(req.body.fecha_despacho),
        lote: texto(req.body.lote, 80),
        caja,
        numero,
        marca,
      };
      if (filas[0].origen_fila > 0) {
        const escrita = await actualizarMacEnFila({
          familia, operacion, fila: filas[0].origen_fila,
          cliente: razonPlanilla(datos.cliente, datos.marca),
          fechaDespacho: datos.fecha, lote: datos.lote, caja: cajaHoja,
        });
        if (!escrita || !escrita.ok) {
          return res.status(502).json({ error: "Google no dejó editar la planilla. No se cambió el equipo." });
        }
      }
      await pool.query(
        `UPDATE ${hoja.tabla}
         SET cliente = ?, fecha_despacho = ?, lote = ?, caja = ?, numero_equipo = ?, con_2_0 = ?
         WHERE id = ?`,
        [datos.cliente, datos.fecha, datos.lote, datos.caja, datos.numero, datos.marca, id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo editar el equipo." });
  }
});

router.delete("/:hoja/:id", requerirRol(["admin"]), async (req, res) => {
  const hoja = HOJAS[String(req.params.hoja || "")];
  const id = parseInt(req.params.id, 10);
  if (!hoja || !id) return res.status(400).json({ error: "Equipo desconocido." });
  try {
    const [filas] = await pool.query(`SELECT id, origen_fila FROM ${hoja.tabla} WHERE id = ?`, [id]);
    if (!filas[0]) return res.status(404).json({ error: "No se encontró el equipo." });
    const familia = familiaDeHoja(req.params.hoja);
    const operacion = operacionDeHoja(hoja);
    if (filas[0].origen_fila > 0) {
      const escrita = await liberarMacEnFila({ familia, operacion, fila: filas[0].origen_fila });
      if (!escrita || !escrita.ok) {
        return res.status(502).json({ error: "Google no dejó modificar la planilla. El equipo sigue igual." });
      }
    }
    if (operacion === "egreso") {
      await asegurarColumnaLite();
      await pool.query(
        `UPDATE ${hoja.tabla} SET cliente = 'EN DEPOSITO', fecha_despacho = NULL, con_2_0 = NULL WHERE id = ?`,
        [id]
      );
    } else {
      await pool.query(`DELETE FROM ${hoja.tabla} WHERE id = ?`, [id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo eliminar el equipo." });
  }
});

module.exports = router;
