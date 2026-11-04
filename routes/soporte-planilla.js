const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const COLUMNAS_EXTRA = [
  ["dispositivo_extra", "VARCHAR(120) NULL"],
  ["mac_extra", "VARCHAR(80) NULL"],
  ["mac_wifi_extra", "VARCHAR(20) NULL"],
  ["mac_eth_extra", "VARCHAR(20) NULL"],
];
const COLUMNAS_INGRESO = [
  ["deposito", "VARCHAR(120) NULL"],
  ["caja", "VARCHAR(40) NULL"],
  ["origen", "VARCHAR(20) NOT NULL DEFAULT 'planilla'"],
  ["editado_en_sitio", "TINYINT NOT NULL DEFAULT 0"],
  ...COLUMNAS_EXTRA,
];
const COLUMNAS_QUITAR_INGRESO = ["perifericos", "codigo_seguimiento", "lote", "remito", "factura", "num_ticket"];
const COLUMNAS_EGRESO = [
  ["deposito", "VARCHAR(120) NULL"],
  ["caja", "VARCHAR(40) NULL"],
  ["motivo", "VARCHAR(255) NULL"],
  ["origen", "VARCHAR(20) NOT NULL DEFAULT 'planilla'"],
  ["editado_en_sitio", "TINYINT NOT NULL DEFAULT 0"],
  ...COLUMNAS_EXTRA,
];

async function asegurarColumnas(tabla, columnas) {
  for (const [nombre, tipo] of columnas) {
    const [[{ c }]] = await pool.query(
      `SELECT COUNT(*) c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tabla, nombre]
    );
    if (!Number(c)) {
      try {
        await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo}`);
      } catch (e) {
        if (e.code !== "ER_DUP_FIELDNAME") throw e;
      }
    }
  }
}

async function asegurarColumnasIngreso() {
  await asegurarColumnas("ingreso_soporte", COLUMNAS_INGRESO);
  for (const nombre of COLUMNAS_QUITAR_INGRESO) {
    const [[{ c }]] = await pool.query(
      `SELECT COUNT(*) c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingreso_soporte' AND COLUMN_NAME = ?`,
      [nombre]
    );
    if (Number(c)) await pool.query(`ALTER TABLE ingreso_soporte DROP COLUMN ${nombre}`);
  }
}

async function asegurarColumnasEgreso() {
  await asegurarColumnas("egreso_soporte", COLUMNAS_EGRESO);
}

function texto(valor, max) {
  const limpio = String(valor ?? "").trim();
  if (!limpio) return null;
  return limpio.slice(0, max);
}

function macsDe(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const macs = [];
  for (let i = 0; i + 12 <= limpio.length && macs.length < 2; i += 12) {
    macs.push(limpio.slice(i, i + 12));
  }
  return macs;
}

async function asegurarInstanciaManual() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS instancia_soporte (
       id INT AUTO_INCREMENT PRIMARY KEY,
       tipo ENUM('ingreso','egreso') NOT NULL,
       planilla_id INT NOT NULL,
       instancia VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
       actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       UNIQUE KEY uq_instancia_fila (tipo, planilla_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await pool.query(
    `ALTER TABLE instancia_soporte
     MODIFY instancia VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`
  );
}

const CONSULTAS = {
  ingreso: `SELECT i.id, DATE_FORMAT(i.fecha_ingreso, '%Y-%m-%d') AS fecha, i.fecha_ingreso_texto AS fecha_texto,
      i.razsocial_agreg, i.razon_social, i.dispositivo_ingreso AS dispositivo, i.estado_ingreso AS estado,
      i.mac, NULL AS envio_retiro, i.correo_ingreso AS correo, i.segui_ingreso AS seguimiento,
      i.obs_encomienda_ingreso AS observacion, i.con_soporte_ingreso AS contacto,
      i.motivo, COALESCE(o.instancia, i.instancia_gestion) AS instancia_gestion,
      i.mac_wifi, i.mac_eth, i.deposito, i.caja, i.origen
    FROM ingreso_soporte i
    LEFT JOIN instancia_soporte o ON o.tipo = 'ingreso' AND o.planilla_id = i.id
    ORDER BY i.fecha_ingreso IS NULL, i.fecha_ingreso DESC, i.origen_fila DESC`,
  egreso: `SELECT e.id, DATE_FORMAT(e.fecha_egreso, '%Y-%m-%d') AS fecha, e.fecha_egreso_texto AS fecha_texto,
      e.razsocial_agreg, e.razon_social, e.dispositivo_egreso AS dispositivo, e.estado_egreso AS estado,
      e.mac, e.envio_retiro, e.correo_egreso AS correo, e.segui_egreso AS seguimiento,
      e.num_ticket, e.obs_encomienda_egreso AS observacion, e.con_soporte_egreso AS contacto,
      e.motivo, COALESCE(o.instancia, e.instancia_gestion) AS instancia_gestion,
      e.mac_wifi, e.mac_eth, e.deposito, e.caja
    FROM egreso_soporte e
    LEFT JOIN instancia_soporte o ON o.tipo = 'egreso' AND o.planilla_id = e.id
    ORDER BY e.fecha_egreso IS NULL, e.fecha_egreso DESC, e.origen_fila DESC`,
};

router.get("/opciones", async (req, res) => {
  try {
    await asegurarColumnasIngreso();
    await asegurarColumnasEgreso();
    const unir = async (sqls) => {
      const vistos = new Set();
      for (const sql of sqls) {
        const [rows] = await pool.query(sql);
        for (const fila of rows) if (fila.v) vistos.add(fila.v);
      }
      return [...vistos].sort((a, b) => String(a).localeCompare(String(b), "es"));
    };
    const [tipos] = await pool.query("SELECT nombre FROM tipos_equipo ORDER BY nombre");
    const [depositos] = await pool.query("SELECT nombre FROM depositos ORDER BY nombre");
    const dispositivosHoja = await unir([
      "SELECT DISTINCT dispositivo_ingreso AS v FROM ingreso_soporte WHERE dispositivo_ingreso IS NOT NULL AND dispositivo_ingreso <> ''",
      "SELECT DISTINCT dispositivo_egreso AS v FROM egreso_soporte WHERE dispositivo_egreso IS NOT NULL AND dispositivo_egreso <> ''",
    ]);
    const dispositivos = [...new Set([...dispositivosHoja, ...tipos.map((t) => t.nombre)])].sort((a, b) => a.localeCompare(b, "es"));
    const [clientes] = await pool.query(
      "SELECT DISTINCT TRIM(razon_social) AS v FROM clientes WHERE razon_social IS NOT NULL AND TRIM(razon_social) <> ''"
    );
    const vistas = new Map();
    for (const fila of clientes) {
      const nombre = String(fila.v || "").trim();
      const clave = nombre.toLocaleLowerCase("es");
      if (nombre && !vistas.has(clave)) vistas.set(clave, nombre);
    }
    const razones = [...vistas.values()].sort((a, b) => a.localeCompare(b, "es"));
    const envios = await unir([
      "SELECT DISTINCT envio_retiro AS v FROM egreso_soporte WHERE envio_retiro IS NOT NULL AND envio_retiro <> ''",
    ]);
    for (const base of ["Envío", "Retiro"]) {
      if (!envios.some((v) => v.toLocaleLowerCase("es") === base.toLocaleLowerCase("es"))) envios.push(base);
    }
    envios.sort((a, b) => a.localeCompare(b, "es"));
    res.json({
      razones,
      dispositivos,
      estados: await unir([
        "SELECT DISTINCT estado_ingreso AS v FROM ingreso_soporte WHERE estado_ingreso IS NOT NULL AND estado_ingreso <> ''",
        "SELECT DISTINCT estado_egreso AS v FROM egreso_soporte WHERE estado_egreso IS NOT NULL AND estado_egreso <> ''",
      ]),
      carriers: await unir([
        "SELECT DISTINCT correo_ingreso AS v FROM ingreso_soporte WHERE correo_ingreso IS NOT NULL AND correo_ingreso <> ''",
        "SELECT DISTINCT correo_egreso AS v FROM egreso_soporte WHERE correo_egreso IS NOT NULL AND correo_egreso <> ''",
      ]),
      instancias: await unir([
        "SELECT DISTINCT instancia_gestion AS v FROM ingreso_soporte WHERE instancia_gestion IS NOT NULL AND instancia_gestion <> ''",
        "SELECT DISTINCT instancia_gestion AS v FROM egreso_soporte WHERE instancia_gestion IS NOT NULL AND instancia_gestion <> ''",
      ]),
      envios,
      depositos: depositos.map((d) => d.nombre),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function armarDispositivo(d) {
  const dispositivo = texto(d.dispositivo, 120) || texto(d.dispositivo_otro, 120);
  const partesMac = macsDe(d.mac);
  const macWifi = macsDe(d.mac_wifi)[0] || partesMac[0] || null;
  const macEth = macsDe(d.mac_eth)[0] || partesMac[1] || null;
  const mac = [macWifi, macEth].filter(Boolean).join("") || null;
  return {
    dispositivo,
    estado: texto(d.estado, 80),
    caja: texto(d.caja, 40),
    mac,
    macWifi,
    macEth,
  };
}

function equipoUtil(d) {
  return Boolean(d.dispositivo || d.mac || d.macWifi || d.macEth || d.estado || d.caja);
}

function completarEquipo(d) {
  const equipo = armarDispositivo(d || {});
  if (!equipo.macWifi) equipo.macWifi = texto(d && d.mac_wifi, 20);
  if (!equipo.macEth) equipo.macEth = texto(d && d.mac_eth, 20);
  equipo.mac = [equipo.macWifi, equipo.macEth].filter(Boolean).join("") || texto(d && d.mac, 80);
  return equipo;
}

function claveEquipo(e) {
  const wifi = String(e.macWifi || e.mac_wifi || "").toUpperCase();
  const eth = String(e.macEth || e.mac_eth || "").toUpperCase();
  if (wifi || eth) return `mac:${wifi}|${eth}`;
  const nombre = String(e.dispositivo || "").trim().toLocaleLowerCase("es");
  const caja = String(e.caja || "").trim().toLocaleLowerCase("es");
  const estado = String(e.estado || "").trim().toLocaleLowerCase("es");
  if (!nombre && !caja && !estado) return "";
  return `disp:${nombre}|${caja}|${estado}`;
}

function equiposUnicos(equipos) {
  const vistos = new Set();
  return equipos.filter((equipo) => {
    const clave = claveEquipo(equipo);
    if (!clave) return true;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function equiposDe(b) {
  const crudos = Array.isArray(b.dispositivos) && b.dispositivos.length ? b.dispositivos : [b];
  const equipos = equiposUnicos(crudos.map(completarEquipo).filter(equipoUtil));
  return equipos.length ? equipos : [completarEquipo(crudos[0] || {})];
}

async function yaCargados(conn, tipo, cliente, fecha, exceptoId) {
  if (!cliente) return [];
  const tabla = tipo === "ingreso" ? "ingreso_soporte" : "egreso_soporte";
  const dispositivo = tipo === "ingreso" ? "dispositivo_ingreso" : "dispositivo_egreso";
  const fechaCol = tipo === "ingreso" ? "fecha_ingreso" : "fecha_egreso";
  const [rows] = await conn.query(
    `SELECT ${dispositivo} AS dispositivo, mac_wifi, mac_eth, caja
     FROM ${tabla}
     WHERE LOWER(TRIM(COALESCE(NULLIF(TRIM(razon_social), ''), NULLIF(TRIM(razsocial_agreg), ''), ''))) = LOWER(?)
       AND ${fechaCol} <=> ?
       ${exceptoId ? "AND id <> ?" : ""}`,
    exceptoId ? [cliente, fecha, exceptoId] : [cliente, fecha]
  );
  return rows;
}

function sinRepetir(existentes, equipos) {
  const claves = new Set(existentes.map(claveEquipo).filter(Boolean));
  const vistos = new Set();
  return equipos.filter((equipo) => {
    const clave = claveEquipo(equipo);
    if (!clave) return true;
    if (claves.has(clave) || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

let separacionLista = null;

function asegurarSeparacion() {
  if (!separacionLista) {
    separacionLista = separarDispositivosExtra().catch((error) => {
      separacionLista = null;
      throw error;
    });
  }
  return separacionLista;
}

async function reservarOrigen(conn, tabla) {
  const [[fila]] = await conn.query(
    `SELECT COALESCE(MIN(CASE WHEN origen_fila < 0 THEN origen_fila END), 0) AS n FROM ${tabla} FOR UPDATE`
  );
  return Number(fila.n);
}

async function separarDispositivosExtra() {
  await asegurarColumnasIngreso();
  await asegurarColumnasEgreso();
  await separarExtrasDe("ingreso");
  await separarExtrasDe("egreso");
}

async function separarExtrasDe(tipo) {
  const ingreso = tipo === "ingreso";
  const tabla = ingreso ? "ingreso_soporte" : "egreso_soporte";
  const dispositivo = ingreso ? "dispositivo_ingreso" : "dispositivo_egreso";
  const estado = ingreso ? "estado_ingreso" : "estado_egreso";
  const fecha = ingreso ? "fecha_ingreso" : "fecha_egreso";
  const fechaTexto = ingreso ? "fecha_ingreso_texto" : "fecha_egreso_texto";
  const seguimiento = ingreso ? "segui_ingreso" : "segui_egreso";
  const correo = ingreso ? "correo_ingreso" : "correo_egreso";
  const observacion = ingreso ? "obs_encomienda_ingreso" : "obs_encomienda_egreso";
  const contacto = ingreso ? "con_soporte_ingreso" : "con_soporte_egreso";
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query(
      `SELECT * FROM ${tabla}
       WHERE NULLIF(TRIM(dispositivo_extra), '') IS NOT NULL
          OR NULLIF(TRIM(mac_extra), '') IS NOT NULL
          OR NULLIF(TRIM(mac_wifi_extra), '') IS NOT NULL
          OR NULLIF(TRIM(mac_eth_extra), '') IS NOT NULL
       FOR UPDATE`
    );
    let origenFila = filas.length ? await reservarOrigen(conn, tabla) : 0;
    for (const fila of filas) {
      origenFila -= 1;
      const macWifi = texto(fila.mac_wifi_extra, 20);
      const macEth = texto(fila.mac_eth_extra, 20);
      const mac = texto(fila.mac_extra, 80) || [macWifi, macEth].filter(Boolean).join("") || null;
      const columnas = [
        fecha, fechaTexto, "razsocial_agreg", "razon_social", dispositivo, estado,
        "mac", seguimiento, correo, observacion, contacto, "motivo", "instancia_gestion",
        "mac_wifi", "mac_eth", "deposito", "caja",
      ];
      const valores = [
        fila[fecha], fila[fechaTexto], fila.razsocial_agreg, fila.razon_social,
        texto(fila.dispositivo_extra, 120), null,
        mac, fila[seguimiento], fila[correo], fila[observacion], fila[contacto],
        fila.motivo, fila.instancia_gestion, macWifi, macEth, fila.deposito, null,
      ];
      if (!ingreso) {
        columnas.push("envio_retiro", "num_ticket");
        valores.push(fila.envio_retiro, fila.num_ticket);
      }
      columnas.push("origen", "origen_fila", "editado_en_sitio");
      valores.push("sitio", origenFila, 1);
      await conn.query(
        `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
        valores
      );
      await conn.query(
        `UPDATE ${tabla}
         SET dispositivo_extra = NULL, mac_extra = NULL, mac_wifi_extra = NULL, mac_eth_extra = NULL
         WHERE id = ?`,
        [fila.id]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function fechaDe(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))
    ? valor
    : new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

async function guardarClienteNuevo(conn, razonNueva) {
  if (!razonNueva) return;
  const [[ya]] = await conn.query(
    "SELECT id FROM clientes WHERE LOWER(TRIM(razon_social)) = LOWER(?) LIMIT 1",
    [razonNueva]
  );
  if (!ya) await conn.query("INSERT INTO clientes (razon_social, planilla) VALUES (?, 0)", [razonNueva]);
}

router.post("/ingreso", requerirRol(["admin", "operador"]), async (req, res) => {
  try {
    await asegurarColumnasIngreso();
    await asegurarSeparacion();
    const b = req.body || {};
    const razonLista = texto(String(b.razon_social || "").replace(/\s+/g, " "), 200);
    const razonNueva = texto(String(b.razsocial_agreg || "").replace(/\s+/g, " "), 200);
    const razon = razonLista || razonNueva;
    const equipos = equiposDe(b);
    const hayEquipo = equipos.some(equipoUtil);
    if (!razon && !hayEquipo) {
      return res.status(400).json({ error: "Completá al menos la razón social, el dispositivo o una MAC." });
    }
    const fecha = fechaDe(b.fecha);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const existentes = await yaCargados(conn, "ingreso", razon, fecha);
      const pedidos = equipos.filter(equipoUtil);
      const aGuardar = pedidos.length ? sinRepetir(existentes, pedidos) : equipos.slice(0, 1);
      const omitidos = pedidos.length - (pedidos.length ? aGuardar.length : 0);
      if (!aGuardar.length) {
        await conn.rollback();
        return res.status(409).json({ error: "Ese equipo ya está cargado para este cliente en esa fecha." });
      }
      let origenFila = await reservarOrigen(conn, "ingreso_soporte");
      await guardarClienteNuevo(conn, razonNueva);
      for (const equipo of aGuardar) {
        origenFila -= 1;
        await conn.query(
          `INSERT INTO ingreso_soporte (
             fecha_ingreso, razsocial_agreg, razon_social, dispositivo_ingreso, estado_ingreso,
             mac, segui_ingreso, correo_ingreso, obs_encomienda_ingreso,
             con_soporte_ingreso, motivo, instancia_gestion, mac_wifi, mac_eth,
             deposito, caja, origen, origen_fila, editado_en_sitio
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sitio', ?, 1)`,
          [
            fecha,
            razonNueva,
            razon,
            equipo.dispositivo,
            equipo.estado,
            equipo.mac,
            texto(b.seguimiento, 80),
            texto(b.correo, 80) || texto(b.correo_otro, 80),
            texto(b.observacion, 4000),
            texto(b.contacto, 255),
            texto(b.motivo, 255),
            texto(b.instancia_gestion, 80) || "PENDIENTE",
            equipo.macWifi,
            equipo.macEth,
            texto(b.deposito, 120),
            equipo.caja,
            origenFila,
          ]
        );
      }
      await conn.commit();
      res.status(201).json({ ok: true, cantidad: aGuardar.length, omitidos });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/egreso", requerirRol(["admin", "operador"]), async (req, res) => {
  try {
    await asegurarColumnasEgreso();
    await asegurarSeparacion();
    const b = req.body || {};
    const razonLista = texto(String(b.razon_social || "").replace(/\s+/g, " "), 200);
    const razonNueva = texto(String(b.razsocial_agreg || "").replace(/\s+/g, " "), 200);
    const razon = razonLista || razonNueva;
    const equipos = equiposDe(b);
    const hayEquipo = equipos.some(equipoUtil);
    if (!razon && !hayEquipo) {
      return res.status(400).json({ error: "Completá al menos la razón social, el dispositivo o una MAC." });
    }
    const fecha = fechaDe(b.fecha);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const existentes = await yaCargados(conn, "egreso", razon, fecha);
      const pedidos = equipos.filter(equipoUtil);
      const aGuardar = pedidos.length ? sinRepetir(existentes, pedidos) : equipos.slice(0, 1);
      const omitidos = pedidos.length - (pedidos.length ? aGuardar.length : 0);
      if (!aGuardar.length) {
        await conn.rollback();
        return res.status(409).json({ error: "Ese equipo ya está cargado para este cliente en esa fecha." });
      }
      let origenFila = await reservarOrigen(conn, "egreso_soporte");
      await guardarClienteNuevo(conn, razonNueva);
      for (const equipo of aGuardar) {
        origenFila -= 1;
        await conn.query(
          `INSERT INTO egreso_soporte (
             fecha_egreso, razsocial_agreg, razon_social, dispositivo_egreso, estado_egreso,
             mac, envio_retiro, correo_egreso, segui_egreso, obs_encomienda_egreso,
             con_soporte_egreso, motivo, instancia_gestion, mac_wifi, mac_eth,
             deposito, caja, origen, origen_fila, editado_en_sitio
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sitio', ?, 1)`,
          [
            fecha,
            razonNueva,
            razon,
            equipo.dispositivo,
            equipo.estado,
            equipo.mac,
            texto(b.envio_retiro, 80) || texto(b.envio_otro, 80),
            texto(b.correo, 80) || texto(b.correo_otro, 80),
            texto(b.seguimiento, 80),
            texto(b.observacion, 4000),
            texto(b.contacto, 255),
            texto(b.motivo, 255),
            texto(b.instancia_gestion, 80) || "PENDIENTE",
            equipo.macWifi,
            equipo.macEth,
            texto(b.deposito, 120),
            equipo.caja,
            origenFila,
          ]
        );
      }
      await conn.commit();
      res.status(201).json({ ok: true, cantidad: aGuardar.length, omitidos });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/instancias", async (req, res) => {
  try {
    await asegurarColumnasIngreso();
    await asegurarColumnasEgreso();
    await asegurarInstanciaManual();
    const [rows] = await pool.query(
      `SELECT * FROM (
         SELECT 'ingreso' AS tipo, i.id,
                DATE_FORMAT(i.fecha_ingreso, '%Y-%m-%d') AS fecha,
                COALESCE(NULLIF(TRIM(i.razon_social), ''), NULLIF(TRIM(i.razsocial_agreg), '')) AS cliente,
                i.dispositivo_ingreso AS dispositivo,
                i.mac_wifi, i.mac_eth,
                COALESCE(o.instancia, NULLIF(TRIM(i.instancia_gestion), '')) COLLATE utf8mb4_unicode_ci AS instancia
         FROM ingreso_soporte i
         LEFT JOIN instancia_soporte o ON o.tipo = 'ingreso' AND o.planilla_id = i.id
         UNION ALL
         SELECT 'egreso', e.id,
                DATE_FORMAT(e.fecha_egreso, '%Y-%m-%d'),
                COALESCE(NULLIF(TRIM(e.razon_social), ''), NULLIF(TRIM(e.razsocial_agreg), '')),
                e.dispositivo_egreso,
                e.mac_wifi, e.mac_eth,
                COALESCE(o.instancia, NULLIF(TRIM(e.instancia_gestion), '')) COLLATE utf8mb4_unicode_ci
         FROM egreso_soporte e
         LEFT JOIN instancia_soporte o ON o.tipo = 'egreso' AND o.planilla_id = e.id
         WHERE e.estado_egreso IS NULL OR UPPER(e.estado_egreso) NOT LIKE 'VENTA%'
       ) filas
       ORDER BY fecha IS NULL, fecha DESC, id DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/instancia", requerirRol(["admin", "operador"]), async (req, res) => {
  const tipo = req.body?.tipo === "ingreso" || req.body?.tipo === "egreso" ? req.body.tipo : "";
  const id = parseInt(req.body?.id, 10);
  const instancia = texto(req.body?.instancia_gestion, 80) || "";
  if (!tipo || !id) return res.status(400).json({ error: "Indicá si es un ingreso o un egreso de soporte." });
  const permitidas = new Set(["", "PENDIENTE", "EN PROCESO", "FINALIZADO"]);
  if (!permitidas.has(instancia)) {
    return res.status(400).json({ error: "La instancia tiene que ser Pendiente, En proceso, Finalizado o quedar vacía." });
  }
  const tabla = tipo === "ingreso" ? "ingreso_soporte" : "egreso_soporte";
  try {
    await asegurarInstanciaManual();
    const [[fila]] = await pool.query(`SELECT id FROM ${tabla} WHERE id = ?`, [id]);
    if (!fila) return res.status(404).json({ error: "Ese registro no está en la planilla de soporte." });
    if (tipo === "egreso") {
      const [[venta]] = await pool.query(
        "SELECT id FROM egreso_soporte WHERE id = ? AND UPPER(estado_egreso) LIKE 'VENTA%'",
        [id]
      );
      if (venta) return res.status(400).json({ error: "Una venta no se edita desde la instancia de soporte." });
    }
    await pool.query(
      `INSERT INTO instancia_soporte (tipo, planilla_id, instancia) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE instancia = VALUES(instancia)`,
      [tipo, id, instancia]
    );
    res.json({ ok: true, instancia });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const EDICION = {
  ingreso: {
    tabla: "ingreso_soporte",
    fecha: "fecha_ingreso",
    fechaTexto: "fecha_ingreso_texto",
    dispositivo: "dispositivo_ingreso",
    estado: "estado_ingreso",
    seguimiento: "segui_ingreso",
    correo: "correo_ingreso",
    observacion: "obs_encomienda_ingreso",
    contacto: "con_soporte_ingreso",
  },
  egreso: {
    tabla: "egreso_soporte",
    fecha: "fecha_egreso",
    fechaTexto: "fecha_egreso_texto",
    dispositivo: "dispositivo_egreso",
    estado: "estado_egreso",
    seguimiento: "segui_egreso",
    correo: "correo_egreso",
    observacion: "obs_encomienda_egreso",
    contacto: "con_soporte_egreso",
    envio: "envio_retiro",
  },
};

function fechaEditable(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || "")) ? valor : null;
}

function clienteClave(fila) {
  return String(fila.razon_social || fila.razsocial_agreg || "").trim();
}

router.put("/", requerirRol(["admin", "operador"]), async (req, res) => {
  const tipo = String(req.body.tipo || "");
  const mapa = EDICION[tipo];
  const id = parseInt(req.body.id, 10);
  if (!mapa || !id) return res.status(400).json({ error: "Falta el registro." });
  try {
    if (tipo === "ingreso") await asegurarColumnasIngreso();
    else await asegurarColumnasEgreso();
    await asegurarInstanciaManual();
    await asegurarSeparacion();
    const crudos = Array.isArray(req.body.dispositivos) && req.body.dispositivos.length ? req.body.dispositivos : [req.body];
    const equipos = crudos.map(completarEquipo);
    const principal = equipos[0];
    const adicionales = equiposUnicos(equipos.slice(1).filter(equipoUtil)).filter((equipo) => claveEquipo(equipo) !== claveEquipo(principal));
    const razonNueva = texto(String(req.body.razsocial_agreg || "").replace(/\s+/g, " "), 200);
    const razonLista = texto(String(req.body.razon_social || "").replace(/\s+/g, " "), 200);
    const ingreso = {
      fecha: fechaEditable(req.body.fecha),
      razsocial_agreg: razonNueva,
      razon_social: razonLista || razonNueva,
      dispositivo: principal.dispositivo,
      estado: principal.estado,
      seguimiento: texto(req.body.seguimiento, 80),
      correo: texto(req.body.correo, 80),
      observacion: texto(req.body.observacion, 4000),
      contacto: texto(req.body.contacto, 255),
      motivo: texto(req.body.motivo, 255),
      instancia: String(req.body.instancia_gestion ?? "").trim().slice(0, 80),
      deposito: texto(req.body.deposito, 120),
      caja: principal.caja,
      envio_retiro: texto(req.body.envio_retiro, 80),
      mac: principal.mac,
      mac_wifi: principal.macWifi,
      mac_eth: principal.macEth,
    };
    const marcados = [ingreso.correo, ingreso.deposito, ingreso.instancia, ingreso.envio_retiro]
      .concat(equipos.flatMap((equipo) => [equipo.dispositivo, equipo.estado]));
    if (marcados.includes("__otro__")) {
      return res.status(400).json({ error: "Completá el texto de Otro." });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[actual]] = await conn.query(`SELECT * FROM ${mapa.tabla} WHERE id = ? FOR UPDATE`, [id]);
      if (!actual) {
        await conn.rollback();
        return res.status(404).json({ error: "No se encontró el registro." });
      }
      if (tipo === "egreso" && String(actual.estado_egreso || "").toUpperCase().startsWith("VENTA")) {
        await conn.rollback();
        return res.status(400).json({ error: "Una venta no se edita desde soporte." });
      }
      const razonAnterior = String(actual.razsocial_agreg || "").trim();
      if (ingreso.razsocial_agreg && ingreso.razsocial_agreg.toLocaleLowerCase("es") !== razonAnterior.toLocaleLowerCase("es")) {
        await guardarClienteNuevo(conn, ingreso.razsocial_agreg);
      }
      const fechaNueva = ingreso.fecha;
      const fechaGuardada = fechaNueva || actual[mapa.fecha];
      const clienteNuevo = ingreso.razon_social || clienteClave(actual);
      const existentes = await yaCargados(conn, tipo, clienteNuevo, fechaGuardada, id);
      if (claveEquipo(principal) && existentes.some((fila) => claveEquipo(fila) === claveEquipo(principal))) {
        await conn.rollback();
        return res.status(409).json({ error: "Esa MAC ya está en otra fila de este cliente con la misma fecha." });
      }
      const paraAgregar = sinRepetir(existentes, adicionales);
      const campos = [
        [mapa.fecha, fechaNueva || actual[mapa.fecha]],
        [mapa.fechaTexto, fechaNueva ? null : actual[mapa.fechaTexto]],
        ["razsocial_agreg", ingreso.razsocial_agreg],
        ["razon_social", ingreso.razon_social],
        [mapa.dispositivo, ingreso.dispositivo],
        [mapa.estado, ingreso.estado],
        [mapa.seguimiento, ingreso.seguimiento],
        [mapa.correo, ingreso.correo],
        [mapa.observacion, ingreso.observacion],
        [mapa.contacto, ingreso.contacto],
        ["motivo", ingreso.motivo],
        ["instancia_gestion", ingreso.instancia || null],
        ["deposito", ingreso.deposito],
        ["caja", ingreso.caja],
        ["mac", ingreso.mac],
        ["mac_wifi", ingreso.mac_wifi],
        ["mac_eth", ingreso.mac_eth],
      ];
      if (mapa.envio) campos.push([mapa.envio, ingreso.envio_retiro]);
      const marcas = campos.map(([columna]) => `${columna} = ?`).join(", ");
      await conn.query(
        `UPDATE ${mapa.tabla} SET ${marcas}, editado_en_sitio = 1 WHERE id = ?`,
        [...campos.map(([, valor]) => valor), id]
      );
      await conn.query(
        `INSERT INTO instancia_soporte (tipo, planilla_id, instancia) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE instancia = VALUES(instancia)`,
        [tipo, id, ingreso.instancia]
      );
      const compartidos = [
        [mapa.seguimiento, actual[mapa.seguimiento], ingreso.seguimiento],
        [mapa.correo, actual[mapa.correo], ingreso.correo],
        [mapa.observacion, actual[mapa.observacion], ingreso.observacion],
      ];
      if (mapa.envio) compartidos.push([mapa.envio, actual[mapa.envio], ingreso.envio_retiro]);
      const cambiados = compartidos.filter(([, antes, ahora]) => (antes || "") !== (ahora || ""));
      let acompañados = 0;
      const cliente = clienteClave(actual);
      if (cambiados.length && cliente) {
        const asignacion = cambiados.map(([columna]) => `${columna} = ?`).join(", ");
        const [resultado] = await conn.query(
          `UPDATE ${mapa.tabla}
           SET ${asignacion}, editado_en_sitio = 1
           WHERE id <> ?
             AND LOWER(TRIM(COALESCE(NULLIF(TRIM(razon_social), ''), NULLIF(TRIM(razsocial_agreg), ''), ''))) = LOWER(?)
             AND ${mapa.fecha} <=> ?
             AND COALESCE(${mapa.seguimiento}, '') = ?`,
          [
            ...cambiados.map(([, , ahora]) => ahora),
            id,
            cliente,
            actual[mapa.fecha],
            actual[mapa.seguimiento] || "",
          ]
        );
        acompañados = resultado.affectedRows;
      }
      let agregados = 0;
      const omitidos = adicionales.length - paraAgregar.length;
      if (paraAgregar.length) {
        let origenFila = await reservarOrigen(conn, mapa.tabla);
        const textoFecha = fechaNueva ? null : actual[mapa.fechaTexto];
        for (const equipo of paraAgregar) {
          origenFila -= 1;
          if (tipo === "ingreso") {
            await conn.query(
              `INSERT INTO ingreso_soporte (
                 fecha_ingreso, fecha_ingreso_texto, razsocial_agreg, razon_social, dispositivo_ingreso, estado_ingreso,
                 mac, segui_ingreso, correo_ingreso, obs_encomienda_ingreso,
                 con_soporte_ingreso, motivo, instancia_gestion, mac_wifi, mac_eth,
                 deposito, caja, origen, origen_fila, editado_en_sitio
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sitio', ?, 1)`,
              [
                fechaGuardada, textoFecha, ingreso.razsocial_agreg, ingreso.razon_social,
                equipo.dispositivo, equipo.estado, equipo.mac, ingreso.seguimiento, ingreso.correo,
                ingreso.observacion, ingreso.contacto, ingreso.motivo, ingreso.instancia || null,
                equipo.macWifi, equipo.macEth, ingreso.deposito, equipo.caja, origenFila,
              ]
            );
          } else {
            await conn.query(
              `INSERT INTO egreso_soporte (
                 fecha_egreso, fecha_egreso_texto, razsocial_agreg, razon_social, dispositivo_egreso, estado_egreso,
                 mac, envio_retiro, correo_egreso, segui_egreso, num_ticket, obs_encomienda_egreso,
                 con_soporte_egreso, motivo, instancia_gestion, mac_wifi, mac_eth,
                 deposito, caja, origen, origen_fila, editado_en_sitio
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sitio', ?, 1)`,
              [
                fechaGuardada, textoFecha, ingreso.razsocial_agreg, ingreso.razon_social,
                equipo.dispositivo, equipo.estado, equipo.mac, ingreso.envio_retiro, ingreso.correo,
                ingreso.seguimiento, actual.num_ticket, ingreso.observacion, ingreso.contacto, ingreso.motivo,
                ingreso.instancia || null, equipo.macWifi, equipo.macEth, ingreso.deposito, equipo.caja, origenFila,
              ]
            );
          }
          agregados += 1;
        }
      }
      await conn.commit();
      res.json({ ok: true, acompañados, agregados, omitidos });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  const sql = CONSULTAS[String(req.query.tipo || "")];
  if (!sql) return res.status(400).json({ error: "Tipo de planilla desconocido" });
  try {
    if (req.query.tipo === "ingreso") await asegurarColumnasIngreso();
    if (req.query.tipo === "egreso") await asegurarColumnasEgreso();
    await asegurarInstanciaManual();
    await asegurarSeparacion();
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
