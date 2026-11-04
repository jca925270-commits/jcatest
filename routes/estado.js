const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");
const { asegurarColumnaLite, asegurarMovimientoMac, partirLite, razonPlanilla, familiaDe, textoLite } = require("../lib/con-2-0");
const { actualizarMovimiento, vaciarMovimiento, actualizarMacEnFila, liberarMacEnFila } = require("../lib/planilla-google");

const router = express.Router();
router.use(requerirLogin);

// Claves del menú Estado → columna ESTADO de STOCK 2026.
// Reparado no tiene un estado propio en la planilla: son las categorías
// "ya reparados".
const POR_ESTADO = {
  vendido: ["VENTA", "VENTA COSTO 0"],
  garantia: ["GARANTIA"],
  comodato: ["COMODATO"],
  a_reparar: ["A REPARAR"],
  devuelto: ["DEVOLUCION"],
  prueba: ["PRUEBA", "PERIODO DE PRUEBA", "PRUEBAS"],
  movimiento: ["MOVIMIENTO", "MOVMIENTO"],
  de_baja: ["BAJA"],
  actualizacion: ["ACTUALIZACION"],
  soporte_tecnico: ["SOPORTE", "SOPORTE TECNICO"],
};

function paisPedido(valor) {
  return String(valor || "ARGENTINA").trim().toUpperCase() === "PARAGUAY" ? "PARAGUAY" : "ARGENTINA";
}

router.get("/", async (req, res) => {
  try {
    const clave = String(req.query.estado || "vendido");
    const pais = paisPedido(req.query.pais);
    let where = "1 = 0";
    const params = [];

    if (clave === "reparado") {
      where = "c.nombre LIKE ? AND c.pais = ?";
      params.push("%ya reparados%", pais);
    } else if (clave === "actualizacion") {
      where = "m.estado IN ('ACTUALIZACION', 'ACTUALIZACIÓN') AND c.pais = ?";
      params.push(pais);
    } else if (POR_ESTADO[clave]) {
      where = `m.estado IN (${POR_ESTADO[clave].map(() => "?").join(",")}) AND c.pais = ?`;
      params.push(...POR_ESTADO[clave], pais);
    }

    await asegurarColumnaLite();
    const [rows] = await pool.query(
      `SELECT m.id, m.origen_hoja, m.origen_fila, m.categoria_id,
              DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.estado, c.nombre AS categoria, c.pais,
              m.remito, m.factura, m.razon_social, m.con_2_0, m.ticket, m.motivo,
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

function texto(valor, largo) {
  const limpio = String(valor || "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, largo) : null;
}

function cantidad(valor) {
  if (valor === "" || valor == null) return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 100000) return undefined;
  return numero;
}

async function movimientoPorId(id) {
  const [filas] = await pool.query(
    `SELECT m.id, m.origen_hoja, m.origen_fila, m.categoria_id, c.nombre AS categoria, c.pais,
            DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.estado, m.remito, m.factura,
            m.razon_social, m.con_2_0, m.ticket, m.motivo, m.ingreso, m.egreso
     FROM movimientos_cantidad m
     JOIN categorias_stock c ON c.id = m.categoria_id
     WHERE m.id = ?`,
    [id]
  );
  return filas[0] || null;
}

function enPlanilla(fila) {
  return fila.origen_fila > 0 && (fila.origen_hoja === "ARGENTINA" || fila.origen_hoja === "PARAGUAY");
}

const EQUIPO = {
  EBD: {
    egreso: { tabla: "trazabilidad_egreso_ebd", operacion: "egreso" },
    ingreso: { tabla: "trazabilidad_ingreso_ebd", operacion: "ingreso" },
  },
  EBD_REP: {
    egreso: { tabla: "trazabilidad_egreso_ebd_reparado", operacion: "egreso" },
    ingreso: { tabla: "trazabilidad_ingreso_ebd_reparado", operacion: "ingreso" },
  },
  PANTALLA: {
    egreso: { tabla: "trazabilidad_egreso_pantalla", operacion: "egreso" },
    ingreso: { tabla: "trazabilidad_ingreso_pantalla", operacion: "ingreso" },
  },
  EBD_INT: {
    egreso: { tabla: "trazabilidad_egreso_ebd_interno", operacion: "egreso" },
    ingreso: { tabla: "trazabilidad_ingreso_ebd_interno", operacion: "ingreso" },
  },
  D3: {
    egreso: { tabla: "trazabilidad_egreso_d3", operacion: "egreso" },
    ingreso: { tabla: "trazabilidad_ingreso_d3", operacion: "ingreso" },
  },
};

function familiaEquipos(nombre) {
  const texto = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\bPANTALLA/.test(texto)) return "PANTALLA";
  if (/INTERNO/.test(texto) && /\bEBD\b/.test(texto)) return "EBD_INT";
  if (/REPARAD/.test(texto) && /\bEBD\b/.test(texto)) return "EBD_REP";
  return familiaDe(nombre);
}

function mismoCliente(guardado, razon) {
  return partirLite(guardado).limpio.toUpperCase() === partirLite(razon).limpio.toUpperCase();
}

async function leerEquipos(tabla, operacion, where, params) {
  if (operacion === "ingreso") {
    const [filas] = await pool.query(
      `SELECT id, origen_fila, lote, caja, mac_wifi, mac_eth,
              DATE_FORMAT(fecha_llegada, '%Y-%m-%d') AS fecha_llegada,
              DATE_FORMAT(fecha_carga, '%Y-%m-%d') AS fecha_carga,
              RIGHT(mac_wifi, 4) AS sufijo
       FROM ${tabla} WHERE ${where} ORDER BY id`,
      params
    );
    return filas;
  }
  const [filas] = await pool.query(
    `SELECT id, origen_fila, cliente, con_2_0, mac_wifi,
            DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho,
            RIGHT(mac_wifi, 4) AS sufijo
     FROM ${tabla} WHERE ${where} ORDER BY id`,
    params
  );
  return filas;
}

async function completarEquipos(filas, tabla, operacion, movimiento, tope) {
  if (filas.length >= tope || !movimiento.fecha || tope < 1) return filas;
  const where = operacion === "ingreso"
    ? "movimiento_id IS NULL AND fecha_llegada = ?"
    : "movimiento_id IS NULL AND fecha_despacho = ?";
  const hallados = await leerEquipos(tabla, operacion, where, [movimiento.fecha]);
  const libres = hallados.filter((fila) => !filas.some((actual) => actual.id === fila.id));
  const compatibles = operacion === "egreso"
    ? libres.filter((fila) => mismoCliente(fila.cliente, movimiento.razon_social))
    : libres;
  return filas.concat(compatibles.slice(-(tope - filas.length)));
}

async function equiposDelMovimiento(movimiento, cantidades) {
  const familia = familiaEquipos(movimiento.categoria);
  const vacio = { familia, egreso: [], ingreso: [] };
  if (!familia || !EQUIPO[familia]) return vacio;
  const topeEgreso = Math.max(Number(movimiento.egreso || 0), Number(cantidades && cantidades.egreso || 0));
  const topeIngreso = Math.max(Number(movimiento.ingreso || 0), Number(cantidades && cantidades.ingreso || 0));
  const egresoInfo = EQUIPO[familia].egreso;
  const ingresoInfo = EQUIPO[familia].ingreso;
  const egreso = await completarEquipos(
    await leerEquipos(egresoInfo.tabla, "egreso", "movimiento_id = ?", [movimiento.id]),
    egresoInfo.tabla, "egreso", movimiento, topeEgreso
  );
  const ingreso = await completarEquipos(
    await leerEquipos(ingresoInfo.tabla, "ingreso", "movimiento_id = ?", [movimiento.id]),
    ingresoInfo.tabla, "ingreso", movimiento, topeIngreso
  );
  return { familia, egreso, ingreso };
}

function partirCantidad(filas, cantidad) {
  const tope = Math.max(0, Number(cantidad || 0));
  return { conservar: filas.slice(0, tope), soltar: filas.slice(tope) };
}

async function aplicarHojas(acciones) {
  const hechas = [];
  for (const accion of acciones) {
    const escrita = await accion.aplicar();
    if (!escrita || !escrita.ok) {
      for (const hecha of hechas.reverse()) {
        try { await hecha.revertir(); } catch (_) { /* la hoja queda como alcanzó a escribirse */ }
      }
      return false;
    }
    hechas.push(accion);
  }
  return true;
}

function accionEgreso(familia, fila, siguiente) {
  const anterior = {
    familia, operacion: "egreso", fila: fila.origen_fila,
    cliente: razonPlanilla(partirLite(fila.cliente).limpio, fila.con_2_0),
    fechaDespacho: fila.fecha_despacho,
  };
  return {
    aplicar: () => fila.origen_fila > 0 ? actualizarMacEnFila({ ...anterior, ...siguiente, fila: fila.origen_fila }) : Promise.resolve({ ok: true }),
    revertir: () => fila.origen_fila > 0 ? actualizarMacEnFila(anterior) : Promise.resolve({ ok: true }),
  };
}

function accionLiberar(familia, operacion, fila) {
  const anterior = operacion === "egreso"
    ? {
      familia, operacion, fila: fila.origen_fila,
      cliente: razonPlanilla(partirLite(fila.cliente).limpio, fila.con_2_0),
      fechaDespacho: fila.fecha_despacho,
    }
    : {
      familia, operacion, fila: fila.origen_fila,
      fechaLlegada: fila.fecha_llegada, fechaCarga: fila.fecha_carga,
      lote: fila.lote, caja: fila.caja, wifi: fila.mac_wifi, eth: fila.mac_eth,
    };
  return {
    aplicar: () => fila.origen_fila > 0 ? liberarMacEnFila({ familia, operacion, fila: fila.origen_fila }) : Promise.resolve({ ok: true }),
    revertir: () => fila.origen_fila > 0 ? actualizarMacEnFila(anterior) : Promise.resolve({ ok: true }),
  };
}

router.get("/:id/equipos", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Movimiento desconocido." });
  try {
    await asegurarMovimientoMac();
    const movimiento = await movimientoPorId(id);
    if (!movimiento) return res.status(404).json({ error: "No se encontró el movimiento." });
    const equipos = await equiposDelMovimiento(movimiento);
    res.json({
      familia: equipos.familia,
      egreso: equipos.egreso.map((fila) => fila.sufijo),
      ingreso: equipos.ingreso.map((fila) => fila.sufijo),
    });
  } catch (e) {
    res.status(500).json({ error: "No se pudieron leer los equipos." });
  }
});

router.put("/:id", requerirRol(["admin"]), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ingreso = cantidad(req.body.ingreso);
  const egreso = cantidad(req.body.egreso);
  if (!id || ingreso === undefined || egreso === undefined) {
    return res.status(400).json({ error: "Los datos del movimiento no son válidos." });
  }
  const conn = await pool.getConnection();
  try {
    await asegurarColumnaLite();
    await asegurarMovimientoMac();
    const actual = await movimientoPorId(id);
    if (!actual) return res.status(404).json({ error: "No se encontró el movimiento." });
    const equipos = await equiposDelMovimiento(actual, { ingreso, egreso });
    const egresoPartido = partirCantidad(equipos.egreso, egreso);
    const ingresoPartido = partirCantidad(equipos.ingreso, ingreso);
    const partida = partirLite(texto(req.body.razon_social, 255));
    const marca = req.body.con_2_0
      ? (partida.marca || actual.con_2_0 || textoLite(familiaDe(actual.categoria)))
      : null;
    const datos = {
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.fecha || "")) ? req.body.fecha : null,
      estado: texto(req.body.estado, 50),
      remito: texto(req.body.remito, 50),
      factura: texto(req.body.factura, 50),
      razon: partida.limpio,
      ticket: texto(req.body.ticket, 50),
      motivo: texto(req.body.motivo, 255),
      ingreso,
      egreso,
      marca,
    };
    const acciones = [];
    for (const fila of egresoPartido.conservar) {
      acciones.push(accionEgreso(equipos.familia, fila, {
        cliente: razonPlanilla(datos.razon, datos.marca),
        fechaDespacho: datos.fecha,
      }));
    }
    for (const fila of egresoPartido.soltar) acciones.push(accionLiberar(equipos.familia, "egreso", fila));
    for (const fila of ingresoPartido.conservar) {
      const carga = !fila.fecha_carga || fila.fecha_carga === fila.fecha_llegada ? datos.fecha : fila.fecha_carga;
      const anterior = {
        familia: equipos.familia, operacion: "ingreso", fila: fila.origen_fila,
        fechaLlegada: fila.fecha_llegada, fechaCarga: fila.fecha_carga,
      };
      acciones.push({
        aplicar: () => fila.origen_fila > 0
          ? actualizarMacEnFila({ ...anterior, fechaLlegada: datos.fecha, fechaCarga: carga })
          : Promise.resolve({ ok: true }),
        revertir: () => fila.origen_fila > 0 ? actualizarMacEnFila(anterior) : Promise.resolve({ ok: true }),
      });
      fila.cargaNueva = carga;
    }
    for (const fila of ingresoPartido.soltar) {
      acciones.push({
        aplicar: () => Promise.resolve({ ok: true }),
        revertir: () => Promise.resolve({ ok: true }),
      });
    }
    if (!await aplicarHojas(acciones)) {
      return res.status(502).json({ error: "Google no dejó editar las MAC. No se cambió el movimiento." });
    }
    if (enPlanilla(actual)) {
      const escrita = await actualizarMovimiento({
        pais: actual.pais,
        fila: actual.origen_fila,
        categoria: actual.categoria,
        fecha: datos.fecha,
        estado: datos.estado,
        remito: datos.remito,
        factura: datos.factura,
        razon: razonPlanilla(datos.razon, datos.marca),
        ticket: datos.ticket,
        motivo: datos.motivo,
        ingreso: datos.ingreso,
        egreso: datos.egreso,
      });
      if (!escrita || !escrita.ok) {
        for (const accion of acciones.reverse()) {
          try { await accion.revertir(); } catch (_) { /* la hoja de MAC queda como alcanzó a escribirse */ }
        }
        return res.status(502).json({ error: "Google no dejó editar la planilla. No se cambió el movimiento." });
      }
    }
    const antes = Number(actual.ingreso || 0) - Number(actual.egreso || 0);
    const despues = Number(datos.ingreso || 0) - Number(datos.egreso || 0);
    const tablaEgreso = equipos.familia && EQUIPO[equipos.familia] ? EQUIPO[equipos.familia].egreso.tabla : "";
    const tablaIngreso = equipos.familia && EQUIPO[equipos.familia] ? EQUIPO[equipos.familia].ingreso.tabla : "";
    if (tablaEgreso) {
      for (const fila of egresoPartido.conservar) {
        await conn.query(
          `UPDATE ${tablaEgreso}
           SET cliente = ?, fecha_despacho = ?, con_2_0 = ?, movimiento_id = ?
           WHERE id = ?`,
          [datos.razon, datos.fecha, datos.marca, id, fila.id]
        );
      }
      for (const fila of egresoPartido.soltar) {
        await conn.query(
          `UPDATE ${tablaEgreso}
           SET cliente = 'EN DEPOSITO', fecha_despacho = NULL, con_2_0 = NULL, movimiento_id = NULL
           WHERE id = ?`,
          [fila.id]
        );
      }
    }
    if (tablaIngreso) {
      for (const fila of ingresoPartido.conservar) {
        await conn.query(
          `UPDATE ${tablaIngreso}
           SET fecha_llegada = ?, fecha_carga = ?, movimiento_id = ?
           WHERE id = ?`,
          [datos.fecha, fila.cargaNueva, id, fila.id]
        );
      }
      for (const fila of ingresoPartido.soltar) {
        await conn.query(`UPDATE ${tablaIngreso} SET movimiento_id = NULL WHERE id = ?`, [fila.id]);
      }
    }
    await conn.query(
      `UPDATE movimientos_cantidad
       SET fecha = ?, estado = ?, remito = ?, factura = ?, razon_social = ?, ticket = ?, motivo = ?,
           ingreso = ?, egreso = ?, con_2_0 = ?
       WHERE id = ?`,
      [datos.fecha, datos.estado, datos.remito, datos.factura, datos.razon, datos.ticket, datos.motivo,
        datos.ingreso, datos.egreso, datos.marca, id]
    );
    await conn.query(
      "UPDATE categorias_stock SET cantidad_actual = COALESCE(cantidad_actual, 0) + ? WHERE id = ?",
      [despues - antes, actual.categoria_id]
    );
    res.json({
      ok: true,
      equipos: egresoPartido.conservar.length + ingresoPartido.conservar.length,
      liberados: egresoPartido.soltar.length + ingresoPartido.soltar.length,
    });
  } catch (e) {
    res.status(500).json({ error: "No se pudo editar el movimiento." });
  } finally {
    conn.release();
  }
});

router.delete("/:id", requerirRol(["admin"]), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Movimiento desconocido." });
  const conn = await pool.getConnection();
  try {
    await asegurarMovimientoMac();
    const actual = await movimientoPorId(id);
    if (!actual) return res.status(404).json({ error: "No se encontró el movimiento." });
    const equipos = await equiposDelMovimiento(actual);
    const acciones = equipos.egreso.map((fila) => accionLiberar(equipos.familia, "egreso", fila));
    if (!await aplicarHojas(acciones)) {
      return res.status(502).json({ error: "Google no dejó modificar las MAC. El movimiento sigue cargado." });
    }
    if (enPlanilla(actual)) {
      const escrita = await vaciarMovimiento({
        pais: actual.pais,
        fila: actual.origen_fila,
        categoria: actual.categoria,
      });
      if (!escrita || !escrita.ok) {
        for (const accion of acciones.reverse()) {
          try { await accion.revertir(); } catch (_) { /* la hoja de MAC queda como alcanzó a escribirse */ }
        }
        return res.status(502).json({ error: "Google no dejó borrar la fila. El movimiento sigue cargado." });
      }
    }
    const neto = Number(actual.ingreso || 0) - Number(actual.egreso || 0);
    if (equipos.familia && EQUIPO[equipos.familia]) {
      const tablaEgreso = EQUIPO[equipos.familia].egreso.tabla;
      const tablaIngreso = EQUIPO[equipos.familia].ingreso.tabla;
      for (const fila of equipos.egreso) {
        await conn.query(
          `UPDATE ${tablaEgreso}
           SET cliente = 'EN DEPOSITO', fecha_despacho = NULL, con_2_0 = NULL, movimiento_id = NULL
           WHERE id = ?`,
          [fila.id]
        );
      }
      for (const fila of equipos.ingreso) {
        await conn.query(`UPDATE ${tablaIngreso} SET movimiento_id = NULL WHERE id = ?`, [fila.id]);
      }
    }
    await conn.query("DELETE FROM movimientos_cantidad WHERE id = ?", [id]);
    await conn.query(
      "UPDATE categorias_stock SET cantidad_actual = COALESCE(cantidad_actual, 0) - ? WHERE id = ?",
      [neto, actual.categoria_id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo eliminar el movimiento." });
  } finally {
    conn.release();
  }
});

module.exports = router;
