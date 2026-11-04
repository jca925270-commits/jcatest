const express = require("express");
const pool = require("../config/db");
const { requerirLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requerirLogin);

const ETIQUETAS = {
  dispositivos: "Dispositivos",
  movimientos: "Movimientos",
  ingreso_soporte: "Ingreso soporte",
  egreso_soporte: "Egreso soporte",
  trazabilidad_ingreso_ebd: "Trazabilidad ingreso EBD",
  trazabilidad_egreso_ebd: "Trazabilidad egreso EBD",
  trazabilidad_ingreso_d3: "Trazabilidad ingreso D3",
  trazabilidad_egreso_d3: "Trazabilidad egreso D3",
  trazabilidad_ingreso_ebd_reparado: "Trazabilidad ingreso EBD reparado",
  trazabilidad_egreso_ebd_reparado: "Trazabilidad egreso EBD reparado",
  trazabilidad_ingreso_pantalla: "Trazabilidad ingreso pantallas",
  trazabilidad_egreso_pantalla: "Trazabilidad egreso pantallas",
  trazabilidad_ingreso_ebd_interno: "Trazabilidad ingreso EBD uso interno",
  trazabilidad_egreso_ebd_interno: "Trazabilidad egreso EBD uso interno",
  testeo_ebd_reparados: "Reparados y Reutilizados",
  testeo_d3_refresh: "D3 reutilizados/devueltos/sin antena wifi",
  testeo_no_pasaron_prueba: "No pasaron prueba",
  stock_actual: "Stock",
  clientes: "Clientes",
  movimientos_accesorio: "Accesorios",
};

const FECHAS = ["fecha", "fecha_ingreso", "fecha_egreso", "fecha_llegada", "fecha_despacho", "fecha_comienzo", "fecha_carga"];
const CLIENTES = ["razon_social", "cliente", "razsocial_agreg", "entidad"];
const DEPOSITOS = ["deposito", "ubicacion"];
const DETALLES = ["estado", "estado_ingreso", "estado_egreso", "dispositivo", "dispositivo_ingreso", "dispositivo_egreso", "dispositivo_extra", "tipo_movimiento", "motivo", "observaciones", "caja", "tipo"];

let mapaListo = null;

function identificador(nombre) {
  if (!/^[A-Za-z0-9_]+$/.test(nombre)) throw new Error("Identificador inválido");
  return `\`${nombre}\``;
}

function elegir(columnas, candidatos) {
  return candidatos.find((c) => columnas.includes(c)) || null;
}

function clavesMac(valor) {
  const texto = String(valor || "").toUpperCase();
  const grupos = texto
    .split(/[^0-9A-F:.\-]+/)
    .map((parte) => parte.replace(/[^0-9A-F]/g, ""))
    .filter((parte) => parte.length >= 4);
  const claves = [];
  for (const grupo of (grupos.length ? grupos : [])) {
    if (grupo.length > 12 && grupo.length % 12 === 0) {
      for (let i = 0; i < grupo.length; i += 12) claves.push(grupo.slice(i, i + 12));
    } else {
      claves.push(grupo);
    }
  }
  if (!claves.length) {
    const junto = texto.replace(/[^0-9A-F]/g, "");
    if (junto.length >= 4) claves.push(junto);
  }
  return [...new Set(claves)];
}

function lugarDe(sqlCol) {
  return `CASE UPPER(IFNULL(${sqlCol}, ''))
    WHEN 'VENDIDO' THEN 'Venta'
    WHEN 'VENTA' THEN 'Venta'
    WHEN 'VENTA COSTO 0' THEN 'Venta'
    WHEN 'REPARADO' THEN 'Reparado'
    WHEN 'A_REPARAR' THEN 'A reparar'
    WHEN 'A REPARAR' THEN 'A reparar'
    WHEN 'GARANTIA' THEN 'Garantía'
    WHEN 'DEVUELTO' THEN 'Devolución'
    WHEN 'DEVOLUCION' THEN 'Devolución'
    WHEN 'PRUEBA' THEN 'Prueba'
    WHEN 'PERIODO DE PRUEBA' THEN 'Prueba'
    WHEN 'PRUEBAS' THEN 'Prueba'
    WHEN 'COMODATO' THEN 'Comodato'
    WHEN 'EN_STOCK' THEN 'Stock'
    WHEN 'INGRESO' THEN 'Ingreso'
    WHEN 'EGRESO' THEN 'Egreso'
    WHEN 'BAJA' THEN 'Baja'
    WHEN 'DE_BAJA' THEN 'Baja'
    WHEN 'MOVIMIENTO' THEN 'Movimiento'
    WHEN 'MOVMIENTO' THEN 'Movimiento'
    WHEN 'ACTUALIZACION' THEN 'Actualización'
    WHEN 'ACTUALIZACIÓN' THEN 'Actualización'
    WHEN 'SOPORTE' THEN 'Soporte técnico'
    WHEN 'SOPORTE TECNICO' THEN 'Soporte técnico'
    ELSE NULLIF(${sqlCol}, '')
  END`;
}

function comodin(valor) {
  return `%${String(valor).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function exprMacSql(sqlCol) {
  return `UPPER(REPLACE(REPLACE(REPLACE(IFNULL(${sqlCol}, ''), ':', ''), '-', ''), '.', ''))`;
}

function exprMac(columna) {
  return exprMacSql(identificador(columna));
}

function patronMac(hex) {
  return hex.length >= 12
    ? `(^|[^0-9A-F])${hex}([^0-9A-F]|$)`
    : `(^|[^0-9A-F])[0-9A-F]*${hex}([^0-9A-F]|$)`;
}

function condicionMacSql(sqlCols, claves) {
  const partes = [];
  const params = [];
  for (const hex of claves) {
    const patron = patronMac(hex);
    for (const col of sqlCols) {
      partes.push(`${exprMacSql(col)} REGEXP ?`);
      params.push(patron);
    }
  }
  return { sql: `(${partes.join(" OR ")})`, params };
}

function condicionMac(columnas, claves) {
  return condicionMacSql(columnas.map(identificador), claves);
}

const IGNORAR_TABLAS = new Set([
  "sessions", "usuarios", "sync_control", "alertas_config", "alertas_planilla", "testeo_totales",
]);
const IGNORAR_FECHAS = new Set(["created_at", "updated_at", "actualizado_en", "reset_expira", "ultima_sync"]);
const ESPECIALES = new Set(["dispositivos", "movimientos", "movimientos_cantidad"]);

async function tablasConMac() {
  if (!mapaListo) {
    mapaListo = cargarMapa().catch((e) => {
      mapaListo = null;
      throw e;
    });
  }
  return mapaListo;
}

async function cargarMapa() {
  const [cols] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const porTabla = {};
  for (const r of cols) {
    if (IGNORAR_TABLAS.has(r.TABLE_NAME)) continue;
    (porTabla[r.TABLE_NAME] ||= []).push(r);
  }
  return Object.entries(porTabla).map(([tabla, lista]) => ({
    tabla,
    columnas: lista.map((c) => c.COLUMN_NAME),
    macs: lista
      .filter((c) => /mac/i.test(c.COLUMN_NAME) && ["varchar", "char", "text", "mediumtext", "longtext"].includes(c.DATA_TYPE))
      .map((c) => c.COLUMN_NAME),
    clientes: lista.filter((c) => CLIENTES.includes(c.COLUMN_NAME)).map((c) => c.COLUMN_NAME),
    fechas: lista
      .filter((c) => ["date", "datetime", "timestamp"].includes(c.DATA_TYPE) && !IGNORAR_FECHAS.has(c.COLUMN_NAME))
      .map((c) => c.COLUMN_NAME),
  })).filter((info) => info.macs.length || info.clientes.length || info.fechas.length);
}

function whereCliente(columnas, params, razon) {
  const like = comodin(razon);
  params.push(...columnas.map(() => like));
  return `(${columnas.map((c) => `${identificador(c)} LIKE ? ESCAPE '\\\\'`).join(" OR ")})`;
}

function whereFechas(columnas, params, desde, hasta) {
  const partes = columnas.map((c) => {
    const col = identificador(c);
    const bits = [];
    if (desde) {
      bits.push(`${col} >= ?`);
      params.push(desde);
    }
    if (hasta) {
      bits.push(`${col} <= ?`);
      params.push(`${hasta} 23:59:59`);
    }
    return `(${bits.join(" AND ")})`;
  });
  return `(${partes.join(" OR ")})`;
}

function exprFecha(fechas) {
  if (!fechas.length) return "NULL";
  const preferidas = FECHAS.filter((f) => fechas.includes(f));
  const orden = [...preferidas, ...fechas.filter((f) => !preferidas.includes(f))];
  return `COALESCE(${orden.map((f) => `DATE_FORMAT(${identificador(f)}, '%Y-%m-%d')`).join(", ")})`;
}

function armarSelect(info) {
  const deposito = elegir(info.columnas, DEPOSITOS);
  const detalles = DETALLES.filter((c) => info.columnas.includes(c) && !info.clientes.includes(c));
  const macSql = info.macs.length
    ? `NULLIF(CONCAT_WS(' | ', ${info.macs.map(identificador).join(", ")}), '')`
    : "NULL";
  const clienteSql = info.clientes.length
    ? `NULLIF(CONCAT_WS(' · ', ${info.clientes.map(identificador).join(", ")}), '')`
    : "NULL";
  const detalleSql = detalles.length
    ? `NULLIF(CONCAT_WS(' · ', ${detalles.map(identificador).join(", ")}), '')`
    : "NULL";
  return `SELECT ? AS origen, ${exprFecha(info.fechas)} AS fecha, ${macSql} AS mac,
            ${clienteSql} AS cliente,
            ${deposito ? identificador(deposito) : "NULL"} AS deposito,
            ${detalleSql} AS detalle
          FROM ${identificador(info.tabla)}`;
}

router.get("/", async (req, res) => {
  const claves = clavesMac(req.query.mac);
  const razon = String(req.query.razon || "").trim();
  const desde = String(req.query.desde || "").trim();
  const hasta = String(req.query.hasta || "").trim();

  const hayFecha = !!(desde || hasta);
  if (!claves.length && !razon && !hayFecha) {
    return res.status(400).json({ error: "Escribí una MAC, una razón social o una fecha." });
  }
  if (req.query.mac && !claves.length) {
    return res.status(400).json({ error: "Para buscar por MAC usá la MAC completa, una de las dos, o al menos los últimos 4 caracteres." });
  }
  if (razon && razon.length < 2) {
    return res.status(400).json({ error: "La razón social tiene que tener al menos 2 caracteres." });
  }
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({ error: "La fecha desde es posterior a la fecha hasta." });
  }
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return res.status(400).json({ error: "La fecha desde no es válida." });
  }
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return res.status(400).json({ error: "La fecha hasta no es válida." });
  }

  try {
    const tablas = await tablasConMac();
    const consultas = [];

    for (const info of tablas) {
      if (ESPECIALES.has(info.tabla)) continue;
      if (claves.length && !info.macs.length) continue;
      if (razon && !info.clientes.length) continue;
      if (hayFecha && !info.fechas.length) continue;
      const where = [];
      const params = [ETIQUETAS[info.tabla] || info.tabla.replace(/_/g, " ")];
      if (claves.length) {
        const mac = condicionMac(info.macs, claves);
        where.push(mac.sql);
        params.push(...mac.params);
      }
      if (razon) where.push(whereCliente(info.clientes, params, razon));
      if (hayFecha) where.push(whereFechas(info.fechas, params, desde, hasta));
      if (!where.length) continue;
      const orden = info.fechas[0] ? ` ORDER BY ${identificador(info.fechas[0])} DESC` : "";
      consultas.push(
        pool.query(`${armarSelect(info)} WHERE ${where.join(" AND ")}${orden} LIMIT 80`, params)
          .then(([rows]) => rows).catch(() => [])
      );
    }

    if (claves.length || razon || hayFecha) {
      const where = [];
      const params = [];
      if (claves.length) {
        const mac = condicionMacSql(["d.mac_wifi", "d.mac_eth"], claves);
        where.push(mac.sql);
        params.push(...mac.params);
      }
      if (razon) {
        where.push("c.razon_social LIKE ? ESCAPE '\\\\'");
        params.push(comodin(razon));
      }
      if (hayFecha) {
        const partes = ["d.fecha_llegada", "d.fecha_carga"].map((col) => {
          const bits = [];
          if (desde) { bits.push(`${col} >= ?`); params.push(desde); }
          if (hasta) { bits.push(`${col} <= ?`); params.push(hasta); }
          return `(${bits.join(" AND ")})`;
        });
        where.push(`(${partes.join(" OR ")})`);
      }
      if (where.length) {
        consultas.push(
          pool.query(
            `SELECT IFNULL(${lugarDe("d.estado")}, 'Dispositivos') AS origen,
                    COALESCE(DATE_FORMAT(d.fecha_llegada, '%Y-%m-%d'), DATE_FORMAT(d.fecha_carga, '%Y-%m-%d')) AS fecha,
                    NULLIF(CONCAT_WS(' | ', d.mac_wifi, d.mac_eth), '') AS mac,
                    c.razon_social AS cliente, u.nombre AS deposito, 'Estado actual' AS detalle
             FROM dispositivos d
             LEFT JOIN clientes c ON c.id = d.cliente_actual_id
             LEFT JOIN depositos u ON u.id_deposito = d.deposito_actual_id
             WHERE ${where.join(" AND ")}
             LIMIT 80`,
            params
          ).then(([rows]) => rows).catch(() => [])
        );
      }
    }

    if (claves.length || razon || hayFecha) {
      const condiciones = [];
      const parametros = [];
      if (claves.length) {
        const mac = condicionMacSql(["d.mac_wifi", "d.mac_eth"], claves);
        condiciones.push(mac.sql);
        parametros.push(...mac.params);
      }
      if (razon) {
        condiciones.push("c.razon_social LIKE ? ESCAPE '\\\\'");
        parametros.push(comodin(razon));
      }
      if (desde) {
        condiciones.push("m.fecha >= ?");
        parametros.push(desde);
      }
      if (hasta) {
        condiciones.push("m.fecha <= ?");
        parametros.push(`${hasta} 23:59:59`);
      }
      consultas.push(
        pool.query(
          `SELECT IFNULL(${lugarDe("m.tipo_movimiento")}, 'Movimientos') AS origen,
                  DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha,
                  NULLIF(CONCAT_WS(' | ', d.mac_wifi, d.mac_eth), '') AS mac,
                  c.razon_social AS cliente,
                  COALESCE(uo.nombre, ud.nombre) AS deposito,
                  NULLIF(CONCAT_WS(' · ', m.motivo), '') AS detalle
           FROM movimientos m
           LEFT JOIN dispositivos d ON d.id = m.dispositivo_id
           LEFT JOIN clientes c ON c.id = m.cliente_id
           LEFT JOIN depositos uo ON uo.id_deposito = m.deposito_origen_id
           LEFT JOIN depositos ud ON ud.id_deposito = m.deposito_destino_id
           WHERE ${condiciones.join(" AND ")}
           ORDER BY m.fecha DESC
           LIMIT 200`,
          parametros
        ).then(([rows]) => rows).catch(() => [])
      );
    }

    if (claves.length || razon || hayFecha) {
      const condiciones = [];
      const parametros = [];
      if (claves.length) {
        const mac = condicionMacSql(
          ["m.motivo", "m.ticket", "m.remito", "m.factura", "m.razon_social"],
          claves
        );
        condiciones.push(mac.sql);
        parametros.push(...mac.params);
      }
      if (razon) {
        condiciones.push("m.razon_social LIKE ? ESCAPE '\\\\'");
        parametros.push(comodin(razon));
      }
      if (desde) {
        condiciones.push("m.fecha >= ?");
        parametros.push(desde);
      }
      if (hasta) {
        condiciones.push("m.fecha <= ?");
        parametros.push(hasta);
      }
      consultas.push(
        pool.query(
          `SELECT CASE
                    WHEN c.nombre LIKE '%ya reparados%' THEN 'Reparado'
                    ELSE IFNULL(${lugarDe("m.estado")}, 'Estado')
                  END AS origen,
                  DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha,
                  NULL AS mac,
                  m.razon_social AS cliente,
                  c.nombre AS deposito,
                  NULLIF(CONCAT_WS(' · ', m.estado, m.motivo, m.remito, m.factura), '') AS detalle
           FROM movimientos_cantidad m
           JOIN categorias_stock c ON c.id = m.categoria_id
           WHERE ${condiciones.join(" AND ")}
           ORDER BY m.fecha DESC
           LIMIT 200`,
          parametros
        ).then(([rows]) => rows).catch(() => [])
      );
    }

    const partes = await Promise.all(consultas);
    const filas = partes.flat().sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    res.json(filas.slice(0, 400));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
