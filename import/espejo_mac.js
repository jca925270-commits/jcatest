const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const NATIVA = process.env.GOOGLE_SHEET_MAC_ID || "1YqSkbC5AMvVNrXlsQy_m1ElVbLUbXfcWRcRc-rofUK0";

function cuenta() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  const ruta = path.join(__dirname, "credenciales_google.json");
  if (!fs.existsSync(ruta)) return null;
  return JSON.parse(fs.readFileSync(ruta, "utf8"));
}

function norm(valor) {
  return String(valor || "")
    .replace(/\n/g, " ")
    .toUpperCase()
    .replace(/[°ºª]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mac(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return limpio.length >= 8 ? limpio.slice(0, 20) : "";
}

function vacio(valor) {
  const texto = norm(valor);
  return !texto || texto === "-" || texto === "#N/A" || texto === "#REF!" || texto === "#VALUE!";
}

function letra(indice) {
  let n = indice + 1;
  let texto = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    texto = String.fromCharCode(65 + resto) + texto;
    n = Math.floor((n - 1) / 26);
  }
  return texto;
}

async function token(credencial) {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(JSON.stringify({
    iss: credencial.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  })).toString("base64url");
  const firma = crypto.createSign("RSA-SHA256").update(`${encabezado}.${cuerpo}`).sign(credencial.private_key, "base64url");
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${encabezado}.${cuerpo}.${firma}`,
    }),
  });
  const data = await respuesta.json();
  if (!data.access_token) throw new Error("Google no autorizó la edición");
  return data.access_token;
}

async function pedir(url, acceso, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${acceso}`, ...(opciones.headers || {}) },
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    const limpio = texto.replace(/[0-9A-F]{8,}/gi, "…").slice(0, 180);
    throw new Error(`HTTP ${respuesta.status} ${limpio}`);
  }
  return texto ? JSON.parse(texto) : {};
}

function elegir(titulos, prefijo) {
  return titulos
    .filter((titulo) => {
      const limpio = String(titulo || "").trim().replace(/\s+/g, " ");
      if (prefijo.startsWith("Egreso D3 2.0")) return limpio.startsWith("Egreso D3 2.0 (venta");
      return limpio.startsWith(prefijo);
    })
    .sort((a, b) => b.length - a.length)[0] || "";
}

async function leerHoja(id, acceso, titulo) {
  const rango = `'${titulo.replace(/'/g, "''")}'!A1:L4000`;
  const cuerpo = await pedir(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(rango)}?valueRenderOption=FORMATTED_VALUE`,
    acceso
  );
  const filas = cuerpo.values || [];
  let header = -1;
  const columnas = {};
  for (let i = 0; i < filas.length; i += 1) {
    if ((filas[i] || []).some((valor) => norm(valor) === "MAC WIFI")) {
      header = i;
      (filas[i] || []).forEach((valor, indice) => {
        const clave = norm(valor);
        if (clave && columnas[clave] === undefined) columnas[clave] = indice;
      });
      break;
    }
  }
  const porMac = new Map();
  let ultima = header;
  if (header >= 0 && columnas["MAC WIFI"] !== undefined) {
    for (let i = header + 1; i < filas.length; i += 1) {
      const wifi = mac((filas[i] || [])[columnas["MAC WIFI"]]);
      if (!wifi) continue;
      ultima = i;
      if (!porMac.has(wifi)) porMac.set(wifi, i);
    }
  }
  return { titulo, filas, header, columnas, porMac, ultima };
}

async function main() {
  const credencial = cuenta();
  if (!credencial) {
    console.error("sin credenciales");
    process.exit(2);
  }
  const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const acceso = await token(credencial);
  const meta = await pedir(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(NATIVA)}?fields=sheets.properties.title`,
    acceso
  );
  const titulos = (meta.sheets || []).map((hoja) => hoja.properties && hoja.properties.title).filter(Boolean);
  const cache = new Map();
  async function hoja(prefijo) {
    if (cache.has(prefijo)) return cache.get(prefijo);
    const titulo = elegir(titulos, prefijo);
    if (!titulo) throw new Error(`No está la pestaña ${prefijo}`);
    const leida = await leerHoja(NATIVA, acceso, titulo);
    cache.set(prefijo, leida);
    return leida;
  }
  const data = [];
  let filas = 0;
  let celdas = 0;
  for (const item of plan.completar || []) {
    const actual = await hoja(item.prefijo);
    const fila = actual.porMac.get(mac(item.mac));
    const columna = actual.columnas[item.columna];
    if (fila === undefined || columna === undefined) continue;
    const valor = (actual.filas[fila] || [])[columna];
    if (!vacio(valor)) continue;
    data.push({
      range: `'${actual.titulo.replace(/'/g, "''")}'!${letra(columna)}${fila + 1}`,
      values: [[item.valor]],
    });
    celdas += 1;
  }
  const siguientes = new Map();
  for (const item of plan.copiar || []) {
    const actual = await hoja(item.prefijo);
    if (actual.header < 0 || actual.columnas["MAC WIFI"] === undefined) continue;
    const wifi = mac(item.celdas["MAC WIFI"]);
    if (!wifi || actual.porMac.has(wifi)) continue;
    let destino = siguientes.has(item.prefijo) ? siguientes.get(item.prefijo) : actual.ultima + 1;
    while ((mac((actual.filas[destino] || [])[actual.columnas["MAC WIFI"]]))) destino += 1;
    siguientes.set(item.prefijo, destino + 1);
    actual.porMac.set(wifi, destino);
    for (const [clave, valor] of Object.entries(item.celdas)) {
      const columna = actual.columnas[clave];
      if (columna === undefined || !valor) continue;
      data.push({
        range: `'${actual.titulo.replace(/'/g, "''")}'!${letra(columna)}${destino + 1}`,
        values: [[valor]],
      });
    }
    filas += 1;
  }
  if (process.env.ESPEJO_SECO === "1") {
    console.log(`seco filas ${filas} celdas ${celdas}`);
    return;
  }
  if (!data.length) {
    console.log("sin cambios");
    return;
  }
  await pedir(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(NATIVA)}/values:batchUpdate`,
    acceso,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    }
  );
  console.log(`escritas filas ${filas} celdas ${celdas}`);
}

main().catch((error) => {
  console.error(String(error.message || error).slice(0, 200));
  process.exit(1);
});
