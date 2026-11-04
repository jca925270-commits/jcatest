const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const NOTAS_CLIENTE = /factura|comodato|garantia|falla|debe |sin garant|lleva |carrito|en su lugar|patricio|2\.0/i;
const CLIENTE_APARTE = /TOTAL DE D3|STOCK CONTROLADO AL|CAMPIÑA A OFICINA/i;

function claveCliente(valor) {
  const original = String(valor || "");
  const sinAcento = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (CLIENTE_APARTE.test(original)) {
    return sinAcento(original.toUpperCase()).replace(/[.,\-–—_/&'’]/g, " ").split(/\s+/).filter(Boolean).join(" ");
  }
  const sinNotas = original.replace(/\(([^)]*)\)/g, (todo, dentro) => (
    NOTAS_CLIENTE.test(sinAcento(dentro)) ? " " : todo
  ));
  const texto = sinAcento(sinNotas.toUpperCase())
    .replace(/[.,\-–—_/&'’]/g, " ")
    .replace(/\bS\s+A\s+S\b/g, "SAS")
    .replace(/\bS\s+R\s+L\b/g, "SRL")
    .replace(/\bS\s+A\b/g, "SA");
  return texto.split(/\s+/).filter(Boolean).sort().join(" ");
}

function mismoCliente(nombre, clave) {
  return Boolean(clave) && claveCliente(nombre) === clave;
}

function cantidadTexto(ingreso, egreso) {
  const partes = [];
  if (ingreso) partes.push(`Ingreso ${ingreso}`);
  if (egreso) partes.push(`Egreso ${egreso}`);
  return partes.join(", ");
}

function familiaVisible(nombre) {
  const texto = String(nombre || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (texto.includes("BLACK")) return "Blackbox";
  if (texto.includes("D3+")) return "D3+";
  if (texto.includes("D3")) return "D3";
  if (texto.includes("PANTALLA")) return "Pantallas";
  if (texto.includes("DONGLE")) return "Dongles";
  if (texto.includes("CAMARA")) return "Cámaras";
  if (texto.includes("CUBE")) return "CUBE";
  if (texto.includes("EBD")) return "EBD";
  return "";
}

function deltaPosesion(estado, ingreso, egreso) {
  const op = String(estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const entro = Number(ingreso) || 0;
  const salio = Number(egreso) || 0;
  if (op.includes("DEVOL") || op.includes("REPAR") || op.includes("BAJA")) return -(entro + salio);
  if (
    op.includes("VENTA") || op.includes("COMODATO") || op.includes("PRUEB") ||
    op.includes("REEMPLAZO") || op.includes("GARANT")
  ) return salio - entro;
  return 0;
}

function resumirPosesion(planilla, equiposMac) {
  const neto = {};
  for (const fila of planilla) {
    const nombre = familiaVisible(fila.categoria);
    if (!nombre) continue;
    const cambio = deltaPosesion(fila.estado, fila.ingreso, fila.egreso);
    if (!cambio) continue;
    neto[nombre] = (neto[nombre] || 0) + cambio;
  }
  const conocidos = {};
  const tiene = {};
  for (const fila of equiposMac) {
    const nombre = familiaVisible(fila.tipo);
    if (!nombre) continue;
    conocidos[nombre] = (conocidos[nombre] || 0) + 1;
    if (Number(fila.actual) === 1 && ["vendido", "comodato", "prueba"].includes(fila.estado)) {
      tiene[nombre] = (tiene[nombre] || 0) + 1;
    }
  }
  return [...new Set([...Object.keys(neto), ...Object.keys(conocidos)])]
    .map((tipo) => {
      const planillaNeta = Math.max(0, neto[tipo] || 0);
      const cantidad = conocidos[tipo]
        ? (tiene[tipo] || 0) + Math.max(0, planillaNeta - conocidos[tipo])
        : planillaNeta;
      return { tipo, cantidad };
    })
    .filter((item) => item.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad || a.tipo.localeCompare(b.tipo, "es"));
}

function operacionDe(valor) {
  const texto = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (texto.includes("COMODATO")) return "COMODATO";
  if (texto.includes("GARANT")) return "GARANTIA";
  if (texto.includes("DEVOL")) return "DEVOLUCION";
  if (texto.includes("PRUEB")) return "PRUEBA";
  if (texto.includes("VENTA")) return "VENTA";
  return "";
}

function macClave(wifi, eth) {
  const limpia = (valor) => String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const a = limpia(wifi);
  const b = limpia(eth);
  if (!a && !b) return "";
  return `${a}|${b}`;
}

router.get("/ficha", async (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: "Falta el cliente." });
  try {
    const [[cliente]] = await pool.query(
      "SELECT id, razon_social, email, entidad, sucursal FROM clientes WHERE id = ?",
      [id]
    );
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
    const clave = claveCliente(cliente.razon_social);

    const [equiposMac] = await pool.query(
      `SELECT d.id, d.mac_wifi, d.mac_eth, d.estado, t.nombre AS tipo, dep.nombre AS deposito,
              CASE WHEN d.cliente_actual_id = ? THEN 1 ELSE 0 END AS actual
       FROM dispositivos d
       LEFT JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
       LEFT JOIN depositos dep ON dep.id_deposito = d.deposito_actual_id
       WHERE d.cliente_actual_id = ?
          OR d.id IN (SELECT dispositivo_id FROM movimientos WHERE cliente_id = ?)
       ORDER BY actual DESC, d.id DESC`,
      [id, id, id]
    );
    const [movimientosMac] = await pool.query(
      `SELECT DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.tipo_movimiento, m.motivo, m.remito, m.factura,
              d.id AS dispositivo_id, d.mac_wifi, d.mac_eth, t.nombre AS tipo
       FROM movimientos m
       LEFT JOIN dispositivos d ON d.id = m.dispositivo_id
       LEFT JOIN tipos_equipo t ON t.id = d.tipo_equipo_id
       WHERE m.cliente_id = ?
       ORDER BY m.fecha DESC
       LIMIT 500`,
      [id]
    );
    const [planilla] = await pool.query(
      `SELECT DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.estado, c.nombre AS categoria, c.pais,
              m.remito, m.factura, m.razon_social, m.ticket, m.motivo, m.ingreso, m.egreso
       FROM movimientos_cantidad m
       JOIN categorias_stock c ON c.id = m.categoria_id
       WHERE m.razon_social IS NOT NULL AND TRIM(m.razon_social) <> ''`
    );
    const [ingresos] = await pool.query(
      `SELECT DATE_FORMAT(fecha_ingreso, '%Y-%m-%d') AS fecha, razon_social, razsocial_agreg, dispositivo_ingreso AS dispositivo,
              estado_ingreso AS estado, mac_wifi, mac_eth, deposito, caja, motivo
       FROM ingreso_soporte
       WHERE NULLIF(TRIM(razon_social), '') IS NOT NULL OR NULLIF(TRIM(razsocial_agreg), '') IS NOT NULL`
    );
    const [egresos] = await pool.query(
      `SELECT DATE_FORMAT(fecha_egreso, '%Y-%m-%d') AS fecha, razon_social, razsocial_agreg, dispositivo_egreso AS dispositivo,
              estado_egreso AS estado, mac_wifi, mac_eth, deposito, caja, motivo
       FROM egreso_soporte
       WHERE NULLIF(TRIM(razon_social), '') IS NOT NULL OR NULLIF(TRIM(razsocial_agreg), '') IS NOT NULL`
    );
    let trazas = [];
    try {
      const [filasTraza] = await pool.query(
        `SELECT 'EBD' AS tipo, cliente AS razon_social, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha,
                mac_wifi, mac_eth
         FROM trazabilidad_egreso_ebd
         WHERE NULLIF(TRIM(cliente), '') IS NOT NULL
         UNION ALL
         SELECT 'D3', cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d'), mac_wifi, mac_eth
         FROM trazabilidad_egreso_d3
         WHERE NULLIF(TRIM(cliente), '') IS NOT NULL
         UNION ALL
         SELECT 'EBD reparado', cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d'), mac_wifi, mac_eth
         FROM trazabilidad_egreso_ebd_reparado
         WHERE NULLIF(TRIM(cliente), '') IS NOT NULL
         UNION ALL
         SELECT 'Pantalla', cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d'), mac_wifi, mac_eth
         FROM trazabilidad_egreso_pantalla
         WHERE NULLIF(TRIM(cliente), '') IS NOT NULL
         UNION ALL
         SELECT 'EBD uso interno', cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d'), mac_wifi, mac_eth
         FROM trazabilidad_egreso_ebd_interno
         WHERE NULLIF(TRIM(cliente), '') IS NOT NULL`
      );
      trazas = filasTraza;
    } catch (_) {
      trazas = [];
    }

    const dePlanilla = planilla.filter((fila) => mismoCliente(fila.razon_social, clave));
    const deSoporte = (filas, tipo) => filas
      .filter((fila) => mismoCliente(fila.razon_social, clave) || mismoCliente(fila.razsocial_agreg, clave))
      .map((fila) => ({ ...fila, tipo_movimiento: tipo }));

    const soporte = [
      ...deSoporte(ingresos, "ingreso_soporte"),
      ...deSoporte(egresos, "egreso_soporte"),
    ];

    const equipos = [];
    const macsVistas = new Set();
    const sumarEquipo = (fila) => {
      const mac = macClave(fila.mac_wifi, fila.mac_eth);
      if (mac) {
        if (macsVistas.has(mac)) return;
        macsVistas.add(mac);
      }
      equipos.push(fila);
    };

    const porDispositivo = new Map();
    for (const fila of movimientosMac) {
      const operacion = operacionDe(fila.tipo_movimiento);
      if (!operacion || !fila.dispositivo_id) continue;
      if (!porDispositivo.has(fila.dispositivo_id)) porDispositivo.set(fila.dispositivo_id, { ...fila, operacion });
    }
    for (const fila of porDispositivo.values()) {
      sumarEquipo({
        razon_social: cliente.razon_social,
        fecha: fila.fecha,
        factura: fila.factura || "",
        remito: fila.remito || "",
        cantidad: 1,
        tipo: fila.tipo || "",
        operacion: fila.operacion,
        mac_wifi: fila.mac_wifi || "",
        mac_eth: fila.mac_eth || "",
      });
    }

    for (const fila of dePlanilla) {
      const operacion = operacionDe(fila.estado);
      if (!operacion) continue;
      const cantidad = Number(fila.egreso) || Number(fila.ingreso) || 0;
      equipos.push({
        razon_social: fila.razon_social || cliente.razon_social,
        fecha: fila.fecha,
        factura: fila.factura || "",
        remito: fila.remito || "",
        cantidad,
        tipo: [fila.categoria, fila.pais].filter(Boolean).join(" · "),
        operacion,
        mac_wifi: "",
        mac_eth: "",
      });
    }

    for (const fila of soporte) {
      const operacion = operacionDe(fila.estado);
      if (!operacion) continue;
      sumarEquipo({
        razon_social: fila.razon_social || fila.razsocial_agreg || cliente.razon_social,
        fecha: fila.fecha,
        factura: "",
        remito: "",
        cantidad: 1,
        tipo: fila.dispositivo || "",
        operacion,
        mac_wifi: fila.mac_wifi || "",
        mac_eth: fila.mac_eth || "",
      });
    }

    for (const fila of trazas) {
      if (!mismoCliente(fila.razon_social, clave)) continue;
      sumarEquipo({
        razon_social: fila.razon_social || cliente.razon_social,
        fecha: fila.fecha,
        factura: "",
        remito: "",
        cantidad: 1,
        tipo: fila.tipo,
        operacion: "",
        mac_wifi: fila.mac_wifi || "",
        mac_eth: fila.mac_eth || "",
      });
    }

    for (const fila of equiposMac) {
      if (!fila.actual) continue;
      sumarEquipo({
        razon_social: cliente.razon_social,
        fecha: "",
        factura: "",
        remito: "",
        cantidad: 1,
        tipo: fila.tipo || "",
        operacion: operacionDe(fila.estado),
        mac_wifi: fila.mac_wifi || "",
        mac_eth: fila.mac_eth || "",
      });
    }

    equipos.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

    const movimientos = [
      ...movimientosMac,
      ...dePlanilla.map((fila) => ({
        fecha: fila.fecha,
        tipo_movimiento: fila.estado,
        mac_wifi: "",
        mac_eth: "",
        motivo: [fila.categoria, fila.pais, cantidadTexto(fila.ingreso, fila.egreso), fila.motivo].filter(Boolean).join(" · "),
        remito: fila.remito,
        factura: fila.factura,
      })),
      ...soporte.map((fila) => ({
        fecha: fila.fecha,
        tipo_movimiento: fila.tipo_movimiento,
        mac_wifi: fila.mac_wifi,
        mac_eth: fila.mac_eth,
        motivo: [fila.dispositivo, fila.estado, fila.deposito, fila.caja, fila.motivo].filter(Boolean).join(" · "),
        remito: "",
        factura: "",
      })),
    ].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

    res.json({
      cliente,
      posesion: resumirPosesion(dePlanilla, equiposMac),
      equipos,
      movimientos,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const soloPlanilla = req.query.planilla === "1";
    const filtroPlanilla = soloPlanilla ? " AND planilla = 1" : "";
    let rows;
    if (q) {
      [rows] = await pool.query(
        `SELECT * FROM clientes WHERE razon_social LIKE ?${filtroPlanilla} ORDER BY razon_social LIMIT 500`,
        [`%${q}%`]
      );
    } else {
      [rows] = await pool.query(
        `SELECT * FROM clientes WHERE 1=1${filtroPlanilla} ORDER BY razon_social LIMIT 5000`
      );
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  if (!b.razon_social) return res.status(400).json({ error: "razon_social es obligatoria" });
  try {
    const [result] = await pool.query(
      "INSERT INTO clientes (razon_social, email, entidad, sucursal) VALUES (?,?,?,?)",
      [b.razon_social, b.email || null, b.entidad || null, b.sucursal || null]
    );
    res.json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const b = req.body;
  const id = parseInt(b.id);
  if (!id) return res.status(400).json({ error: "Falta id" });
  try {
    await pool.query(
      "UPDATE clientes SET razon_social=?, email=?, entidad=?, sucursal=? WHERE id=?",
      [b.razon_social, b.email || null, b.entidad || null, b.sucursal || null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.claveCliente = claveCliente;
