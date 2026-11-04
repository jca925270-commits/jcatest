const express = require("express");
const pool = require("../config/db");
const { requerirLogin, requerirRol } = require("../middleware/auth");
const { generarInformeAccesorios } = require("../lib/informe-accesorios");

const router = express.Router();
router.use(requerirLogin);

const LUGARES = [
  { clave: "oficina", nombre: "Oficina" },
  { clave: "showroom", nombre: "Showroom" },
  { clave: "casa_santi", nombre: "Casa Santi" },
  { clave: "campina", nombre: "Campiña del Sur" },
];
const NOMBRES_DEPOSITO = LUGARES.map((lugar) => lugar.nombre);
const FUENTE_24 = "Fuente 24V 5.0 Amp";

async function asegurarFuente24() {
  const [[columna]] = await pool.query(
    `SELECT DATA_TYPE tipo, CHARACTER_SET_NAME juego, COLLATION_NAME orden
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accesorios' AND COLUMN_NAME = 'accesorio'`
  );
  if (String(columna?.tipo || "").toLowerCase() === "enum") {
    const juego = /^[A-Za-z0-9_]+$/.test(columna.juego || "") ? columna.juego : "utf8mb4";
    const orden = /^[A-Za-z0-9_]+$/.test(columna.orden || "") ? columna.orden : "utf8mb4_unicode_ci";
    await pool.query(
      `ALTER TABLE accesorios MODIFY accesorio VARCHAR(80) CHARACTER SET ${juego} COLLATE ${orden} NOT NULL`
    );
  }
  const [[{ existentes }]] = await pool.query(
    "SELECT COUNT(*) existentes FROM accesorios WHERE accesorio = ?",
    [FUENTE_24]
  );
  if (Number(existentes) >= LUGARES.length * 2) return;
  const [depositos] = await pool.query("SELECT id_deposito, nombre FROM depositos");
  const ids = {};
  for (const deposito of depositos) {
    const clave = lugarDe(deposito.nombre);
    if (clave && ids[clave] == null) ids[clave] = deposito.id_deposito;
  }
  for (const lugar of LUGARES) {
    const depositoId = ids[lugar.clave];
    if (!depositoId) continue;
    for (const destino of ["venta", "uso_interno"]) {
      await pool.query(
        `INSERT IGNORE INTO accesorios (accesorio, deposito_id, destino, cantidad) VALUES (?, ?, ?, 0)`,
        [FUENTE_24, depositoId, destino]
      );
    }
  }
}

function lugarDe(nombre) {
  const n = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("campi")) return "campina";
  if (n.includes("show")) return "showroom";
  if (n.includes("casa")) return "casa_santi";
  if (n.includes("oficina")) return "oficina";
  return null;
}

async function asegurarDestino() {
  await asegurarFuente24();
  const [[{ columna }]] = await pool.query(
    `SELECT COUNT(*) columna FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accesorios' AND COLUMN_NAME = 'destino'`
  );
  if (!Number(columna)) {
    await pool.query(
      `ALTER TABLE accesorios
       ADD COLUMN destino ENUM('venta','uso_interno') NOT NULL DEFAULT 'venta' AFTER deposito_id`
    );
  }
  const [[{ unicoViejo }]] = await pool.query(
    `SELECT COUNT(*) unicoViejo FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accesorios'
       AND INDEX_NAME = 'uq_accesorio_deposito' AND SEQ_IN_INDEX = 1`
  );
  if (Number(unicoViejo)) await pool.query("ALTER TABLE accesorios DROP INDEX uq_accesorio_deposito");
  const [[{ unicoNuevo }]] = await pool.query(
    `SELECT COUNT(*) unicoNuevo FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accesorios'
       AND INDEX_NAME = 'uq_accesorio_lugar' AND SEQ_IN_INDEX = 1`
  );
  if (!Number(unicoNuevo)) {
    await pool.query(
      "ALTER TABLE accesorios ADD UNIQUE KEY uq_accesorio_lugar (accesorio, deposito_id, destino)"
    );
  }

  const [[{ listos }]] = await pool.query(
    `SELECT COUNT(*) listos FROM accesorios a
     JOIN depositos d ON d.id_deposito = a.deposito_id
     WHERE a.destino = 'uso_interno' AND d.nombre IN (?)`,
    [NOMBRES_DEPOSITO]
  );
  const [accesorios] = await pool.query("SELECT DISTINCT accesorio FROM accesorios");
  if (Number(listos) >= accesorios.length * LUGARES.length) return;
  const [depositos] = await pool.query("SELECT id_deposito, nombre FROM depositos");
  const ids = {};
  for (const deposito of depositos) {
    const clave = lugarDe(deposito.nombre);
    if (clave) ids[clave] = deposito.id_deposito;
  }
  for (const fila of accesorios) {
    for (const lugar of LUGARES) {
      const depositoId = ids[lugar.clave];
      if (!depositoId) continue;
      for (const destino of ["venta", "uso_interno"]) {
        await pool.query(
          `INSERT IGNORE INTO accesorios (accesorio, deposito_id, destino, cantidad)
           VALUES (?, ?, ?, 0)`,
          [fila.accesorio, depositoId, destino]
        );
      }
    }
  }
}

async function asegurarLimites() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS accesorios_limites (
       accesorio VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
       minimo INT NOT NULL DEFAULT 7,
       maximo INT NOT NULL DEFAULT 0,
       actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`
  );
  await pool.query(
    `INSERT IGNORE INTO accesorios_limites (accesorio, minimo, maximo)
     SELECT DISTINCT accesorio, 7, 0 FROM accesorios`
  );
}

router.get("/", async (req, res) => {
  try {
    await asegurarDestino();
    await asegurarLimites();
    if (req.query.accion === "informe_pdf") {
      const informe = await generarInformeAccesorios();
      res.set("Cache-Control", "no-store");
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${informe.nombre}"`);
      return res.send(informe.pdf);
    }
    const [rows] = await pool.query(
      `SELECT a.accesorio,
              COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Oficina' THEN a.cantidad END), 0) AS oficina,
              COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Showroom' THEN a.cantidad END), 0) AS showroom,
              COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Casa Santi' THEN a.cantidad END), 0) AS casa_santi,
              COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Campiña del Sur' THEN a.cantidad END), 0) AS campina,
              COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Oficina' THEN a.cantidad END), 0) AS uso_oficina,
              COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Showroom' THEN a.cantidad END), 0) AS uso_showroom,
              COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Casa Santi' THEN a.cantidad END), 0) AS uso_casa_santi,
              COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Campiña del Sur' THEN a.cantidad END), 0) AS uso_campina,
              COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre IN (?) THEN a.cantidad END), 0) AS uso_interno,
              COALESCE(MAX(l.minimo), 7) AS minimo,
              COALESCE(MAX(l.maximo), 0) AS maximo
       FROM accesorios a
       JOIN depositos d ON d.id_deposito = a.deposito_id
       LEFT JOIN accesorios_limites l ON l.accesorio = a.accesorio
       WHERE d.nombre IN (?)
       GROUP BY a.accesorio
       ORDER BY a.accesorio`,
      [NOMBRES_DEPOSITO, NOMBRES_DEPOSITO]
    );
    res.json(rows.map((fila) => {
      const oficina = Number(fila.oficina);
      const showroom = Number(fila.showroom);
      const casaSanti = Number(fila.casa_santi);
      const campina = Number(fila.campina);
      const usoInterno = Number(fila.uso_interno);
      return {
        accesorio: fila.accesorio,
        oficina,
        showroom,
        casa_santi: casaSanti,
        campina,
        uso_interno: usoInterno,
        uso_oficina: Number(fila.uso_oficina),
        uso_showroom: Number(fila.uso_showroom),
        uso_casa_santi: Number(fila.uso_casa_santi),
        uso_campina: Number(fila.uso_campina),
        total: oficina + showroom + casaSanti + campina + usoInterno,
        minimo: Number(fila.minimo),
        maximo: Number(fila.maximo),
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/limites", requerirRol(["admin"]), async (req, res) => {
  const lista = Array.isArray(req.body?.limites) ? req.body.limites : [];
  if (!lista.length) return res.status(400).json({ error: "Indicá el mínimo y el máximo de cada accesorio." });
  await asegurarLimites();
  const [catalogo] = await pool.query("SELECT DISTINCT accesorio FROM accesorios");
  const validos = new Set(catalogo.map((fila) => fila.accesorio));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of lista) {
      const nombre = String(item.accesorio || "");
      const minimo = parseInt(item.minimo, 10);
      const maximo = parseInt(item.maximo, 10);
      if (!validos.has(nombre) || Number.isNaN(minimo) || Number.isNaN(maximo) || minimo < 0 || maximo < 0) {
        await conn.rollback();
        return res.status(400).json({ error: "El mínimo y el máximo tienen que ser números desde 0." });
      }
      if (maximo > 0 && maximo < minimo) {
        await conn.rollback();
        return res.status(400).json({ error: `El máximo de ${nombre} tiene que ser mayor o igual al mínimo.` });
      }
      await conn.query(
        `INSERT INTO accesorios_limites (accesorio, minimo, maximo) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE minimo = VALUES(minimo), maximo = VALUES(maximo)`,
        [nombre, minimo, maximo]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

const MOTIVOS = {
  compra: "Compra",
  venta: "Venta",
  garantia: "Garantía",
  prueba: "Prueba",
  uso_interno: "Uso interno",
  movimiento: "Movimiento",
  baja: "Baja",
  devolucion: "Devolución",
};

function nombreLugar(clave) {
  if (clave === "proveedor") return "Proveedor";
  if (clave === "uso_interno") return "Uso interno";
  return (LUGARES.find((lugar) => lugar.clave === clave) || {}).nombre || "";
}

function esDepositoBanner(clave) {
  return clave === "uso_interno" || LUGARES.some((lugar) => lugar.clave === clave);
}

function celdaMovimiento(clave, otra, motivo) {
  if (!esDepositoBanner(clave)) return null;
  if (clave === "uso_interno") {
    if (!LUGARES.some((lugar) => lugar.clave === otra)) return null;
    return { deposito: otra, bucket: "uso_interno" };
  }
  if (motivo === "uso_interno" && LUGARES.some((lugar) => lugar.clave === otra)) {
    return { deposito: clave, bucket: "uso_interno" };
  }
  return { deposito: clave, bucket: "venta" };
}

async function asegurarDetalleMovimiento() {
  for (const columna of ["origen", "destino"]) {
    const [[{ existe }]] = await pool.query(
      `SELECT COUNT(*) existe FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'movimientos_accesorio' AND COLUMN_NAME = ?`,
      [columna]
    );
    if (!Number(existe)) {
      await pool.query(`ALTER TABLE movimientos_accesorio ADD COLUMN ${columna} VARCHAR(40) NULL`);
    }
  }
}

async function filaAccesorioEn(conn, accesorio, clave, bucket) {
  const lugar = LUGARES.find((item) => item.clave === clave);
  if (!lugar) return null;
  const [depositos] = await conn.query("SELECT id_deposito, nombre FROM depositos");
  const deposito = depositos.find((item) => lugarDe(item.nombre) === lugar.clave);
  if (!deposito) return null;
  const [filas] = await conn.query(
    `SELECT id, cantidad FROM accesorios WHERE accesorio = ? AND deposito_id = ? AND destino = ? FOR UPDATE`,
    [accesorio, deposito.id_deposito, bucket]
  );
  return filas[0] || null;
}

async function aplicarDelta(conn, id, delta) {
  const [result] = await conn.query(
    "UPDATE accesorios SET cantidad = GREATEST(cantidad + ?, 0) WHERE id = ?",
    [delta, id]
  );
  return result.affectedRows;
}

async function registrarMovimiento(conn, datos) {
  await conn.query(
    `INSERT INTO movimientos_accesorio
       (accesorio_id, tipo_movimiento, cantidad, motivo, origen, destino, usuario_id)
     VALUES (?,?,?,?,?,?,?)`,
    [datos.id, datos.tipo, datos.cantidad, datos.motivo, datos.origen, datos.destino, datos.usuarioId]
  );
}

router.post("/", requerirRol(["admin"]), async (req, res) => {
  const cuerpo = req.body || {};
  if (cuerpo.motivo === "baja") {
    const cant = Math.abs(parseInt(cuerpo.cantidad, 10));
    if (!cuerpo.accesorio || Number.isNaN(cant) || cant <= 0) {
      return res.status(400).json({ error: "Indicá la cantidad a dar de baja." });
    }
    await asegurarDestino();
    await asegurarDetalleMovimiento();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [filas] = await conn.query(
        `SELECT a.id, a.cantidad, a.destino, d.nombre AS deposito
         FROM accesorios a
         JOIN depositos d ON d.id_deposito = a.deposito_id
         WHERE a.accesorio = ?
         FOR UPDATE`,
        [cuerpo.accesorio]
      );
      if (!filas.length) {
        await conn.rollback();
        return res.status(404).json({ error: "Accesorio no encontrado" });
      }
      const total = filas.reduce((suma, fila) => suma + (Number(fila.cantidad) || 0), 0);
      if (total < cant) {
        await conn.rollback();
        return res.status(400).json({ error: `En Todo Banner hay ${total}.` });
      }
      const orden = (fila) => {
        const clave = lugarDe(fila.deposito);
        const indice = LUGARES.findIndex((lugar) => lugar.clave === clave);
        return (fila.destino === "uso_interno" ? 10 : 0) + (indice < 0 ? 9 : indice);
      };
      filas.sort((a, b) => orden(a) - orden(b));
      let resta = cant;
      const usuarioId = req.session.usuario.id;
      for (const fila of filas) {
        if (!resta) break;
        const hay = Number(fila.cantidad) || 0;
        if (!hay) continue;
        const saca = Math.min(hay, resta);
        await aplicarDelta(conn, fila.id, -saca);
        const clave = lugarDe(fila.deposito);
        const lugar = (LUGARES.find((item) => item.clave === clave) || {}).nombre || fila.deposito;
        await registrarMovimiento(conn, {
          id: fila.id,
          tipo: "egreso",
          cantidad: saca,
          motivo: "Baja",
          origen: fila.destino === "uso_interno" ? `${lugar} — Uso interno` : lugar,
          destino: "Baja",
          usuarioId,
        });
        resta -= saca;
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
    return;
  }

  if (cuerpo.motivo === "uso_interno") {
    const cant = Math.abs(parseInt(cuerpo.cantidad, 10));
    const origen = String(cuerpo.origen || "");
    const destinoClave = String(cuerpo.destino_deposito || "");
    const fisico = (clave) => LUGARES.some((lugar) => lugar.clave === clave);
    if (!cuerpo.accesorio || Number.isNaN(cant) || cant <= 0) {
      return res.status(400).json({ error: "Indicá la cantidad para uso interno." });
    }
    if (!fisico(origen) || !fisico(destinoClave)) {
      return res.status(400).json({ error: "Elegí el depósito del stock general y el depósito donde se usa." });
    }
    await asegurarDestino();
    await asegurarDetalleMovimiento();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const desde = await filaAccesorioEn(conn, cuerpo.accesorio, origen, "venta");
      const hacia = await filaAccesorioEn(conn, cuerpo.accesorio, destinoClave, "uso_interno");
      if (!desde || !hacia) {
        await conn.rollback();
        return res.status(404).json({ error: "Ese accesorio no está en ese depósito." });
      }
      if (Number(desde.cantidad) < cant) {
        await conn.rollback();
        return res.status(400).json({ error: `En ${nombreLugar(origen)} el stock general es ${desde.cantidad}.` });
      }
      const usuarioId = req.session.usuario.id;
      await aplicarDelta(conn, desde.id, -cant);
      await aplicarDelta(conn, hacia.id, cant);
      await registrarMovimiento(conn, {
        id: desde.id, tipo: "egreso", cantidad: cant, motivo: "Uso interno",
        origen: nombreLugar(origen), destino: nombreLugar(destinoClave), usuarioId,
      });
      await registrarMovimiento(conn, {
        id: hacia.id, tipo: "ingreso", cantidad: cant, motivo: "Uso interno",
        origen: nombreLugar(origen), destino: nombreLugar(destinoClave), usuarioId,
      });
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
    return;
  }

  const cant = parseInt(cuerpo.cantidad, 10);
  const tipo = cuerpo.tipo_movimiento;
  const motivo = MOTIVOS[cuerpo.motivo] || "";
  const origen = String(cuerpo.origen || "");
  const destinoClave = String(cuerpo.destino_deposito || "");
  if (!["ingreso", "egreso", "ajuste"].includes(tipo) || Number.isNaN(cant) || cant === 0) {
    return res.status(400).json({ error: "Indicá la cantidad y si se agrega, se quita o se corrige." });
  }
  if (!motivo || !nombreLugar(origen) || !cuerpo.accesorio) {
    return res.status(400).json({ error: "Elegí el depósito de origen y el motivo." });
  }

  const nombreOrigen = nombreLugar(origen);
  const nombreDestino = nombreLugar(destinoClave);
  const cambiaTotal = cuerpo.motivo === "compra" || cuerpo.motivo === "devolucion";
  const mueveDentro = !cambiaTotal && tipo !== "ajuste";
  if (origen === "proveedor" && !cambiaTotal) {
    return res.status(400).json({
      error: cuerpo.motivo === "movimiento"
        ? "Movimiento es entre depósitos de Banner."
        : "Desde el proveedor el motivo tiene que ser Compra o Devolución.",
    });
  }
  if (mueveDentro && (!esDepositoBanner(origen) || !esDepositoBanner(destinoClave) || origen === destinoClave)) {
    return res.status(400).json({ error: "Elegí dos lugares de Banner distintos. Todo Banner no cambia en ese pase." });
  }
  if (!mueveDentro && origen === "proveedor" && !nombreDestino) {
    return res.status(400).json({ error: "Elegí el depósito de destino." });
  }
  if (!mueveDentro && tipo === "ingreso" && !nombreDestino && origen !== "proveedor" && !esDepositoBanner(origen)) {
    return res.status(400).json({ error: "Elegí el depósito de destino." });
  }

  await asegurarDestino();
  await asegurarDetalleMovimiento();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const usuarioId = req.session.usuario.id;

    if (mueveDentro) {
      const salida = celdaMovimiento(origen, destinoClave, cuerpo.motivo);
      const entrada = celdaMovimiento(destinoClave, origen, cuerpo.motivo);
      const desde = salida && await filaAccesorioEn(conn, cuerpo.accesorio, salida.deposito, salida.bucket);
      const hacia = entrada && await filaAccesorioEn(conn, cuerpo.accesorio, entrada.deposito, entrada.bucket);
      if (!desde || !hacia || desde.id === hacia.id) {
        await conn.rollback();
        return res.status(400).json({ error: "Elegí dos lugares de Banner distintos." });
      }
      const mueve = Math.abs(cant);
      if (Number(desde.cantidad) < mueve) {
        await conn.rollback();
        return res.status(400).json({ error: `En ${nombreOrigen} hay ${desde.cantidad}.` });
      }
      await aplicarDelta(conn, desde.id, -mueve);
      await aplicarDelta(conn, hacia.id, mueve);
      await registrarMovimiento(conn, {
        id: desde.id, tipo: "egreso", cantidad: mueve, motivo, origen: nombreOrigen, destino: nombreDestino, usuarioId,
      });
      await registrarMovimiento(conn, {
        id: hacia.id, tipo: "ingreso", cantidad: mueve, motivo, origen: nombreOrigen, destino: nombreDestino, usuarioId,
      });
    } else {
      const clave = origen === "proveedor" ? destinoClave : (tipo === "ingreso" && nombreDestino ? destinoClave : origen);
      const otra = clave === destinoClave ? origen : destinoClave;
      const celda = celdaMovimiento(clave, otra, cuerpo.motivo) || { deposito: clave, bucket: "venta" };
      const fila = await filaAccesorioEn(conn, cuerpo.accesorio, celda.deposito, celda.bucket);
      if (!fila) {
        await conn.rollback();
        return res.status(404).json({ error: "Ese accesorio no está en ese depósito." });
      }
      let delta = cant;
      if (tipo === "egreso") delta = -Math.abs(cant);
      if (tipo === "ingreso") delta = Math.abs(cant);
      const aplicado = await aplicarDelta(conn, fila.id, delta);
      if (!aplicado) {
        await conn.rollback();
        return res.status(404).json({ error: "Accesorio no encontrado" });
      }
      await registrarMovimiento(conn, {
        id: fila.id,
        tipo,
        cantidad: Math.abs(cant),
        motivo,
        origen: nombreOrigen,
        destino: nombreDestino || null,
        usuarioId,
      });
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
