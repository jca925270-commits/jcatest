/**
 * Copia a Ingreso y Egreso EBD REPARADO los equipos del relevamiento
 * cuya última columna dice Finalizado y que todavía no están en la base de MAC.
 * Falla y En prueba no se copian.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RELEVAMIENTO = "16Ag2IJwMRHQSkrRIO8pC9ea4dxcSab6EC3TGKg0XmTI";
const MAC_ID = "1fNSvCBnYOqBd-IwC6lAdQw6cepZbsAIg8lHj2uGgloU";
const GID = 858227489;
const COL = { numero: 0, fin: 4, mac: 5, estado: 12 };

function cuenta() {
  let texto = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if ((texto.startsWith('"') && texto.endsWith('"')) || (texto.startsWith("'") && texto.endsWith("'"))) {
    texto = texto.slice(1, -1);
  }
  const candidatos = texto ? [texto, texto.replace(/\\n/g, "\n"), texto.replace(/\r?\n/g, "\\n")] : [];
  for (const candidato of candidatos) {
    try {
      let parsed = JSON.parse(candidato);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (!parsed || !parsed.client_email || !parsed.private_key) continue;
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
      return parsed;
    } catch (_) { /* otro formato */ }
  }
  const ruta = path.join(__dirname, "credenciales_google.json");
  if (!fs.existsSync(ruta)) return null;
  return JSON.parse(fs.readFileSync(ruta, "utf8"));
}

async function tokenDe(c) {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(JSON.stringify({
    iss: c.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  })).toString("base64url");
  const firma = crypto.createSign("RSA-SHA256").update(`${encabezado}.${cuerpo}`).sign(c.private_key, "base64url");
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${encabezado}.${cuerpo}.${firma}`,
    }),
  });
  const data = await respuesta.json();
  if (!data.access_token) throw new Error("Google no autorizó la lectura del relevamiento.");
  return data.access_token;
}

async function api(url, acceso, opciones) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${acceso}`, ...(opciones && opciones.headers) },
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`Google respondió ${respuesta.status}: ${texto.slice(0, 160)}`);
  return texto ? JSON.parse(texto) : {};
}

function plano(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function macsDe(valor) {
  const hallados = String(valor || "").toUpperCase().match(/[0-9A-F]{2}(?::[0-9A-F]{2}){5}|[0-9A-F]{12}/g) || [];
  const limpios = hallados.map((mac) => mac.replace(/[^0-9A-F]/g, "")).filter((mac) => mac.length === 12);
  return limpios.length >= 2 ? [limpios[0], limpios[1]] : null;
}

function numeroDe(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(Math.trunc(valor));
  const texto = String(valor || "").trim();
  return /^\d+$/.test(texto) ? texto : "";
}

function hoyArgentina() {
  const ahora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getUTCDate()).padStart(2, "0");
  return `${ahora.getUTCFullYear()}-${mes}-${dia}`;
}

function fechaDe(valor, hoy) {
  const texto = String(valor || "").trim();
  let iso = "";
  const diaMes = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const anioMes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (diaMes) {
    const dia = Number(diaMes[1]);
    const mes = Number(diaMes[2]);
    const anio = Number(diaMes[3]);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    if (fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia) {
      iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  } else if (anioMes) {
    iso = `${anioMes[1]}-${anioMes[2]}-${anioMes[3]}`;
  }
  if (!iso || iso > hoy) return hoy;
  return iso;
}

function fechaPlanilla(iso) {
  const partes = iso.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tituloDe(titulos, prefijo) {
  return titulos
    .filter((titulo) => {
      const limpio = String(titulo).trim().replace(/\s+/g, " ").replace(/^Engreso\b/i, "Egreso");
      return limpio.startsWith(prefijo);
    })
    .sort((a, b) => b.length - a.length)[0] || "";
}

function rango(titulo, celdas) {
  return `'${String(titulo).replace(/'/g, "''")}'!${celdas}`;
}

async function leerValores(acceso, id, titulo, celdas) {
  const cuerpo = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(rango(titulo, celdas))}?valueRenderOption=FORMATTED_VALUE`,
    acceso
  );
  return cuerpo.values || [];
}

function macsPresentes(filas) {
  const presentes = new Set();
  for (const fila of filas) {
    for (const valor of fila || []) {
      const macs = macsDe(valor);
      if (!macs) {
        const uno = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
        if (uno.length === 12) presentes.add(uno);
        continue;
      }
      presentes.add(macs[0]);
      presentes.add(macs[1]);
    }
  }
  return presentes;
}

function ultimaConDatos(filas) {
  let ultima = 0;
  filas.forEach((fila, indice) => {
    if ((fila || []).some((celda) => String(celda || "").trim())) ultima = indice + 1;
  });
  return ultima;
}

async function escribir(acceso, titulo, ubicadas) {
  const data = ubicadas.map((fila) => ({
    range: rango(titulo, `A${fila.numero}:F${fila.numero}`),
    values: [fila.valores],
  }));
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAC_ID}/values:batchUpdate`,
    acceso,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    }
  );
}

async function confirmar(acceso, titulo, ubicadas) {
  const consultas = ubicadas.map((fila) => `ranges=${encodeURIComponent(rango(titulo, `C${fila.numero}`))}`);
  const cuerpo = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAC_ID}/values:batchGet?${consultas.join("&")}&valueRenderOption=FORMATTED_VALUE`,
    acceso
  );
  const leidas = cuerpo.valueRanges || [];
  return ubicadas.filter((fila, indice) => {
    const celda = leidas[indice] && leidas[indice].values && leidas[indice].values[0] && leidas[indice].values[0][0];
    const mac = String(celda || "").toUpperCase().replace(/[^0-9A-F]/g, "");
    return mac !== fila.valores[2];
  });
}

async function guardar(acceso, titulo, bloque, filas) {
  if (!filas.length) return;
  const inicio = ultimaConDatos(bloque) + 1;
  const ubicadas = filas.map((valores, indice) => ({ numero: inicio + indice, valores }));
  await escribir(acceso, titulo, ubicadas);
  let faltan = await confirmar(acceso, titulo, ubicadas);
  if (faltan.length) {
    await escribir(acceso, titulo, faltan);
    faltan = await confirmar(acceso, titulo, ubicadas);
    if (faltan.length) throw new Error(`La pestaña ${titulo.trim()} no recibió todos los finalizados.`);
  }
}

async function migrarFinalizados(opciones = {}) {
  const soloContar = Boolean(opciones.contar);
  const credencial = cuenta();
  if (!credencial) {
    const error = new Error("Sin cuenta de Google para migrar los finalizados.");
    error.status = 500;
    throw error;
  }
  const acceso = await tokenDe(credencial);
  const metaRelevamiento = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${RELEVAMIENTO}?fields=sheets.properties(title,sheetId)`,
    acceso
  );
  const origen = (metaRelevamiento.sheets || [])
    .map((hoja) => hoja.properties)
    .find((hoja) => hoja && hoja.sheetId === GID);
  if (!origen) throw new Error("No está la pestaña de testeo del relevamiento.");
  const filasOrigen = await leerValores(acceso, RELEVAMIENTO, origen.title, "A:M");

  const metaMac = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAC_ID}?fields=sheets.properties.title`,
    acceso
  );
  const titulos = (metaMac.sheets || []).map((hoja) => hoja.properties && hoja.properties.title).filter(Boolean);
  const tituloIngreso = tituloDe(titulos, "Ingreso EBD REPARADO");
  const tituloEgreso = tituloDe(titulos, "Egreso EBD REPARADO");
  if (!tituloIngreso || !tituloEgreso) throw new Error("No están las pestañas de EBD reparado.");

  const [bloqueIngreso, bloqueEgreso] = await Promise.all([
    leerValores(acceso, MAC_ID, tituloIngreso, "A:F"),
    leerValores(acceso, MAC_ID, tituloEgreso, "A:F"),
  ]);
  const ingreso = macsPresentes(bloqueIngreso);
  const egreso = macsPresentes(bloqueEgreso);
  const hoy = hoyArgentina();
  let finalizados = 0;
  let falla = 0;
  let prueba = 0;
  const candidatos = [];
  for (const fila of filasOrigen) {
    const estado = plano(fila[COL.estado]);
    if (estado === "FALLA") falla += 1;
    if (estado === "EN PRUEBA") prueba += 1;
    if (estado !== "FINALIZADO") continue;
    finalizados += 1;
    const macs = macsDe(fila[COL.mac]);
    const numero = numeroDe(fila[COL.numero]);
    if (!macs || !numero) continue;
    candidatos.push({
      numero: Number(numero),
      numeroTexto: numero,
      wifi: macs[0],
      eth: macs[1],
      fecha: fechaPlanilla(fechaDe(fila[COL.fin], hoy)),
    });
  }
  candidatos.sort((a, b) => b.numero - a.numero);
  const vistos = new Set();
  const nuevos = [];
  for (const item of candidatos) {
    if (vistos.has(item.wifi) || vistos.has(item.eth)) continue;
    vistos.add(item.wifi);
    vistos.add(item.eth);
    const enIngreso = ingreso.has(item.wifi) || ingreso.has(item.eth);
    const enEgreso = egreso.has(item.wifi) || egreso.has(item.eth);
    if (enIngreso && enEgreso) continue;
    nuevos.push({ ...item, ingreso: !enIngreso, egreso: !enEgreso });
  }

  if (!soloContar && nuevos.length) {
    await guardar(acceso, tituloIngreso, bloqueIngreso, nuevos.filter((item) => item.ingreso).map((item) => [
      item.fecha, item.fecha, item.wifi, item.eth, "EN DEPOSITO", item.numeroTexto,
    ]));
    await guardar(acceso, tituloEgreso, bloqueEgreso, nuevos.filter((item) => item.egreso).map((item) => [
      "EN DEPOSITO", item.fecha, item.wifi, item.eth, "EN DEPOSITO", item.numeroTexto,
    ]));
  }

  const resultado = { finalizados, nuevos: nuevos.length, falla, prueba };
  console.log(`relevamiento finalizados=${resultado.finalizados} nuevos=${resultado.nuevos} falla=${resultado.falla} prueba=${resultado.prueba}`);
  return resultado;
}

if (require.main === module) {
  migrarFinalizados({ contar: process.argv.includes("--contar") }).catch((error) => {
    console.error(String(error.message || error).slice(0, 200));
    process.exit(1);
  });
}

module.exports = { migrarFinalizados };
