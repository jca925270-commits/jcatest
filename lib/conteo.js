const pool = require("../config/db");
const { enviarCorreo } = require("./correo");
const { calcularPantallas } = require("./pantallas-resumen");

const AVISO_INICIAL = "jca925270@gmail.com";
const APP_URL = (process.env.APP_URL || "https://stock-node-ten.vercel.app").replace(/\/$/, "");
const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const ITEMS = [
  { key: "ar_oficina_ebd", grupo: "argentina", seccion: "Oficina", etiqueta: "EBD", categoria: "Oficina (EBD para Venta)", pais: "ARGENTINA" },
  { key: "ar_oficina_d3", grupo: "argentina", seccion: "Oficina", etiqueta: "D3", categoria: "Oficina (D3 para Venta)", pais: "ARGENTINA" },
  { key: "ar_oficina_d3_prueba", grupo: "argentina", seccion: "Oficina", etiqueta: "D3 (prueba)", categoria: "Oficina (D3 para Pruebas)", pais: "ARGENTINA" },
  { key: "ar_oficina_dongles", grupo: "argentina", seccion: "Oficina", etiqueta: "Dongles", categoria: "Dongle (Oficina)", pais: "ARGENTINA" },
  { key: "ar_oficina_camaras", grupo: "argentina", seccion: "Oficina", etiqueta: "Cámaras", categoria: "Oficina (Cámaras para venta)", pais: "ARGENTINA" },
  { key: "ar_oficina_pantallas", grupo: "argentina", seccion: "Oficina", etiqueta: "Pantallas Naranja", categoria: "Pantalla Naranja (Oficina)", pais: "ARGENTINA" },
  { key: "ar_oficina_ebd16", grupo: "argentina", seccion: "Oficina", etiqueta: "EBD (16 GB)", categoria: "Oficina (EBD 16GB para Venta)", pais: "ARGENTINA" },
  { key: "ar_campina_ebd", grupo: "argentina", seccion: "Campiña", etiqueta: "EBD", categoria: "Campiña del Sur (EBD)", pais: "ARGENTINA" },
  { key: "ar_campina_d3", grupo: "argentina", seccion: "Campiña", etiqueta: "D3", categoria: "Campiña del Sur (D3)", pais: "ARGENTINA" },
  { key: "ar_campina_d3plus", grupo: "argentina", seccion: "Campiña", etiqueta: "D3+", categoria: "Campiña del Sur (D3+)", pais: "ARGENTINA" },
  { key: "ar_reparar_ebd", grupo: "argentina", seccion: "Equipos a reparar (Bernardo)", etiqueta: "EBD", categoria: "Oficina (EBD pendientes a reparar)", pais: "ARGENTINA" },
  { key: "ar_reparados_ebd", grupo: "argentina", seccion: "Equipos reparados (Bernardo)", etiqueta: "EBD", categoria: "Oficina (EBD ya reparados por Bernardo)", pais: "ARGENTINA" },
  { key: "ar_showroom_d3", grupo: "argentina", seccion: "Showroom / Exhibición", etiqueta: "D3", categoria: "SHOWROOM (D3 para exhibición)", pais: "ARGENTINA" },
  { key: "ar_showroom_ebd", grupo: "argentina", seccion: "Showroom / Exhibición", etiqueta: "EBD (reparados)", categoria: "SHOWROOM (EBD para exhibición)", pais: "ARGENTINA" },
  { key: "py_ebd", grupo: "paraguay", seccion: "Paraguay", etiqueta: "EBD", categoria: "Oficina (EBD para Venta)", pais: "PARAGUAY" },
  { key: "py_d3", grupo: "paraguay", seccion: "Paraguay", etiqueta: "D3", categoria: "Oficina (D3 para Venta)", pais: "PARAGUAY" },
];

function fechaArgentina(ahora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(ahora).map((parte) => [parte.type, parte.value])
  );
  const anio = Number(partes.year);
  const mes = Number(partes.month);
  const dia = Number(partes.day);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    anio,
    mes,
    dia,
    ultimo,
    esUltimo: dia === ultimo,
    mesNombre: MESES[mes - 1],
  };
}

function normalizarNombre(valor) {
  return String(valor || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizarCorreo(valor) {
  const correo = String(valor || "").trim().toLowerCase();
  if (!correo || correo.length > 180) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return "";
  return correo;
}

function entero(valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 1000000) return null;
  return numero;
}

function errorEstado(mensaje, status) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}

async function asegurarTablas() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS conteo_destinatarios (
       id INT AUTO_INCREMENT PRIMARY KEY,
       email VARCHAR(180) NOT NULL,
       aviso TINYINT NOT NULL DEFAULT 0,
       UNIQUE KEY uq_conteo_email (email)
     ) ENGINE=InnoDB`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS conteo_borrador (
       anio SMALLINT NOT NULL,
       mes TINYINT NOT NULL,
       clave VARCHAR(48) NOT NULL,
       cantidad INT NOT NULL,
       finalizado TINYINT NOT NULL DEFAULT 0,
       PRIMARY KEY (anio, mes, clave)
     ) ENGINE=InnoDB`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS conteo_envios (
       id INT AUTO_INCREMENT PRIMARY KEY,
       anio SMALLINT NOT NULL,
       mes TINYINT NOT NULL,
       tipo VARCHAR(20) NOT NULL,
       enviado_en DATETIME NOT NULL,
       UNIQUE KEY uq_conteo_mes_tipo (anio, mes, tipo)
     ) ENGINE=InnoDB`
  );
  const [avisos] = await pool.query(
    "SELECT id FROM conteo_destinatarios WHERE aviso = 1 LIMIT 1"
  );
  if (!avisos.length) {
    await pool.query(
      `INSERT INTO conteo_destinatarios (email, aviso) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE aviso = 1`,
      [AVISO_INICIAL]
    );
  }
}

function escaparHtml(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineasPantalla(pantallas) {
  const datos = pantallas || {};
  return [
    ["En oficina", datos.total || 0],
    ["Comprobadas OK", datos.comprobadas_ok || 0],
    ["Vendidas", datos.vendidas || 0],
    ["Sin comprobar", datos.sin_comprobar || 0],
    ["Con falla/para repuestos", datos.con_falla || 0],
  ];
}

function htmlConteo(mesNombre, cantidades, enlace, pantallas) {
  const valor = (clave) => {
    const numero = entero(cantidades[clave]);
    return numero === null ? "0" : String(numero);
  };
  const filas = [];
  let grupo = "";
  let seccion = "";
  let celdas = [];
  const cerrarFila = () => {
    if (!celdas.length) return;
    if (celdas.length === 1) celdas.push(`<td style="width:50%;padding:6px;"></td>`);
    filas.push(`<tr>${celdas.join("")}</tr>`);
    celdas = [];
  };
  const titulo = (texto, estilo) => {
    cerrarFila();
    filas.push(`<tr><td colspan="2" style="${estilo}">${escaparHtml(texto)}</td></tr>`);
  };
  for (const item of ITEMS) {
    if (item.grupo !== grupo) {
      grupo = item.grupo;
      seccion = "";
      titulo(item.grupo === "paraguay" ? "PARAGUAY" : "ARGENTINA", "padding:18px 6px 4px;color:#ffb5a0;font-size:12px;font-weight:700;letter-spacing:2px;");
    }
    if (item.seccion !== seccion) {
      seccion = item.seccion;
      if (item.seccion !== "Paraguay") {
        titulo(item.seccion, "padding:10px 6px 2px;color:#ede0dd;font-size:15px;font-weight:600;");
      }
    }
    celdas.push(`<td style="width:50%;padding:6px;vertical-align:top;">
      <div style="background:#262221;border:1px solid #4f4542;border-radius:12px;padding:12px 14px;">
        <div style="color:#c9b8b3;font-size:12px;">${escaparHtml(item.etiqueta)}</div>
        <div style="color:#ede0dd;font-size:28px;line-height:1.2;font-weight:700;font-family:Consolas,monospace;">${escaparHtml(valor(item.key))}</div>
      </div>
    </td>`);
    if (celdas.length === 2) cerrarFila();
  }
  cerrarFila();
  titulo("PANTALLAS COLECTIVOS (24 Pulgadas)", "padding:18px 6px 4px;color:#ffb5a0;font-size:12px;font-weight:700;letter-spacing:2px;");
  for (const [etiqueta, cantidad] of lineasPantalla(pantallas)) {
    celdas.push(`<td style="width:50%;padding:6px;vertical-align:top;">
      <div style="background:#262221;border:1px solid #4f4542;border-radius:12px;padding:12px 14px;">
        <div style="color:#c9b8b3;font-size:12px;">${escaparHtml(etiqueta)}</div>
        <div style="color:#ede0dd;font-size:28px;line-height:1.2;font-weight:700;font-family:Consolas,monospace;">${escaparHtml(cantidad)}</div>
      </div>
    </td>`);
    if (celdas.length === 2) cerrarFila();
  }
  cerrarFila();
  const boton = enlace
    ? `<tr><td style="padding:18px 24px 0;">
        <a href="${escaparHtml(enlace)}" style="display:inline-block;background:#ffb5a0;color:#601400;text-decoration:none;font-weight:700;border-radius:12px;padding:10px 16px;">Abrir Stock mensual</a>
      </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:#151211;color:#ede0dd;color-scheme:dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#151211;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#1c1817;border:1px solid #4f4542;border-radius:16px;font-family:Segoe UI,Arial,sans-serif;">
        <tr><td style="padding:28px 24px 8px;color:#ede0dd;font-size:28px;font-weight:700;">Stock mensual</td></tr>
        <tr><td style="padding:0 24px 8px;color:#c9b8b3;font-size:14px;line-height:1.5;">Estimados, a continuación se detalla el stock correspondiente al mes de <strong style="color:#ede0dd;">${escaparHtml(mesNombre)}</strong>.</td></tr>
        <tr><td style="padding:0 18px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas.join("")}</table>
        </td></tr>
        <tr><td style="padding:8px 24px 0;color:#c9b8b3;font-size:14px;line-height:1.5;">Quedo a disposición ante cualquier consulta.<br>Saludos cordiales.</td></tr>
        ${boton}
        <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function textoConteo(mesNombre, cantidades, pantallas) {
  const valor = (clave) => {
    const numero = entero(cantidades[clave]);
    return numero === null ? "0" : String(numero);
  };
  return [
    "Estimados,",
    `A continuación, se detalla el stock correspondiente al mes de ${mesNombre}:`,
    "",
    "🇦🇷 ARGENTINA",
    "Oficina",
    `EBD: ${valor("ar_oficina_ebd")}`,
    `D3: ${valor("ar_oficina_d3")}`,
    `D3 (prueba): ${valor("ar_oficina_d3_prueba")}`,
    `Dongles: ${valor("ar_oficina_dongles")}`,
    `Cámaras: ${valor("ar_oficina_camaras")}`,
    `Pantallas Naranja: ${valor("ar_oficina_pantallas")}`,
    `EBD (16 GB): ${valor("ar_oficina_ebd16")}`,
    "Campiña",
    `EBD: ${valor("ar_campina_ebd")}`,
    `D3: ${valor("ar_campina_d3")}`,
    `D3+: ${valor("ar_campina_d3plus")}`,
    "",
    "Equipos a reparar (Bernardo)",
    `EBD: ${valor("ar_reparar_ebd")}`,
    "",
    "Equipos reparados (Bernardo)",
    `EBD: ${valor("ar_reparados_ebd")}`,
    "",
    "Showroom / Exhibición",
    `D3: ${valor("ar_showroom_d3")}`,
    `EBD (reparados): ${valor("ar_showroom_ebd")}`,
    "",
    "🇵🇾 PARAGUAY",
    `EBD: ${valor("py_ebd")}`,
    `D3: ${valor("py_d3")}`,
    "",
    "Pantallas Colectivos (24 Pulgadas)",
    ...lineasPantalla(pantallas).map(([etiqueta, cantidad]) => `${etiqueta}: ${cantidad}`),
    "",
    "Quedo a disposición ante cualquier consulta.",
    "Saludos cordiales.",
  ].join("\n");
}

function leerCantidades(crudo) {
  const cantidades = {};
  for (const item of ITEMS) {
    const numero = entero(crudo && crudo[item.key]);
    if (numero === null) throw errorEstado("Hay una cantidad que no es válida.", 400);
    cantidades[item.key] = numero;
  }
  return cantidades;
}

async function armarConteo() {
  await asegurarTablas();
  const fecha = fechaArgentina();
  const [categorias] = await pool.query(
    "SELECT nombre, pais, cantidad_actual FROM categorias_stock"
  );
  const porClave = new Map(
    categorias.map((fila) => [
      `${fila.pais}|${normalizarNombre(fila.nombre)}`,
      Number(fila.cantidad_actual) || 0,
    ])
  );
  const [destinatarios] = await pool.query(
    "SELECT email, aviso FROM conteo_destinatarios ORDER BY aviso DESC, email"
  );
  const aviso = (destinatarios.find((fila) => Number(fila.aviso) === 1) || {}).email || "";
  const correos = destinatarios
    .filter((fila) => Number(fila.aviso) !== 1)
    .map((fila) => fila.email);

  const [borrador] = await pool.query(
    "SELECT clave, cantidad, finalizado FROM conteo_borrador WHERE anio = ? AND mes = ?",
    [fecha.anio, fecha.mes]
  );
  const guardados = new Map(borrador.map((fila) => [fila.clave, fila]));
  const items = ITEMS.map((item) => {
    const stock = porClave.get(`${item.pais}|${normalizarNombre(item.categoria)}`) || 0;
    const guardado = guardados.get(item.key);
    return {
      key: item.key,
      grupo: item.grupo,
      seccion: item.seccion,
      etiqueta: item.etiqueta,
      stock,
      cantidad: guardado ? Number(guardado.cantidad) : stock,
      finalizado: guardado ? Number(guardado.finalizado) === 1 : false,
    };
  });

  return {
    anio: fecha.anio,
    mes: fecha.mes,
    mesNombre: fecha.mesNombre,
    aviso,
    correos,
    items,
    pantallas: await calcularPantallas(),
  };
}

function itemPorClave(clave) {
  return ITEMS.find((item) => item.key === clave) || null;
}

async function stockDeItem(item) {
  const [filas] = await pool.query(
    "SELECT nombre, cantidad_actual FROM categorias_stock WHERE pais = ?",
    [item.pais]
  );
  const encontrada = filas.find((fila) => normalizarNombre(fila.nombre) === normalizarNombre(item.categoria));
  return encontrada ? Number(encontrada.cantidad_actual) || 0 : 0;
}

async function guardarItemBorrador(clave, cantidadCruda, finalizadoCrudo) {
  await asegurarTablas();
  const item = itemPorClave(clave);
  if (!item) throw errorEstado("Ese ítem no existe.", 400);
  const cantidad = entero(cantidadCruda);
  if (cantidad === null) throw errorEstado("Hay una cantidad que no es válida.", 400);
  const finalizado = Boolean(finalizadoCrudo);
  const fecha = fechaArgentina();
  const stock = await stockDeItem(item);
  if (cantidad === stock && !finalizado) {
    await pool.query(
      "DELETE FROM conteo_borrador WHERE anio = ? AND mes = ? AND clave = ?",
      [fecha.anio, fecha.mes, item.key]
    );
    return;
  }
  await pool.query(
    `INSERT INTO conteo_borrador (anio, mes, clave, cantidad, finalizado)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad), finalizado = VALUES(finalizado)`,
    [fecha.anio, fecha.mes, item.key, cantidad, finalizado ? 1 : 0]
  );
}

async function resetBorrador() {
  await asegurarTablas();
  const fecha = fechaArgentina();
  await pool.query(
    "DELETE FROM conteo_borrador WHERE anio = ? AND mes = ?",
    [fecha.anio, fecha.mes]
  );
}

async function guardarCorreos(avisoCrudo, correosCrudo) {
  await asegurarTablas();
  const aviso = normalizarCorreo(avisoCrudo);
  if (!aviso) throw errorEstado("El correo del aviso no es válido.", 400);
  const lista = [];
  for (const correo of Array.isArray(correosCrudo) ? correosCrudo : []) {
    const normal = normalizarCorreo(correo);
    if (!normal) throw errorEstado("Hay un correo que no es válido.", 400);
    if (normal !== aviso && !lista.includes(normal)) lista.push(normal);
  }
  if (lista.length > 30) throw errorEstado("Podés prestablecer hasta 30 correos.", 400);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM conteo_destinatarios");
    await conn.query(
      "INSERT INTO conteo_destinatarios (email, aviso) VALUES (?, 1)",
      [aviso]
    );
    for (const email of lista) {
      await conn.query(
        "INSERT INTO conteo_destinatarios (email, aviso) VALUES (?, 0)",
        [email]
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

async function enviarConteo({ destino, cantidades, aviso, correos }) {
  if (destino !== "aviso" && destino !== "lista") {
    throw errorEstado("Indicá a quién se envía el conteo.", 400);
  }
  const cantidadesLimpias = leerCantidades(cantidades);
  await guardarCorreos(aviso, correos);
  const fecha = fechaArgentina();
  const pantallas = await calcularPantallas();
  const texto = textoConteo(fecha.mesNombre, cantidadesLimpias, pantallas);
  const asunto = `Stock correspondiente al mes de ${fecha.mesNombre}`;
  const enlace = `${APP_URL}/stock-mensual.html`;
  if (destino === "aviso") {
    const avisoNorm = normalizarCorreo(aviso);
    const cuerpo = [
      texto,
      "",
      "Para corregir el conteo físico entrá a Stock mensual. Esos cambios quedan en el formulario del sitio y no modifican el stock de la página:",
      enlace,
    ].join("\n");
    return enviarCorreo({
      to: [avisoNorm],
      subject: asunto,
      text: cuerpo,
      html: htmlConteo(fecha.mesNombre, cantidadesLimpias, enlace, pantallas),
    });
  }
  const lista = [];
  for (const correo of Array.isArray(correos) ? correos : []) {
    const normal = normalizarCorreo(correo);
    if (normal && normal !== normalizarCorreo(aviso) && !lista.includes(normal)) lista.push(normal);
  }
  if (!lista.length) throw errorEstado("Agregá al menos un correo para reenviar el conteo.", 400);
  return enviarCorreo({
    to: lista,
    subject: asunto,
    text: texto,
    html: htmlConteo(fecha.mesNombre, cantidadesLimpias, "", pantallas),
  });
}

async function enviarAvisoMensual() {
  const fecha = fechaArgentina();
  if (!fecha.esUltimo) return { enviado: false, motivo: "hoy no es el ultimo dia del mes" };
  await asegurarTablas();
  const [ya] = await pool.query(
    "SELECT id FROM conteo_envios WHERE anio = ? AND mes = ? AND tipo = 'aviso' LIMIT 1",
    [fecha.anio, fecha.mes]
  );
  if (ya.length) return { enviado: false, motivo: "ya se envio este mes" };

  const conteo = await armarConteo();
  if (!conteo.aviso) return { enviado: false, motivo: "no hay correo de aviso" };
  const cantidades = Object.fromEntries(conteo.items.map((item) => [item.key, item.cantidad]));
  await enviarConteo({
    destino: "aviso",
    cantidades,
    aviso: conteo.aviso,
    correos: conteo.correos,
  });
  await pool.query(
    "INSERT INTO conteo_envios (anio, mes, tipo, enviado_en) VALUES (?, ?, 'aviso', UTC_TIMESTAMP())",
    [fecha.anio, fecha.mes]
  );
  return { enviado: true, mes: fecha.mesNombre };
}

module.exports = {
  ITEMS,
  fechaArgentina,
  textoConteo,
  htmlConteo,
  armarConteo,
  guardarItemBorrador,
  resetBorrador,
  guardarCorreos,
  enviarConteo,
  enviarAvisoMensual,
};
