const zlib = require("zlib");

function entradasZip(buffer) {
  let eocd = -1;
  const minimo = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= minimo; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("La planilla no se pudo leer.");
  const archivos = new Map();
  let central = buffer.readUInt32LE(eocd + 16);
  const total = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(central) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(central + 10);
    const comprimido = buffer.readUInt32LE(central + 20);
    const nombreLen = buffer.readUInt16LE(central + 28);
    const extraLen = buffer.readUInt16LE(central + 30);
    const comentarioLen = buffer.readUInt16LE(central + 32);
    const local = buffer.readUInt32LE(central + 42);
    const nombre = buffer.slice(central + 46, central + 46 + nombreLen).toString("utf8");
    const extraLocal = buffer.readUInt16LE(local + 28);
    const nombreLocal = buffer.readUInt16LE(local + 26);
    const inicio = local + 30 + nombreLocal + extraLocal;
    const datos = buffer.slice(inicio, inicio + comprimido);
    if (metodo === 0) archivos.set(nombre, datos);
    else if (metodo === 8) archivos.set(nombre, zlib.inflateRawSync(datos));
    central += 46 + nombreLen + extraLen + comentarioLen;
  }
  return archivos;
}

function decodificar(texto) {
  return String(texto || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function textosCompartidos(xml) {
  const lista = [];
  const partes = xml.split("<si>");
  for (let i = 1; i < partes.length; i += 1) {
    const trozo = partes[i].split("</si>")[0];
    const textos = [...trozo.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => decodificar(m[1]));
    lista.push(textos.join(""));
  }
  return lista;
}

function numeroColumna(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function letraColumna(n) {
  let texto = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    texto = String.fromCharCode(65 + resto) + texto;
    n = Math.floor((n - 1) / 26);
  }
  return texto;
}

function limpiar(valor) {
  const texto = String(valor || "").replace(/\s+/g, " ").trim();
  return texto || "";
}

function filasDe(xml, strings) {
  const filas = new Map();
  for (const fila of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const numero = Number(fila[1]);
    const celdas = new Map();
    for (const celda of fila[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!celda[4]) continue;
      const valor = /<v>([^<]*)<\/v>/.exec(celda[4]);
      if (!valor) continue;
      const tipo = /t="([^"]+)"/.exec(celda[3]);
      const texto = tipo && tipo[1] === "s" ? (strings[Number(valor[1])] || "") : valor[1];
      celdas.set(numeroColumna(celda[1]), texto);
    }
    filas.set(numero, celdas);
  }
  return filas;
}

function bloquesDe(filas, filaHeaders) {
  const bloques = [];
  const nombres = filas.get(filaHeaders - 3) || new Map();
  const headers = filas.get(filaHeaders) || new Map();
  let actual = "";
  let pendiente = null;
  const ultima = Math.max(0, ...headers.keys());
  for (let col = 8; col <= ultima; col += 1) {
    const etiqueta = limpiar(nombres.get(col));
    if (etiqueta && etiqueta.toLowerCase() !== "o") actual = etiqueta;
    const header = limpiar(headers.get(col)).toLowerCase();
    if (header.includes("ingreso")) {
      pendiente = { nombre: actual, columnaIngreso: col, columnaEgreso: null };
    } else if (header.includes("egreso") && pendiente) {
      pendiente.columnaEgreso = col;
      bloques.push(pendiente);
      pendiente = null;
    }
  }
  return bloques;
}

function parsearPlanilla(buffer) {
  const zip = entradasZip(buffer);
  const libro = zip.get("xl/workbook.xml");
  if (!libro) throw new Error("La planilla no se pudo leer.");
  const xmlLibro = libro.toString("utf8");
  const rels = (zip.get("xl/_rels/workbook.xml.rels") || Buffer.from("")).toString("utf8");
  const rutas = new Map();
  for (const rel of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const destino = rel[2].replace(/^\//, "");
    rutas.set(rel[1], destino.startsWith("xl/") ? destino : `xl/${destino}`);
  }
  const strings = textosCompartidos((zip.get("xl/sharedStrings.xml") || Buffer.from("")).toString("utf8"));
  const hojas = [];
  for (const hoja of xmlLibro.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const pais = hoja[1].trim().toUpperCase();
    if (pais !== "ARGENTINA" && pais !== "PARAGUAY") continue;
    const xml = (zip.get(rutas.get(hoja[2])) || Buffer.from("")).toString("utf8");
    const filas = filasDe(xml, strings);
    let filaHeaders = 0;
    for (const [numero, celdas] of filas) {
      if (numero > 15) break;
      if (limpiar(celdas.get(1)).toUpperCase() === "FECHA") {
        filaHeaders = numero;
        break;
      }
    }
    if (!filaHeaders) continue;
    const bloques = bloquesDe(filas, filaHeaders);
    let ultima = filaHeaders;
    for (let n = filaHeaders + 1; n <= 1241; n += 1) {
      const celdas = filas.get(n);
      if (!celdas) continue;
      const hay = limpiar(celdas.get(1)) || limpiar(celdas.get(2)) || limpiar(celdas.get(5));
      const cantidad = bloques.some((b) => limpiar(celdas.get(b.columnaIngreso)) || limpiar(celdas.get(b.columnaEgreso)));
      if (hay || cantidad) ultima = n;
    }
    hojas.push({
      nombre: hoja[1],
      pais,
      filaHeaders,
      siguiente: Math.min(ultima + 1, 1241),
      bloques,
    });
  }
  return hojas;
}

function abrirLibro(buffer) {
  const zip = entradasZip(buffer);
  const libro = zip.get("xl/workbook.xml");
  if (!libro) throw new Error("La planilla no se pudo leer.");
  const xmlLibro = libro.toString("utf8");
  const rels = (zip.get("xl/_rels/workbook.xml.rels") || Buffer.from("")).toString("utf8");
  const rutas = new Map();
  for (const rel of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const destino = rel[2].replace(/^\//, "");
    rutas.set(rel[1], destino.startsWith("xl/") ? destino : `xl/${destino}`);
  }
  const strings = textosCompartidos((zip.get("xl/sharedStrings.xml") || Buffer.from("")).toString("utf8"));
  const hojas = [];
  for (const hoja of xmlLibro.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const xml = (zip.get(rutas.get(hoja[2])) || Buffer.from("")).toString("utf8");
    hojas.push({ nombre: decodificar(hoja[1]), filas: filasDe(xml, strings) });
  }
  return hojas;
}

module.exports = { parsearPlanilla, abrirLibro, letraColumna, limpiar };
