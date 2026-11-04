const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");
const { claveCliente } = require("./clientes");
const { escribirMovimiento, escribirMac, cuentaGoogle, cajaLimpia, numeroEquipo, cajaPlanilla } = require("../lib/planilla-google");
const { asegurarColumnaLite, asegurarMovimientoMac, textoLite, familiaDe, partirLite, razonPlanilla } = require("../lib/con-2-0");

const router = express.Router();
router.use(requerirLogin);

function texto(valor, largo) {
  const limpio = String(valor || "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, largo) : null;
}

function entero(valor) {
  if (valor === "" || valor === null || valor === undefined) return 0;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 100000) return null;
  return numero;
}

const MAC_TABLAS = {
  "EBD|ingreso": { tabla: "trazabilidad_ingreso_ebd", tipo: "ingreso", lugar: "Ingreso EBD", familia: "EBD" },
  "EBD_REP|ingreso": { tabla: "trazabilidad_ingreso_ebd_reparado", tipo: "ingreso", lugar: "Ingreso EBD reparado", familia: "EBD_REP" },
  "PANTALLA|ingreso": { tabla: "trazabilidad_ingreso_pantalla", tipo: "ingreso", lugar: "Ingreso pantallas", familia: "PANTALLA" },
  "D3|ingreso": { tabla: "trazabilidad_ingreso_d3", tipo: "ingreso", lugar: "Ingreso D3", familia: "D3" },
  "EBD|egreso": { tabla: "trazabilidad_egreso_ebd", tipo: "egreso", lugar: "Egreso EBD", familia: "EBD" },
  "EBD_REP|egreso": { tabla: "trazabilidad_egreso_ebd_reparado", tipo: "egreso", lugar: "Egreso EBD reparado", familia: "EBD_REP" },
  "PANTALLA|egreso": { tabla: "trazabilidad_egreso_pantalla", tipo: "egreso", lugar: "Egreso pantallas", familia: "PANTALLA" },
  "EBD_INT|ingreso": { tabla: "trazabilidad_ingreso_ebd_interno", tipo: "ingreso", lugar: "Ingreso EBD uso interno", familia: "EBD_INT" },
  "EBD_INT|egreso": { tabla: "trazabilidad_egreso_ebd_interno", tipo: "egreso", lugar: "Egreso EBD uso interno", familia: "EBD_INT" },
  "D3|egreso": { tabla: "trazabilidad_egreso_d3", tipo: "egreso", lugar: "Egreso D3", familia: "D3" },
  "EBD|devolucion": { tabla: "trazabilidad_devolucion_ebd", tipo: "egreso", lugar: "Devolución EBD", familia: "EBD" },
  "D3|devolucion": { tabla: "trazabilidad_devolucion_d3", tipo: "egreso", lugar: "Devolución D3", familia: "D3" },
};

function mac12(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return limpio.length >= 12 ? limpio.slice(0, 12) : "";
}

function fechaIso(valor) {
  const textoFecha = String(valor || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(textoFecha) ? textoFecha : null;
}

function operacionDe(valor, general) {
  const textoOp = String(valor || general || "").toLowerCase();
  return ["ingreso", "egreso", "devolucion"].includes(textoOp) ? textoOp : "egreso";
}

function familiaMac(valor) {
  const texto = String(valor || "").toUpperCase();
  if (texto === "PANTALLA" || texto === "EBD_REP" || texto === "EBD_INT" || texto === "D3" || texto === "EBD") return texto;
  if (texto.includes("PANTALLA")) return "PANTALLA";
  if (texto.includes("INTERNO")) return "EBD_INT";
  if (texto.includes("REPAR")) return "EBD_REP";
  return texto.includes("D3") ? "D3" : "EBD";
}

function equiposMac(lista, familiaGeneral, operacionGeneral) {
  const vistos = new Set();
  const equipos = [];
  for (const item of Array.isArray(lista) ? lista : []) {
    const familia = familiaMac(item.familia || familiaGeneral);
    const operacion = operacionDe(item.operacion, operacionGeneral);
    let wifi = mac12(item.wifi || item.mac_wifi || item.mac);
    let eth = mac12(item.eth || item.mac_eth);
    if (!wifi && eth) {
      wifi = eth;
      eth = "";
    }
    if (wifi && eth && wifi === eth) eth = "";
    if (!wifi) continue;
    const clave = `${operacion}|${familia}|${wifi}|${eth}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    equipos.push({
      operacion,
      familia,
      wifi,
      eth,
      lote: texto(item.lote, 80) || null,
      caja: cajaLimpia(item.caja).slice(0, 40) || null,
      numero: numeroEquipo(item.numero || item.numero_equipo, item.caja) || null,
      cliente: texto(item.cliente, 255) || null,
      fechaLlegada: fechaIso(item.fecha_llegada),
      fechaCarga: fechaIso(item.fecha_carga),
      fechaDespacho: fechaIso(item.fecha_despacho),
    });
  }
  return equipos;
}

let tablasMacListas = null;
function asegurarTablasMac() {
  if (!tablasMacListas) {
    tablasMacListas = (async () => {
      for (const tabla of ["trazabilidad_devolucion_ebd", "trazabilidad_devolucion_d3"]) {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS ${tabla} (
             id INT AUTO_INCREMENT PRIMARY KEY,
             cliente VARCHAR(255) NULL,
             fecha_despacho DATE NULL,
             fecha_despacho_texto VARCHAR(80) NULL,
             mac_wifi VARCHAR(20) NOT NULL,
             mac_eth VARCHAR(20) NULL,
             lote VARCHAR(80) NULL,
             caja VARCHAR(40) NULL,
             numero_equipo VARCHAR(20) NULL,
             origen_fila INT NOT NULL,
             UNIQUE KEY uq_fila (origen_fila),
             KEY idx_mac_wifi (mac_wifi),
             KEY idx_mac_eth (mac_eth)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
      }
    })().catch((error) => {
      tablasMacListas = null;
      throw error;
    });
  }
  return tablasMacListas;
}

const SEGUIMIENTO_MAC = [
  { tabla: "trazabilidad_egreso_ebd", libre: false, fecha: "fecha_despacho", conCliente: true, origen: "egreso" },
  { tabla: "trazabilidad_egreso_d3", libre: false, fecha: "fecha_despacho", conCliente: true, origen: "egreso" },
  { tabla: "trazabilidad_egreso_ebd_reparado", libre: false, fecha: "fecha_despacho", conCliente: true, origen: "egreso" },
  { tabla: "trazabilidad_egreso_pantalla", libre: false, fecha: "fecha_despacho", conCliente: true, origen: "egreso" },
  { tabla: "trazabilidad_egreso_ebd_interno", libre: false, fecha: "fecha_despacho", conCliente: true, origen: "egreso" },
  { tabla: "trazabilidad_devolucion_ebd", libre: true, fecha: "fecha_despacho", conCliente: false, origen: "devolucion" },
  { tabla: "trazabilidad_devolucion_d3", libre: true, fecha: "fecha_despacho", conCliente: false, origen: "devolucion" },
  { tabla: "trazabilidad_ingreso_ebd", libre: true, fecha: "fecha_llegada", conCliente: false, origen: "ingreso" },
  { tabla: "trazabilidad_ingreso_d3", libre: true, fecha: "fecha_llegada", conCliente: false, origen: "ingreso" },
  { tabla: "trazabilidad_ingreso_ebd_reparado", libre: true, fecha: "fecha_llegada", conCliente: false, origen: "ingreso" },
  { tabla: "trazabilidad_ingreso_pantalla", libre: true, fecha: "fecha_llegada", conCliente: false, origen: "ingreso" },
  { tabla: "trazabilidad_ingreso_ebd_interno", libre: true, fecha: "fecha_llegada", conCliente: false, origen: "ingreso" },
];

function valorPlanilla(valor) {
  const textoValor = String(valor || "").trim();
  if (!textoValor || textoValor === "-" || /^#N\/A$/i.test(textoValor)) return "";
  if (/^\d+\.0+$/.test(textoValor)) return String(parseInt(textoValor, 10));
  return textoValor;
}

function clienteReal(cliente) {
  const limpio = valorPlanilla(cliente).replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const plano = limpio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/^EN\s+(EL\s+)?DEPOSITO$/.test(plano)) return "";
  return limpio;
}

async function eventosMac(macs) {
  const lista = [...new Set(macs.map((valor) => mac12(valor)).filter(Boolean))];
  if (!lista.length) return [];
  const marcas = lista.map(() => "?").join(",");
  const eventos = [];
  for (const info of SEGUIMIENTO_MAC) {
    try {
      const clienteSql = info.conCliente ? "cliente" : "NULL";
      const [filas] = await pool.query(
        `SELECT mac_wifi, mac_eth, lote, caja, numero_equipo, ${clienteSql} AS cliente,
                DATE_FORMAT(${info.fecha}, '%Y-%m-%d') AS fecha, id
         FROM ${info.tabla}
         WHERE mac_wifi IN (${marcas}) OR mac_eth IN (${marcas})`,
        [...lista, ...lista]
      );
      for (const fila of filas) {
        eventos.push({
          wifi: fila.mac_wifi,
          eth: fila.mac_eth || "",
          lote: fila.lote || "",
          caja: fila.caja || "",
          numero: fila.numero_equipo || "",
          cliente: fila.cliente || "",
          fecha: fila.fecha || "",
          id: fila.id,
          libre: info.libre,
          origen: info.origen,
        });
      }
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    }
  }
  return eventos;
}

function ocupacionMac(eventos, wifi, eth) {
  const propios = eventos.filter((evento) => (
    evento.wifi === wifi || evento.eth === wifi || (eth && (evento.wifi === eth || evento.eth === eth))
  ));
  propios.sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : (a.fecha < b.fecha ? -1 : 1)));
  const ultimo = propios[propios.length - 1];
  if (!ultimo || ultimo.libre) return { libre: true, cliente: "" };
  const cliente = clienteReal(ultimo.cliente);
  if (!cliente) return { libre: true, cliente: "" };
  return { libre: false, cliente };
}

function fichaMac(eventos, wifi, eth) {
  const propios = eventos.filter((evento) => (
    evento.wifi === wifi || evento.eth === wifi || (eth && (evento.wifi === eth || evento.eth === eth))
  ));
  const ingresos = propios.filter((evento) => evento.origen === "ingreso");
  let lote = "";
  let caja = "";
  let numero = "";
  for (const evento of [...ingresos, ...propios]) {
    if (!lote) lote = valorPlanilla(evento.lote);
    if (!caja) caja = valorPlanilla(evento.caja);
    if (!numero) numero = valorPlanilla(evento.numero);
  }
  return { lote, caja, numero };
}

function avisoOcupadas(ocupadas) {
  if (!ocupadas.length) return "";
  const detalle = ocupadas.map((item) => `${item.wifi} está con ${item.cliente}`).join(". ");
  return `${detalle}. Esas MAC no se egresaron: tienen que estar libres. Si volvieron por una devolución, ya se pueden egresar.`;
}

async function reservarFila(conn, tabla) {
  const [[fila]] = await conn.query(
    `SELECT COALESCE(MIN(CASE WHEN origen_fila < 0 THEN origen_fila END), 0) - 1 AS fila FROM ${tabla} FOR UPDATE`
  );
  return fila.fila;
}

async function asegurarCliente(conn, razon) {
  const limpia = partirLite(razon).limpio;
  if (!limpia) return;
  const [filas] = await conn.query("SELECT id, razon_social, planilla FROM clientes");
  const clave = claveCliente(limpia);
  const igual = filas.find((fila) => claveCliente(fila.razon_social) === clave);
  if (igual) {
    if (!igual.planilla) await conn.query("UPDATE clientes SET planilla = 1 WHERE id = ?", [igual.id]);
    return;
  }
  await conn.query("INSERT INTO clientes (razon_social, planilla) VALUES (?, 1)", [limpia.slice(0, 200)]);
}

function filaMacHallada(info, fila) {
  return {
    wifi: fila.mac_wifi,
    eth: fila.mac_eth || "",
    familia: info.familia,
    lugar: info.lugar,
    cliente: fila.cliente || "",
    fecha: fila.fecha || "",
    lote: fila.lote || "",
    caja: fila.caja || "",
    numero: fila.numero_equipo || "",
  };
}

async function completarHallazgos(hallados) {
  const unicos = [];
  const vistos = new Set();
  for (const item of hallados) {
    const clave = `${item.familia}|${item.wifi}|${item.eth}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(item);
  }
  const eventos = await eventosMac(unicos.flatMap((item) => [item.wifi, item.eth]));
  const lista = unicos.map((item) => {
    const estado = ocupacionMac(eventos, item.wifi, item.eth);
    const ficha = fichaMac(eventos, item.wifi, item.eth);
    return {
      ...item,
      lote: ficha.lote || valorPlanilla(item.lote),
      caja: ficha.caja || valorPlanilla(item.caja),
      numero_equipo: ficha.numero || valorPlanilla(item.numero) || numeroEquipo("", item.caja),
      libre: estado.libre,
      ocupada_por: estado.cliente,
    };
  });
  lista.sort((a, b) => Number(b.libre) - Number(a.libre));
  return lista.slice(0, 20);
}

router.get("/mac", async (req, res) => {
  const numero = String(req.query.numero || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 20);
  const parcial = String(req.query.q || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (!numero && parcial.length < 4) return res.json([]);
  try {
    await asegurarTablasMac();
    await asegurarMovimientoMac();
    const hallados = [];
    const patronNumero = numero
      ? `EQUIPO[[:space:]]*\\(?[[:space:]]*${numero}([^0-9]|$)`
      : "";
    for (const info of Object.values(MAC_TABLAS)) {
      const fecha = info.tipo === "ingreso" ? "fecha_llegada" : "fecha_despacho";
      const cliente = info.familia === "EBD_INT" && info.tipo === "ingreso" ? "cliente" : info.tipo === "ingreso" ? "NULL" : "cliente";
      const [filas] = numero
        ? await pool.query(
          `SELECT mac_wifi, mac_eth, lote, caja, numero_equipo, ${cliente} AS cliente,
                  DATE_FORMAT(${fecha}, '%Y-%m-%d') AS fecha
           FROM ${info.tabla}
           WHERE numero_equipo = ? OR UPPER(caja) REGEXP ?
           ORDER BY ${fecha} DESC
           LIMIT 40`,
          [numero, patronNumero]
        )
        : await pool.query(
          `SELECT mac_wifi, mac_eth, lote, caja, numero_equipo, ${cliente} AS cliente,
                  DATE_FORMAT(${fecha}, '%Y-%m-%d') AS fecha
           FROM ${info.tabla}
           WHERE RIGHT(mac_wifi, ?) = ? OR RIGHT(mac_eth, ?) = ?
           ORDER BY ${fecha} DESC
           LIMIT 40`,
          [parcial.length, parcial, parcial.length, parcial]
        );
      for (const fila of filas) hallados.push(filaMacHallada(info, fila));
    }
    res.json(await completarHallazgos(hallados));
  } catch (error) {
    res.status(500).json({ error: numero ? "No se pudo buscar el número de equipo." : "No se pudo buscar la MAC." });
  }
});

router.get("/opciones", async (req, res) => {
  try {
    const [categorias] = await pool.query(
      "SELECT id, nombre, pais, cantidad_actual FROM categorias_stock ORDER BY pais, nombre"
    );
    const [estados] = await pool.query(
      `SELECT DISTINCT estado FROM movimientos_cantidad
       WHERE estado IS NOT NULL AND TRIM(estado) <> ''
       ORDER BY estado`
    );
    const [razones] = await pool.query(
      "SELECT razon_social FROM clientes WHERE planilla = 1 AND razon_social IS NOT NULL ORDER BY razon_social"
    );
    res.json({
      categorias,
      estados: estados.map((fila) => fila.estado),
      razones: razones.map((fila) => fila.razon_social),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function volcarPendientes() {
  const resumen = { cuenta: Boolean(cuentaGoogle()), stock: [], mac: [] };
  if (!resumen.cuenta) return resumen;
  const [stocks] = await pool.query(
    `SELECT m.id, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.estado, m.remito, m.factura,
            m.razon_social, m.ticket, m.motivo, m.ingreso, m.egreso, m.con_2_0,
            c.nombre AS categoria, c.pais
     FROM movimientos_cantidad m
     JOIN categorias_stock c ON c.id = m.categoria_id
     WHERE m.origen_hoja = 'SITIO'
     ORDER BY m.id`
  );
  for (const fila of stocks) {
    try {
      const escrita = await escribirMovimiento({
        pais: String(fila.pais || "").toUpperCase(),
        categoria: fila.categoria,
        fecha: fila.fecha,
        estado: fila.estado || "",
        remito: fila.remito || "",
        factura: fila.factura || "",
        razon: razonPlanilla(fila.razon_social, fila.con_2_0),
        ticket: fila.ticket || "",
        motivo: fila.motivo || "",
        ingreso: fila.ingreso,
        egreso: fila.egreso,
      });
      if (escrita && escrita.ok) {
        await pool.query(
          "UPDATE movimientos_cantidad SET origen_hoja = ?, origen_fila = ? WHERE id = ? AND origen_hoja = 'SITIO'",
          [escrita.hoja, escrita.fila, fila.id]
        );
        resumen.stock.push(`ok:${escrita.hoja}:${escrita.fila}`);
      } else {
        resumen.stock.push(`no:${(escrita && escrita.estado) || "error"}:${(escrita && escrita.motivo) || ""}`);
      }
    } catch (_) {
      resumen.stock.push("no:error");
    }
  }
  const macs = [
    ["trazabilidad_egreso_ebd", "EBD", "egreso", "fecha_despacho", true],
    ["trazabilidad_egreso_d3", "D3", "egreso", "fecha_despacho", true],
    ["trazabilidad_devolucion_d3", "D3", "devolucion", "fecha_despacho", true],
    ["trazabilidad_egreso_ebd_reparado", "EBD_REP", "egreso", "fecha_despacho", true],
    ["trazabilidad_egreso_pantalla", "PANTALLA", "egreso", "fecha_despacho", true],
    ["trazabilidad_egreso_ebd_interno", "EBD_INT", "egreso", "fecha_despacho", true],
    ["trazabilidad_ingreso_ebd", "EBD", "ingreso", "fecha_llegada", false],
    ["trazabilidad_ingreso_d3", "D3", "ingreso", "fecha_llegada", false],
    ["trazabilidad_ingreso_ebd_reparado", "EBD_REP", "ingreso", "fecha_llegada", false],
    ["trazabilidad_ingreso_pantalla", "PANTALLA", "ingreso", "fecha_llegada", false],
    ["trazabilidad_ingreso_ebd_interno", "EBD_INT", "ingreso", "fecha_llegada", false],
  ];
  for (const [tabla, familia, operacion, fechaCol, conCliente] of macs) {
    let filas = [];
    try {
      const clienteSql = conCliente
        ? "cliente, con_2_0"
        : tabla === "trazabilidad_ingreso_ebd_interno"
          ? "cliente, NULL AS con_2_0"
          : "NULL AS cliente, NULL AS con_2_0";
      const cargaSql = operacion === "ingreso"
        ? "DATE_FORMAT(fecha_carga, '%Y-%m-%d') AS fecha_carga"
        : "NULL AS fecha_carga";
      const [rows] = await pool.query(
        `SELECT id, ${clienteSql}, DATE_FORMAT(${fechaCol}, '%Y-%m-%d') AS fecha,
                ${cargaSql}, mac_wifi, mac_eth, lote, caja, numero_equipo
         FROM ${tabla}
         WHERE origen_fila < 0
         ORDER BY id`
      );
      filas = rows;
    } catch (_) {
      continue;
    }
    for (const fila of filas) {
      try {
        let caja = fila.caja || "";
        if (fila.numero_equipo && caja && !/equipo/i.test(String(caja))) {
          caja = `${caja} (Equipo ${fila.numero_equipo})`;
        }
        const escrita = await escribirMac({
          familia,
          operacion,
          reemplazar: operacion === "egreso" && Boolean(fila.fecha),
          cliente: razonPlanilla(fila.cliente, fila.con_2_0),
          fechaLlegada: operacion === "ingreso" ? fila.fecha : null,
          fechaCarga: fila.fecha_carga,
          fechaDespacho: operacion === "ingreso" ? null : fila.fecha,
          wifi: fila.mac_wifi,
          eth: fila.mac_eth,
          lote: fila.lote,
          caja,
        });
        if (escrita && escrita.ok && escrita.reemplazo) {
          const [enFila] = await pool.query(`SELECT id, cliente FROM ${tabla} WHERE origen_fila = ?`, [escrita.fila]);
          const libre = enFila.find((item) => !clienteReal(item.cliente));
          if (libre) {
            const limpio = partirLite(fila.cliente).limpio;
            await pool.query(
              `UPDATE ${tabla} SET cliente = ?, con_2_0 = ?, ${fechaCol} = COALESCE(${fechaCol}, ?) WHERE id = ?`,
              [limpio || null, fila.con_2_0, fila.fecha, libre.id]
            );
            await pool.query(`DELETE FROM ${tabla} WHERE id = ? AND origen_fila < 0`, [fila.id]);
          }
          resumen.mac.push(`ok:${familia}:${operacion}:${escrita.fila}`);
        } else if (escrita && escrita.ok) {
          await pool.query(
            `UPDATE ${tabla} SET origen_fila = ? WHERE id = ? AND origen_fila < 0`,
            [escrita.fila, fila.id]
          );
          resumen.mac.push(`ok:${familia}:${operacion}:${escrita.fila}`);
        } else {
          resumen.mac.push(`no:${familia}:${operacion}:${(escrita && escrita.estado) || "error"}:${(escrita && escrita.motivo) || ""}`);
        }
      } catch (_) {
        resumen.mac.push(`no:${familia}:${operacion}:error`);
      }
    }
  }
  return resumen;
}

router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const pais = String(req.body.pais || "").trim().toUpperCase();
  const fecha = String(req.body.fecha || "").trim();
  const estado = texto(req.body.estado, 50);
  const remito = texto(req.body.remito, 50);
  const factura = texto(req.body.factura, 50);
  const razon = texto(req.body.razon_social, 255);
  const ticket = texto(req.body.ticket, 50);
  const motivo = estado;
  const categoriaId = parseInt(req.body.categoria_id, 10);
  const ingreso = entero(req.body.ingreso);
  const egreso = entero(req.body.egreso);
  const operacionMac = ["ingreso", "egreso", "devolucion"].includes(req.body.mac_operacion)
    ? req.body.mac_operacion
    : "egreso";
  const equipos = equiposMac(req.body.macs, req.body.mac_familia, operacionMac);
  const fechaFormulario = fechaIso(fecha);
  if (fechaFormulario) {
    for (const equipo of equipos) {
      if (equipo.operacion === "ingreso") {
        if (!equipo.fechaLlegada) equipo.fechaLlegada = fechaFormulario;
        if (!equipo.fechaCarga) equipo.fechaCarga = fechaFormulario;
      } else if (!equipo.fechaDespacho) {
        equipo.fechaDespacho = fechaFormulario;
      }
    }
  }
  const soloMac = equipos.length > 0 && !ingreso && !egreso;

  if (pais !== "ARGENTINA" && pais !== "PARAGUAY") return res.status(400).json({ error: "Elegí Argentina o Paraguay." });
  if (ingreso === null || egreso === null) return res.status(400).json({ error: "La cantidad tiene que ser un número entero." });
  if (!soloMac) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "La fecha no es válida." });
    if (!estado) return res.status(400).json({ error: "Elegí el estado." });
    if (!razon) return res.status(400).json({ error: "Elegí la razón social." });
    if (!categoriaId) return res.status(400).json({ error: "Elegí la categoría de la planilla." });
    if (!ingreso && !egreso) return res.status(400).json({ error: "Indicá cuánto ingresa o cuánto egresa." });
  }
  if (equipos.some((equipo) => equipo.operacion === "egreso" && !equipo.cliente)) {
    return res.status(400).json({ error: "En un egreso, la primera columna es el cliente." });
  }

  const conn = await pool.getConnection();
  try {
    if (equipos.length) await asegurarTablasMac();
    await asegurarColumnaLite();
    await asegurarMovimientoMac();
    await volcarPendientes();
    const quiereLite = req.body.con_2_0 === true || req.body.con_2_0 === "true" || req.body.con_2_0 === 1;
    const razonPartida = partirLite(razon);
    let categoria = null;
    if (!soloMac) {
      const [[hallada]] = await conn.query(
        "SELECT id, nombre, pais FROM categorias_stock WHERE id = ?",
        [categoriaId]
      );
      categoria = hallada;
      if (!categoria || String(categoria.pais || "").toUpperCase() !== pais) {
        return res.status(400).json({ error: "Esa categoría no está en el país elegido." });
      }
    }

    let origenHoja = "SITIO";
    let origenFila = null;
    let enPlanilla = false;
    try {
      const escrita = soloMac ? null : await escribirMovimiento({
        pais,
        categoria: categoria.nombre,
        fecha,
        estado,
        remito: remito || "",
        factura: factura || "",
        razon: razonPlanilla(razonPartida.limpio, quiereLite
          ? textoLite(familiaDe(categoria.nombre) || req.body.mac_familia || "EBD")
          : razonPartida.marca),
        ticket: ticket || "",
        motivo: motivo || "",
        ingreso,
        egreso,
      });
      if (escrita && escrita.ok) {
        origenHoja = escrita.hoja;
        origenFila = escrita.fila;
        enPlanilla = true;
      }
    } catch (_) {
      enPlanilla = false;
    }

    let equiposParaGuardar = equipos;
    let ocupadas = [];
    let eventos = [];
    if (equipos.some((equipo) => equipo.operacion === "egreso")) {
      eventos = await eventosMac(equipos.flatMap((equipo) => [equipo.wifi, equipo.eth]));
      equiposParaGuardar = [];
      ocupadas = [];
      for (const equipo of equipos) {
        if (equipo.operacion !== "egreso") {
          equiposParaGuardar.push(equipo);
          continue;
        }
        const estado = ocupacionMac(eventos, equipo.wifi, equipo.eth);
        if (estado.libre) equiposParaGuardar.push(equipo);
        else ocupadas.push({ wifi: equipo.wifi, cliente: estado.cliente });
      }
      if (!equiposParaGuardar.length && soloMac) {
        return res.status(409).json({ error: avisoOcupadas(ocupadas) });
      }
    }

    if (!eventos.length && equiposParaGuardar.some((equipo) => !equipo.lote || !equipo.caja)) {
      eventos = await eventosMac(equiposParaGuardar.flatMap((equipo) => [equipo.wifi, equipo.eth]));
    }

    const repetidas = new Set();
    const macsVistas = new Set();
    for (const equipo of equiposParaGuardar) {
      const propias = [equipo.wifi, equipo.eth].filter(Boolean);
      if (propias.some((mac) => macsVistas.has(mac))) {
        return res.status(409).json({ error: "Ese equipo ya está en otra fila." });
      }
      propias.forEach((mac) => macsVistas.add(mac));
      if (equipo.operacion !== "ingreso") continue;
      const clave = `${equipo.familia}|${equipo.wifi}`;
      if (repetidas.has(clave)) {
        return res.status(409).json({ error: "Hay una MAC repetida en este ingreso." });
      }
      repetidas.add(clave);
      const destinoPrevio = MAC_TABLAS[`${equipo.familia}|ingreso`];
      if (!destinoPrevio) continue;
      const claves = [equipo.wifi, equipo.eth].filter(Boolean);
      const marcas = claves.map(() => "?").join(",");
      const [ya] = await conn.query(
        `SELECT id FROM ${destinoPrevio.tabla} WHERE mac_wifi IN (${marcas}) OR mac_eth IN (${marcas}) LIMIT 1`,
        [...claves, ...claves]
      );
      if (ya.length) {
        return res.status(409).json({ error: `Esa MAC ya está en ${destinoPrevio.lugar}.` });
      }
    }

    let macEnPlanilla = 0;
    const hojasMac = [];
    for (const equipo of equiposParaGuardar) {
      if (!equipo.lote || !equipo.caja || !equipo.numero) {
        const ficha = fichaMac(eventos, equipo.wifi, equipo.eth);
        if (!equipo.lote) equipo.lote = ficha.lote || null;
        if (!equipo.caja) equipo.caja = cajaLimpia(ficha.caja).slice(0, 40) || null;
        if (!equipo.numero && ficha.numero) equipo.numero = ficha.numero;
      }
      const clientePartido = partirLite(equipo.cliente);
      const marcaMac = equipo.operacion === "ingreso"
        ? null
        : (quiereLite ? textoLite(equipo.familia) : clientePartido.marca);
      try {
        const escrita = await escribirMac({
          familia: equipo.familia,
          operacion: equipo.operacion,
          reemplazar: equipo.operacion === "egreso",
          cliente: razonPlanilla(clientePartido.limpio, marcaMac),
          fechaLlegada: equipo.fechaLlegada,
          fechaCarga: equipo.fechaCarga,
          fechaDespacho: equipo.fechaDespacho,
          wifi: equipo.wifi,
          eth: equipo.eth,
          lote: equipo.lote,
          caja: cajaPlanilla(equipo.caja, equipo.numero),
        });
        if (escrita && escrita.ok) {
          equipo.filaPlanilla = escrita.fila;
          equipo.reemplazo = Boolean(escrita.reemplazo);
          macEnPlanilla += 1;
          const nombreHoja = String(escrita.hoja || "").trim();
          if (nombreHoja && !hojasMac.includes(nombreHoja)) hojasMac.push(nombreHoja);
        } else {
          console.error("mac-planilla", (escrita && escrita.estado) || "error", (escrita && escrita.motivo) || "sin hoja");
        }
      } catch (error) {
        console.error("mac-planilla", error && error.message ? "excepcion" : "excepcion");
        equipo.filaPlanilla = null;
      }
    }

    await conn.beginTransaction();
    let macsGuardadas = 0;
    for (const equipo of equiposParaGuardar) {
      const destino = MAC_TABLAS[`${equipo.familia}|${equipo.operacion}`];
      const filaMac = equipo.filaPlanilla || await reservarFila(conn, destino.tabla);
      if (equipo.reemplazo && destino.tipo !== "ingreso") {
        const clientePartido = partirLite(equipo.cliente);
        const marcaMac = quiereLite ? textoLite(equipo.familia) : clientePartido.marca;
        const [enFila] = await conn.query(
          `SELECT id, cliente FROM ${destino.tabla} WHERE origen_fila = ?`,
          [filaMac]
        );
        let idLibre = enFila[0] && !clienteReal(enFila[0].cliente) ? enFila[0].id : 0;
        if (!idLibre) {
          const [porMac] = await conn.query(
            `SELECT id, cliente FROM ${destino.tabla}
             WHERE mac_wifi IN (?, ?) OR mac_eth IN (?, ?)
             ORDER BY origen_fila DESC`,
            [equipo.wifi, equipo.eth || equipo.wifi, equipo.wifi, equipo.eth || equipo.wifi]
          );
          const hallada = porMac.find((fila) => !clienteReal(fila.cliente));
          idLibre = hallada ? hallada.id : 0;
        }
        if (idLibre) {
          await conn.query(
            `UPDATE ${destino.tabla}
             SET cliente = ?, con_2_0 = ?, fecha_despacho = COALESCE(fecha_despacho, ?)
             WHERE id = ?`,
            [clientePartido.limpio || null, marcaMac, equipo.fechaDespacho, idLibre]
          );
          equipo.mysqlId = idLibre;
        }
        if (equipo.cliente) await asegurarCliente(conn, equipo.cliente);
        macsGuardadas += 1;
        continue;
      }
      if (destino.tipo === "ingreso" && equipo.familia === "EBD_INT") {
        const [altaMac] = await conn.query(
          `INSERT INTO ${destino.tabla}
             (cliente, fecha_llegada, fecha_llegada_texto, fecha_carga, fecha_carga_texto,
              mac_wifi, mac_eth, lote, caja, numero_equipo, origen_fila)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [equipo.cliente, equipo.fechaLlegada, null, equipo.fechaCarga, null, equipo.wifi, equipo.eth || null,
            equipo.lote, equipo.caja, equipo.numero, filaMac]
        );
        equipo.mysqlId = altaMac.insertId;
      } else if (destino.tipo === "ingreso") {
        const [altaMac] = await conn.query(
          `INSERT INTO ${destino.tabla}
             (fecha_llegada, fecha_llegada_texto, fecha_carga, fecha_carga_texto,
              mac_wifi, mac_eth, lote, caja, numero_equipo, origen_fila)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [equipo.fechaLlegada, null, equipo.fechaCarga, null, equipo.wifi, equipo.eth || null,
            equipo.lote, equipo.caja, equipo.numero, filaMac]
        );
        equipo.mysqlId = altaMac.insertId;
      } else {
        const clientePartido = partirLite(equipo.cliente);
        const marcaMac = quiereLite ? textoLite(equipo.familia) : clientePartido.marca;
        const [altaMac] = await conn.query(
          `INSERT INTO ${destino.tabla}
             (cliente, fecha_despacho, fecha_despacho_texto,
              mac_wifi, mac_eth, lote, caja, numero_equipo, origen_fila, con_2_0)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [clientePartido.limpio || null, equipo.fechaDespacho, null, equipo.wifi, equipo.eth || null,
            equipo.lote, equipo.caja, equipo.numero, filaMac, marcaMac]
        );
        equipo.mysqlId = altaMac.insertId;
      }
      if (equipo.cliente) await asegurarCliente(conn, equipo.cliente);
      macsGuardadas += 1;
    }
    if (soloMac) {
      if (razon) await asegurarCliente(conn, razon);
      await conn.commit();
      return res.json({
        ok: true,
        planilla: macEnPlanilla > 0,
        macs: macsGuardadas,
        aviso: (macEnPlanilla
          ? `Quedó en ${hojasMac.join(" y ") || "la planilla de MAC"} y en MySQL.`
          : "Quedó en MySQL. Google todavía no deja editar la planilla.")
          + (quiereLite ? " La marca 2.0 quedó aparte del nombre." : ""),
        ocupadas,
        avisoOcupadas: avisoOcupadas(ocupadas),
      });
    }
    if (origenFila === null) {
      const [[fila]] = await conn.query(
        "SELECT COALESCE(MIN(origen_fila), 0) - 1 AS fila FROM movimientos_cantidad WHERE origen_hoja = 'SITIO' FOR UPDATE"
      );
      origenFila = fila.fila;
    }
    const [alta] = await conn.query(
      `INSERT INTO movimientos_cantidad
         (categoria_id, fecha, estado, remito, factura, razon_social, ticket, motivo,
          ingreso, egreso, origen_hoja, origen_fila, con_2_0)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [categoria.id, fecha, estado, remito, factura, razonPartida.limpio, ticket, motivo,
        ingreso || null, egreso || null, origenHoja, origenFila,
        quiereLite ? textoLite(familiaDe(categoria.nombre) || req.body.mac_familia || "EBD") : razonPartida.marca]
    );
    for (const equipo of equiposParaGuardar) {
      if (!equipo.mysqlId || !alta.insertId) continue;
      const destinoMac = MAC_TABLAS[`${equipo.familia}|${equipo.operacion}`];
      await conn.query(
        `UPDATE ${destinoMac.tabla} SET movimiento_id = ? WHERE id = ?`,
        [alta.insertId, equipo.mysqlId]
      );
    }
    await conn.query(
      `UPDATE categorias_stock
       SET cantidad_actual = COALESCE(cantidad_actual, 0) + ? - ?
       WHERE id = ?`,
      [ingreso, egreso, categoria.id]
    );
    await asegurarCliente(conn, razon);
    await conn.commit();
    const avisoMac = macsGuardadas
      ? (macEnPlanilla
        ? ` También quedó en ${hojasMac.join(" y ") || "la planilla de MAC"}.`
        : " La MAC quedó en MySQL.")
      : "";
    const avisoLibre = avisoOcupadas(ocupadas);
    res.json({
      ok: true,
      planilla: enPlanilla || macEnPlanilla > 0,
      macs: macsGuardadas,
      aviso: (enPlanilla
        ? "Quedó en la planilla STOCK 2026 y en MySQL."
        : "Quedó en MySQL. Google todavía no deja editar la planilla.") + avisoMac,
      ocupadas,
      avisoOcupadas: avisoLibre,
    });
  } catch (error) {
    try { await conn.rollback(); } catch (_) { /* sin transacción abierta */ }
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ese renglón ya está cargado en la planilla." });
    }
    res.status(500).json({ error: "No se pudo registrar el movimiento." });
  } finally {
    conn.release();
  }
});

module.exports = router;
module.exports.volcarPendientes = volcarPendientes;
