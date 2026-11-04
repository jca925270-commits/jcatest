const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pool = require("../config/db");
const { fechaArgentina } = require("./conteo");

const FAMILIAS = [
  { id: "ebd", titulo: "EBD nuevos para venta", archivo: "ebd.png" },
  { id: "d3", titulo: "D3 nuevos para venta", archivo: "d3.png" },
  { id: "d3plus", titulo: "D3+", archivo: "d3.png" },
  { id: "ebd-16", titulo: "EBD 16 GB", archivo: "ebd.png" },
  { id: "pendientes", titulo: "Pendientes a reparar", archivo: "" },
  { id: "ebd-reparado", titulo: "EBD reparados", archivo: "ebd-reparado.png" },
  { id: "ebd-otros", titulo: "Otras existencias de EBD", archivo: "ebd.png" },
  { id: "d3-otros", titulo: "Otras existencias de D3", archivo: "d3.png" },
  { id: "pantalla", titulo: "Pantallas colectivos (24 Pulgadas)", archivo: "pantalla.png" },
  { id: "pantalla-naranja", titulo: "Pantallas", archivo: "" },
  { id: "dongle", titulo: "Dongles", archivo: "" },
  { id: "camara", titulo: "Cámaras", archivo: "" },
  { id: "blackbox", titulo: "Blackbox", archivo: "blackbox.png" },
  { id: "otros", titulo: "Otros", archivo: "" },
];

const ORDEN_LUGAR = ["Oficina", "Campiña del Sur", "Showroom", "Casa Santi", "Casas varias", "Contenedor", "Paraguay", "Otros"];

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 32;
const CABECERA = 76;
const TINTA = rgb(0.11, 0.094, 0.09);
const DURAZNO = rgb(1, 0.71, 0.627);
const PAPEL = rgb(0.976, 0.965, 0.957);
const LINEA = rgb(0.86, 0.824, 0.808);
const SUAVE = rgb(0.45, 0.4, 0.384);
const BLANCO = rgb(1, 1, 1);

function normalizar(valor) {
  return String(valor || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function seguro(valor) {
  return String(valor || "").replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF]/g, "");
}

function nombreVisible(texto) {
  return String(texto || "").replace(/pantallas?\s+colectivos?(?!\s*\(24)/gi, (encontrado) => `${encontrado} (24 Pulgadas)`);
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-AR");
}

function fechaCorta(fecha) {
  const dia = String(fecha.dia).padStart(2, "0");
  const mes = String(fecha.mes).padStart(2, "0");
  return `${dia}/${mes}/${fecha.anio}`;
}

function familiaDe(nombre) {
  const texto = normalizar(nombre);
  if (texto.includes("PANTALLA") && texto.includes("COLECTIV")) return FAMILIAS.find((item) => item.id === "pantalla");
  if (texto.includes("PANTALLA")) return FAMILIAS.find((item) => item.id === "pantalla-naranja");
  if (texto.includes("DONGLE")) return FAMILIAS.find((item) => item.id === "dongle");
  if (texto.includes("CAMARA")) return FAMILIAS.find((item) => item.id === "camara");
  if (texto.includes("BLACKBOX") || texto.includes("BLACK BOX")) return FAMILIAS.find((item) => item.id === "blackbox");
  if ((texto.includes("REPARAD") || texto.includes("FALLAD") || texto.includes("PARTIDA")) && !texto.includes("D3")) {
    return FAMILIAS.find((item) => item.id === "ebd-reparado");
  }
  if (texto.includes("D3")) return FAMILIAS.find((item) => item.id === "d3");
  if (texto.includes("CUBE") || texto.includes("EBD") || texto.includes("BANNER")) return FAMILIAS.find((item) => item.id === "ebd");
  return FAMILIAS.find((item) => item.id === "otros");
}

function esEbd(texto) {
  return texto.includes("EBD") || texto.includes("CUBE") || texto.includes("BANNER");
}

function esCasaSanti(texto) {
  return texto.includes("CASA") && !texto.includes("VARIAS");
}

function esEbd16Venta(texto) {
  return esEbd(texto) && texto.includes("16") && texto.includes("VENTA") && !esCasaSanti(texto) && !texto.includes("INTERNO");
}

function esD3(texto) {
  return texto.includes("D3") && !texto.includes("D3+");
}

function esPendienteReparar(texto) {
  return texto.includes("PENDIENT") && texto.includes("REPAR");
}

function esNuevoParaVenta(fila, coincide) {
  const texto = normalizar(fila.nombre);
  if (!coincide(texto) || texto.includes("16") || texto.includes("INTERNO") || esCasaSanti(texto)) return false;
  if (texto.includes("REPAR") || texto.includes("PRUEB") || texto.includes("SHOW") || texto.includes("EXHIB")) return false;
  const lugar = lugarDe(fila.nombre, fila.pais);
  if (lugar === "Campiña del Sur") return true;
  return lugar === "Oficina" && texto.includes("VENTA");
}

function esEbdParaVenta(fila) {
  return esNuevoParaVenta(fila, esEbd);
}

function esD3ParaVenta(fila) {
  return esNuevoParaVenta(fila, esD3);
}

function esD3PlusParaVenta(fila) {
  return esNuevoParaVenta(fila, (texto) => texto.includes("D3+"));
}

function visibleEnInforme(fila, hay16Venta) {
  const texto = normalizar(fila.nombre);
  if (!esEbd(texto)) return true;
  if (texto.includes("INTERNO")) return false;
  if (esCasaSanti(texto)) return false;
  if (texto.includes("16") && !texto.includes("VENTA") && hay16Venta) return false;
  return true;
}

function lugarDe(nombre, pais) {
  if (String(pais || "").toUpperCase() === "PARAGUAY") return "Paraguay";
  const texto = normalizar(nombre);
  if (texto.includes("CAMPI")) return "Campiña del Sur";
  if (texto.includes("SHOW")) return "Showroom";
  if (texto.includes("VARIAS")) return "Casas varias";
  if (texto.includes("CASA")) return "Casa Santi";
  if (texto.includes("CONTENEDOR")) return "Contenedor";
  if (texto.includes("OFICINA") || texto.includes("DONGLE")) return "Oficina";
  return "Otros";
}

function agrupar(filas) {
  const hay16Venta = filas.some((fila) => esEbd16Venta(normalizar(fila.nombre)));
  const mapa = new Map();
  for (const fila of filas) {
    if (!visibleEnInforme(fila, hay16Venta)) continue;
    const texto = normalizar(fila.nombre);
    let familia = familiaDe(fila.nombre);
    if (esPendienteReparar(texto)) familia = FAMILIAS.find((item) => item.id === "pendientes");
    else if (esEbd16Venta(texto)) familia = FAMILIAS.find((item) => item.id === "ebd-16");
    else if (esEbdParaVenta(fila)) familia = FAMILIAS.find((item) => item.id === "ebd");
    else if (esD3ParaVenta(fila)) familia = FAMILIAS.find((item) => item.id === "d3");
    else if (esD3PlusParaVenta(fila)) familia = FAMILIAS.find((item) => item.id === "d3plus");
    else if (familia && familia.id === "ebd") familia = FAMILIAS.find((item) => item.id === "ebd-otros");
    else if (familia && familia.id === "d3") familia = FAMILIAS.find((item) => item.id === "d3-otros");
    if (!familia) continue;
    if (!mapa.has(familia.id)) mapa.set(familia.id, { ...familia, porLugar: new Map(), total: 0 });
    const grupo = mapa.get(familia.id);
    const lugar = lugarDe(fila.nombre, fila.pais);
    if (!grupo.porLugar.has(lugar)) grupo.porLugar.set(lugar, []);
    grupo.porLugar.get(lugar).push(fila);
    grupo.total += fila.cantidad;
  }
  return FAMILIAS.filter((item) => mapa.has(item.id)).map((item) => {
    const grupo = mapa.get(item.id);
    const lugares = [...grupo.porLugar.entries()]
      .map(([nombre, items]) => ({ nombre, filas: items }))
      .sort((a, b) => ORDEN_LUGAR.indexOf(a.nombre) - ORDEN_LUGAR.indexOf(b.nombre));
    return { id: grupo.id, titulo: grupo.titulo, archivo: grupo.archivo, lugares, total: grupo.total };
  });
}

async function stockGeneral() {
  const [filas] = await pool.query(
    `SELECT nombre, pais, cantidad_actual
     FROM categorias_stock
     ORDER BY pais, nombre`
  );
  return filas.map((fila) => ({
    nombre: fila.nombre,
    pais: fila.pais || "ARGENTINA",
    cantidad: Number(fila.cantidad_actual) || 0,
  }));
}

function ajustar(texto, fuente, tamano, maximo) {
  const limpio = seguro(texto);
  if (fuente.widthOfTextAtSize(limpio, tamano) <= maximo) return limpio;
  let corte = limpio;
  while (corte.length > 1 && fuente.widthOfTextAtSize(`${corte}...`, tamano) > maximo) corte = corte.slice(0, -1);
  return `${corte}...`;
}

function Informe(pdf, fuente, negrita, logo, imagenes) {
  this.pdf = pdf;
  this.fuente = fuente;
  this.negrita = negrita;
  this.logo = logo;
  this.imagenes = imagenes;
  this.page = null;
  this.y = 0;
  this.cabecera = { titulo: "", detalle: "" };
}

Informe.prototype.nueva = function nueva() {
  this.page = this.pdf.addPage([ANCHO, ALTO]);
  this.page.drawRectangle({ x: 0, y: ALTO - CABECERA, width: ANCHO, height: CABECERA, color: TINTA });
  this.page.drawRectangle({ x: 0, y: ALTO - CABECERA - 3, width: ANCHO, height: 3, color: DURAZNO });
  const logoAlto = 26;
  const subSize = 6.5;
  const logoAncho = logoAlto * (this.logo.width / this.logo.height);
  const bloque = logoAlto + 4 + subSize;
  const ySub = ALTO - CABECERA + (CABECERA - bloque) / 2;
  this.page.drawImage(this.logo, {
    x: MARGEN,
    y: ySub + subSize + 4,
    width: logoAncho,
    height: logoAlto,
  });
  this.page.drawText("SOPORTE Y LOGISTICA", {
    x: MARGEN,
    y: ySub,
    size: subSize,
    font: this.negrita,
    color: DURAZNO,
  });
  const titulo = seguro(this.cabecera.titulo);
  const detalle = seguro(this.cabecera.detalle);
  const anchoTitulo = this.negrita.widthOfTextAtSize(titulo, 11);
  this.page.drawText(titulo, {
    x: ANCHO - MARGEN - anchoTitulo,
    y: ALTO - 32,
    size: 11,
    font: this.negrita,
    color: BLANCO,
  });
  const anchoDetalle = this.fuente.widthOfTextAtSize(detalle, 9);
  this.page.drawText(detalle, {
    x: ANCHO - MARGEN - anchoDetalle,
    y: ALTO - 48,
    size: 9,
    font: this.fuente,
    color: DURAZNO,
  });
  this.y = ALTO - CABECERA - 26;
};

Informe.prototype.empezar = function empezar(cabecera) {
  this.cabecera = cabecera;
  this.nueva();
};

Informe.prototype.cabe = function cabe(alto) {
  if (this.y - alto >= 42) return;
  if (this.y > ALTO - CABECERA - 50) return;
  this.nueva();
};

Informe.prototype.seccion = function seccion(titulo) {
  this.cabe(96);
  this.page.drawText(seguro(titulo), {
    x: MARGEN,
    y: this.y - 12,
    size: 13,
    font: this.negrita,
    color: TINTA,
  });
  this.page.drawRectangle({ x: MARGEN, y: this.y - 18, width: 42, height: 2.5, color: DURAZNO });
  this.y -= 32;
};

Informe.prototype.dispositivo = function dispositivo(grupo) {
  const banda = 78;
  const ancho = ANCHO - MARGEN * 2;
  let altoGrupos = 12;
  grupo.lugares.forEach((lugar, indice) => {
    if (indice) altoGrupos += 12;
    altoGrupos += 16 + lugar.filas.length * 15;
  });
  const altoCaja = banda + altoGrupos + 8;
  this.cabe(altoCaja);
  const tope = this.y;
  const base = tope - altoCaja;
  this.page.drawRectangle({
    x: MARGEN,
    y: base,
    width: ancho,
    height: altoCaja,
    color: PAPEL,
    borderColor: LINEA,
    borderWidth: 0.8,
  });
  this.page.drawRectangle({ x: MARGEN, y: base, width: 4, height: altoCaja, color: TINTA });

  const foto = grupo.archivo ? this.imagenes.get(grupo.archivo) : null;
  if (foto) {
    const caja = 58;
    const escala = Math.min(caja / foto.width, caja / foto.height);
    const w = foto.width * escala;
    const h = foto.height * escala;
    this.page.drawImage(foto, {
      x: MARGEN + 16 + (caja - w) / 2,
      y: tope - 10 - (caja + h) / 2,
      width: w,
      height: h,
    });
  }

  const textoX = MARGEN + (foto ? 92 : 20);
  this.page.drawText(seguro(grupo.titulo), {
    x: textoX,
    y: tope - 34,
    size: 14,
    font: this.negrita,
    color: TINTA,
  });
  const total = numero(grupo.total);
  const anchoTotal = this.negrita.widthOfTextAtSize(total, 14);
  this.page.drawText(total, {
    x: MARGEN + ancho - 16 - anchoTotal,
    y: tope - 34,
    size: 14,
    font: this.negrita,
    color: TINTA,
  });
  this.page.drawLine({
    start: { x: MARGEN + 14, y: tope - banda },
    end: { x: MARGEN + ancho - 14, y: tope - banda },
    thickness: 0.6,
    color: LINEA,
  });

  let cursor = tope - banda - 16;
  const limite = MARGEN + ancho - 16;
  grupo.lugares.forEach((lugar, indice) => {
    if (indice) cursor -= 12;
    this.page.drawText(seguro(lugar.nombre), {
      x: MARGEN + 18,
      y: cursor,
      size: 9,
      font: this.negrita,
      color: SUAVE,
    });
    cursor -= 16;
    for (const fila of lugar.filas) {
      const cant = numero(fila.cantidad);
      const anchoCant = this.negrita.widthOfTextAtSize(cant, 9);
      this.page.drawText(ajustar(nombreVisible(fila.nombre), this.fuente, 9, limite - anchoCant - (MARGEN + 28) - 8), {
        x: MARGEN + 28,
        y: cursor,
        size: 9,
        font: this.fuente,
        color: TINTA,
      });
      this.page.drawText(cant, {
        x: limite - anchoCant,
        y: cursor,
        size: 9,
        font: this.negrita,
        color: TINTA,
      });
      cursor -= 15;
    }
  });
  this.y = base - 16;
};

Informe.prototype.cerrarNumeros = function cerrarNumeros() {
  const paginas = this.pdf.getPages();
  paginas.forEach((page, indice) => {
    const marca = "Banner Director";
    page.drawText(marca, { x: MARGEN, y: 18, size: 8, font: this.fuente, color: SUAVE });
    const texto = `${indice + 1} / ${paginas.length}`;
    const ancho = this.fuente.widthOfTextAtSize(texto, 8);
    page.drawText(texto, { x: ANCHO - MARGEN - ancho, y: 18, size: 8, font: this.fuente, color: SUAVE });
  });
};

async function cargarImagenes(pdf) {
  const carpeta = path.join(__dirname, "informe-img");
  const logo = await pdf.embedPng(fs.readFileSync(path.join(carpeta, "logo.png")));
  const imagenes = new Map();
  for (const familia of FAMILIAS) {
    if (!familia.archivo || imagenes.has(familia.archivo)) continue;
    const archivo = path.join(carpeta, familia.archivo);
    if (!fs.existsSync(archivo)) continue;
    imagenes.set(familia.archivo, await pdf.embedPng(fs.readFileSync(archivo)));
  }
  return { logo, imagenes };
}

function dibujarStock(informe, titulo, detalle, filas) {
  informe.empezar({ titulo: "INFORME DE STOCK", detalle });
  informe.seccion(titulo);
  for (const grupo of agrupar(filas)) informe.dispositivo(grupo);
}

async function generarInformeCierre(ahora = new Date()) {
  const fecha = fechaArgentina(ahora);
  const filas = await stockGeneral();
  const cierre = fechaCorta({ ...fecha, dia: fecha.ultimo });
  const detalleMes = `${fecha.mesNombre} ${fecha.anio}  -  Cierre al ${cierre}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe de stock ${fecha.mesNombre} ${fecha.anio}`);
  pdf.setAuthor("Banner Director");
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { logo, imagenes } = await cargarImagenes(pdf);
  const informe = new Informe(pdf, fuente, negrita, logo, imagenes);

  dibujarStock(informe, `Stock general de ${fecha.mesNombre} ${fecha.anio}`, detalleMes, filas);

  let nombre = `Informe-stock-${fecha.mesNombre}-${fecha.anio}.pdf`;
  if (fecha.mes === 12 && fecha.esUltimo) {
    const detalleAnio = `${fecha.anio}  -  Cierre al ${cierre}`;
    dibujarStock(informe, `Stock general anual ${fecha.anio}`, detalleAnio, filas);
    nombre = `Informe-stock-${fecha.anio}-mensual-y-anual.pdf`;
  }

  informe.cerrarNumeros();
  return { nombre, pdf: Buffer.from(await pdf.save()) };
}

module.exports = { generarInformeCierre };
