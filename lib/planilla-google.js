const crypto = require("crypto");
const { parsearPlanilla, letraColumna, limpiar } = require("./planilla-xlsx");

const HOJAS_MAC = [
  { familia: "EBD", operacion: "ingreso", prefijo: "Ingreso EBD Oficina" },
  { familia: "EBD_REP", operacion: "ingreso", prefijo: "Ingreso EBD REPARADO" },
  { familia: "PANTALLA", operacion: "ingreso", prefijo: "Ingreso Pantallas" },
  { familia: "D3", operacion: "ingreso", prefijo: "Ingreso D3 Oficina" },
  { familia: "EBD", operacion: "egreso", prefijo: "Egreso EBD 2.0" },
  { familia: "EBD_REP", operacion: "egreso", prefijo: "Egreso EBD REPARADO" },
  { familia: "PANTALLA", operacion: "egreso", prefijo: "Egreso Pantallas" },
  { familia: "D3", operacion: "egreso", prefijo: "Egreso D3 2.0 (venta" },
  { familia: "D3", operacion: "devolucion", prefijo: "Devo D3 Oficina" },
];

function cuentaGoogle() {
  const crudo = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!crudo) return null;
  try {
    return JSON.parse(crudo);
  } catch (_) {
    return null;
  }
}

async function tokenDe(cuenta) {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(JSON.stringify({
    iss: cuenta.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  })).toString("base64url");
  const firma = crypto.createSign("RSA-SHA256").update(`${encabezado}.${cuerpo}`).sign(cuenta.private_key, "base64url");
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${encabezado}.${cuerpo}.${firma}`,
    }),
  });
  const data = await respuesta.json();
  if (!data.access_token) throw new Error("Google no autorizó la edición.");
  return data.access_token;
}

async function leerPlanilla() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) return null;
  const respuesta = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=xlsx`);
  if (!respuesta.ok) return null;
  return parsearPlanilla(Buffer.from(await respuesta.arrayBuffer()));
}

function fechaPlanilla(iso) {
  const partes = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return "";
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

function idMac() {
  return process.env.GOOGLE_SHEET_MAC_ID || "1fNSvCBnYOqBd-IwC6lAdQw6cepZbsAIg8lHj2uGgloU";
}

function nombreExportado(titulo) {
  return String(titulo || "").replace(/[\\/:?*[\]]/g, "").slice(0, 31);
}

async function tituloReal(id, acceso, nombreXlsx) {
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${acceso}` } }
  );
  if (!meta.ok) return nombreXlsx;
  const cuerpo = await meta.json();
  const titulos = (cuerpo.sheets || []).map((hoja) => hoja.properties && hoja.properties.title).filter(Boolean);
  return titulos.find((titulo) => titulo === nombreXlsx || nombreExportado(titulo) === nombreXlsx) || nombreXlsx;
}

function norm(valor) {
  return limpiar(valor).toUpperCase().replace(/°/g, "").replace(/º/g, "").replace(/ª/g, "");
}

function macPlanilla(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return limpio.length >= 12 ? limpio.slice(0, 12) : "";
}

function clienteLibre(valor) {
  const limpio = limpiar(valor);
  if (!limpio || limpio === "-" || /^#N\/A$/i.test(limpio)) return true;
  const plano = limpio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /^EN\s+(EL\s+)?DEPOSITO$/.test(plano);
}

function columnaDe(titulo) {
  const texto = norm(titulo);
  if (texto === "FECHA DE LLEGADA") return "llegada";
  if (texto === "FECHA DE CARGA") return "carga";
  if (texto === "FECHA DE DESPACHO") return "despacho";
  if (texto === "FECHA DE DEVOLUCION") return "devolucion";
  if (texto === "MAC WIFI") return "wifi";
  if (texto === "MAC ETH") return "eth";
  if (texto === "LOTE") return "lote";
  if (texto === "CLIENTE") return "cliente";
  if (texto === "CAJA N" || texto === "CAJA" || texto === "REPARADO N") return "caja";
  return "";
}

async function hojaMac(familia, operacion) {
  const cuenta = cuentaGoogle();
  const id = idMac();
  const destino = HOJAS_MAC.find((hoja) => hoja.familia === familia && hoja.operacion === operacion);
  if (!cuenta || !id || !destino) return null;
  const acceso = await tokenDe(cuenta);
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties(title,gridProperties.rowCount)`,
    { headers: { Authorization: `Bearer ${acceso}` } }
  );
  if (!meta.ok) return null;
  const cuerpo = await meta.json();
  const hojas = (cuerpo.sheets || []).map((hoja) => hoja.properties).filter((prop) => prop && prop.title);
  const elegida = hojas
    .filter((prop) => {
      const limpio = String(prop.title).trim().replace(/\s+/g, " ").replace(/^Engreso\b/i, "Egreso");
      return limpio.startsWith(destino.prefijo) || nombreExportado(limpio).startsWith(destino.prefijo);
    })
    .sort((a, b) => b.title.length - a.title.length)[0];
  if (!elegida) return null;
  const nombre = elegida.title;
  const hasta = Math.min(Math.max(Number(elegida.gridProperties && elegida.gridProperties.rowCount) || 2000, 1), 8000);
  const rango = `'${nombre.replace(/'/g, "''")}'!A1:L${hasta}`;
  const respuesta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(rango)}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${acceso}` } }
  );
  if (!respuesta.ok) return null;
  const valores = await respuesta.json();
  let headerFila = 0;
  const columnas = new Map();
  const filas = [];
  for (const [indice, fila] of (valores.values || []).entries()) {
    const numero = indice + 1;
    const celdas = new Map();
    fila.forEach((valor, col) => celdas.set(col + 1, valor));
    if (!headerFila) {
      for (const valor of celdas.values()) {
        if (norm(valor) === "MAC WIFI") headerFila = numero;
      }
      if (headerFila === numero) {
        for (const [col, valor] of celdas) {
          const clave = columnaDe(valor);
          if (clave && !columnas.has(clave)) columnas.set(clave, col);
        }
      }
    }
    filas.push([numero, celdas]);
  }
  if (!headerFila || !columnas.has("wifi")) return null;
  return { id, acceso, nombre, columnas, filas, headerFila };
}

async function escribirMac(equipo) {
  const hoja = await hojaMac(equipo.familia, equipo.operacion);
  if (!hoja) return { ok: false };
  const id = hoja.id;
  const acceso = hoja.acceso;
  const columnas = hoja.columnas;
  const headerFila = hoja.headerFila;
  let ultima = 0;
  let filaLibre = 0;
  let fechaLibreVacia = false;
  const buscadaWifi = macPlanilla(equipo.wifi);
  const buscadaEth = macPlanilla(equipo.eth);
  for (const [numero, celdas] of hoja.filas) {
    if (numero <= headerFila) continue;
    const wifiHex = macPlanilla(columnas.has("wifi") ? celdas.get(columnas.get("wifi")) : "");
    const ethHex = macPlanilla(columnas.has("eth") ? celdas.get(columnas.get("eth")) : "");
    if (wifiHex.length >= 8) ultima = numero;
    const coincide = (buscadaWifi && (wifiHex === buscadaWifi || ethHex === buscadaWifi))
      || (buscadaEth && (wifiHex === buscadaEth || ethHex === buscadaEth));
    if (equipo.reemplazar && coincide && columnas.has("cliente") && clienteLibre(celdas.get(columnas.get("cliente")))) {
      filaLibre = numero;
      const fechaCelda = columnas.has("despacho") ? limpiar(celdas.get(columnas.get("despacho"))) : "";
      fechaLibreVacia = !fechaCelda;
    }
  }
  const reemplazo = filaLibre > 0 && Boolean(equipo.cliente);
  const fila = reemplazo ? filaLibre : Math.max(headerFila, ultima) + 1;
  const nombreHoja = hoja.nombre;
  const valores = {
    cliente: equipo.cliente || "",
    llegada: fechaPlanilla(equipo.fechaLlegada),
    carga: fechaPlanilla(equipo.fechaCarga),
    despacho: fechaPlanilla(equipo.fechaDespacho),
    devolucion: fechaPlanilla(equipo.fechaDespacho),
    wifi: macPlanilla(equipo.wifi),
    eth: macPlanilla(equipo.eth),
    lote: equipo.lote || "",
    caja: equipo.caja || "",
  };
  const data = [];
  const celdasAEscribir = reemplazo
    ? ["cliente", ...(fechaLibreVacia ? ["despacho"] : [])]
    : [...columnas.keys()];
  for (const clave of celdasAEscribir) {
    if (!valores[clave] || !columnas.has(clave)) continue;
    data.push({
      range: `'${nombreHoja.replace(/'/g, "''")}'!${letraColumna(columnas.get(clave))}${fila}`,
      values: [[valores[clave]]],
    });
  }
  if (!data.length) return { ok: false };
  const escrito = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${acceso}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    }
  );
  if (!escrito.ok) {
    let motivo = "";
    try {
      const cuerpo = await escrito.json();
      motivo = String((cuerpo.error && cuerpo.error.message) || "").slice(0, 180);
    } catch (_) { /* sin detalle */ }
    return { ok: false, estado: escrito.status, motivo };
  }
  return { ok: true, hoja: nombreHoja, fila, reemplazo };
}

async function escribirMovimiento(movimiento) {
  const cuenta = cuentaGoogle();
  if (!cuenta || !process.env.GOOGLE_SHEET_ID) return { ok: false };
  const hojas = await leerPlanilla();
  const hoja = (hojas || []).find((item) => item.pais === movimiento.pais);
  if (!hoja) return { ok: false };
  const bloque = hoja.bloques.find((item) => limpiar(item.nombre) === limpiar(movimiento.categoria));
  if (!bloque) return { ok: false };
  if (hoja.siguiente > 1241) return { ok: false, llena: true };
  const acceso = await tokenDe(cuenta);
  const data = [{
    range: `'${hoja.nombre}'!A${hoja.siguiente}:G${hoja.siguiente}`,
    values: [[
      fechaPlanilla(movimiento.fecha),
      movimiento.estado,
      movimiento.remito,
      movimiento.factura,
      movimiento.razon,
      movimiento.ticket,
      movimiento.motivo,
    ]],
  }];
  if (movimiento.ingreso) {
    data.push({
      range: `'${hoja.nombre}'!${letraColumna(bloque.columnaIngreso)}${hoja.siguiente}`,
      values: [[movimiento.ingreso]],
    });
  }
  if (movimiento.egreso) {
    data.push({
      range: `'${hoja.nombre}'!${letraColumna(bloque.columnaEgreso)}${hoja.siguiente}`,
      values: [[movimiento.egreso]],
    });
  }
  const respuesta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEET_ID)}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${acceso}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    }
  );
  if (!respuesta.ok) {
    let motivo = "";
    try {
      const cuerpo = await respuesta.json();
      motivo = String((cuerpo.error && cuerpo.error.message) || "").slice(0, 180);
    } catch (_) { /* sin detalle */ }
    return { ok: false, estado: respuesta.status, motivo };
  }
  return { ok: true, hoja: hoja.nombre, fila: hoja.siguiente };
}

async function aplicarCeldas(id, acceso, data) {
  if (!data.length) return { ok: false };
  const escrito = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${acceso}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    }
  );
  if (!escrito.ok) {
    let motivo = "";
    try {
      const cuerpo = await escrito.json();
      motivo = String((cuerpo.error && cuerpo.error.message) || "").slice(0, 180);
    } catch (_) { /* sin detalle */ }
    return { ok: false, estado: escrito.status, motivo };
  }
  return { ok: true };
}

function celda(nombre, columna, fila, valor) {
  return {
    range: `'${String(nombre).replace(/'/g, "''")}'!${letraColumna(columna)}${fila}`,
    values: [[valor == null ? "" : valor]],
  };
}

async function planillaStock(movimiento) {
  const hojas = await leerPlanilla();
  const hoja = (hojas || []).find((item) => item.pais === movimiento.pais);
  if (!hoja) return null;
  const bloque = hoja.bloques.find((item) => limpiar(item.nombre) === limpiar(movimiento.categoria));
  return { hoja, bloque };
}

async function actualizarMovimiento(movimiento) {
  const cuenta = cuentaGoogle();
  if (!cuenta || !process.env.GOOGLE_SHEET_ID || !(movimiento.fila > 0)) return { ok: false };
  const planilla = await planillaStock(movimiento);
  if (!planilla || !planilla.bloque) return { ok: false };
  const acceso = await tokenDe(cuenta);
  const { hoja, bloque } = planilla;
  const data = [{
    range: `'${hoja.nombre}'!A${movimiento.fila}:G${movimiento.fila}`,
    values: [[
      fechaPlanilla(movimiento.fecha),
      movimiento.estado || "",
      movimiento.remito || "",
      movimiento.factura || "",
      movimiento.razon || "",
      movimiento.ticket || "",
      movimiento.motivo || "",
    ]],
  }, celda(hoja.nombre, bloque.columnaIngreso, movimiento.fila, movimiento.ingreso || ""),
    celda(hoja.nombre, bloque.columnaEgreso, movimiento.fila, movimiento.egreso || "")];
  return aplicarCeldas(process.env.GOOGLE_SHEET_ID, acceso, data);
}

async function vaciarMovimiento(movimiento) {
  const cuenta = cuentaGoogle();
  if (!cuenta || !process.env.GOOGLE_SHEET_ID || !(movimiento.fila > 0)) return { ok: false };
  const planilla = await planillaStock(movimiento);
  if (!planilla) return { ok: false };
  const acceso = await tokenDe(cuenta);
  const { hoja, bloque } = planilla;
  const data = [{
    range: `'${hoja.nombre}'!A${movimiento.fila}:G${movimiento.fila}`,
    values: [["", "", "", "", "", "", ""]],
  }];
  if (bloque) {
    data.push(celda(hoja.nombre, bloque.columnaIngreso, movimiento.fila, ""));
    data.push(celda(hoja.nombre, bloque.columnaEgreso, movimiento.fila, ""));
  }
  return aplicarCeldas(process.env.GOOGLE_SHEET_ID, acceso, data);
}

async function columnasMac(familia, operacion) {
  const hoja = await hojaMac(familia, operacion);
  if (!hoja) return null;
  return hoja;
}

async function actualizarMacEnFila(equipo) {
  if (!(equipo.fila > 0)) return { ok: true, omitida: true };
  const hoja = await columnasMac(equipo.familia, equipo.operacion);
  if (!hoja) return { ok: false };
  const valores = {};
  if (equipo.cliente !== undefined) valores.cliente = equipo.cliente || "";
  if (equipo.fechaLlegada !== undefined) valores.llegada = fechaPlanilla(equipo.fechaLlegada);
  if (equipo.fechaCarga !== undefined) valores.carga = fechaPlanilla(equipo.fechaCarga);
  if (equipo.fechaDespacho !== undefined) {
    valores.despacho = fechaPlanilla(equipo.fechaDespacho);
    valores.devolucion = fechaPlanilla(equipo.fechaDespacho);
  }
  if (equipo.lote !== undefined) valores.lote = equipo.lote || "";
  if (equipo.caja !== undefined) valores.caja = equipo.caja || "";
  if (equipo.wifi !== undefined) valores.wifi = macPlanilla(equipo.wifi);
  if (equipo.eth !== undefined) valores.eth = macPlanilla(equipo.eth);
  const data = [];
  for (const [clave, col] of hoja.columnas) {
    if (!Object.prototype.hasOwnProperty.call(valores, clave)) continue;
    data.push(celda(hoja.nombre, col, equipo.fila, valores[clave]));
  }
  return aplicarCeldas(hoja.id, hoja.acceso, data);
}

async function liberarMacEnFila(equipo) {
  if (!(equipo.fila > 0)) return { ok: true, omitida: true };
  const hoja = await columnasMac(equipo.familia, equipo.operacion);
  if (!hoja) return { ok: false };
  const data = [];
  if (hoja.columnas.has("cliente")) {
    data.push(celda(hoja.nombre, hoja.columnas.get("cliente"), equipo.fila, "EN DEPOSITO"));
  }
  if (hoja.columnas.has("despacho")) data.push(celda(hoja.nombre, hoja.columnas.get("despacho"), equipo.fila, ""));
  if (hoja.columnas.has("devolucion")) data.push(celda(hoja.nombre, hoja.columnas.get("devolucion"), equipo.fila, ""));
  return aplicarCeldas(hoja.id, hoja.acceso, data);
}

module.exports = {
  escribirMovimiento,
  escribirMac,
  cuentaGoogle,
  actualizarMovimiento,
  vaciarMovimiento,
  actualizarMacEnFila,
  liberarMacEnFila,
};
