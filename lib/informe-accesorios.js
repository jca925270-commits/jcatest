const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pool = require("../config/db");
const { fechaArgentina } = require("./conteo");

const LUGARES = [
  { clave: "oficina", nombre: "Oficina" },
  { clave: "showroom", nombre: "Showroom" },
  { clave: "casa_santi", nombre: "Casa Santi" },
  { clave: "campina", nombre: "Campiña del Sur" },
];

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

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-AR");
}

function esFuente5v3a(texto) {
  return texto.includes("3 AMP") || texto.includes("3A") || texto.includes("5V 3") || texto.includes("5 V 3");
}

function esFuente24v5a(texto) {
  const tiene24 = texto.includes("24V") || texto.includes("24 VOLT");
  const tiene5 = texto.includes("5.0") || texto.includes("5,0") || texto.includes("5 AMP");
  return tiene24 && tiene5;
}

function archivoAccesorio(nombre) {
  const texto = normalizar(nombre);
  if (texto.includes("OPCION 2")) return "air-mouse-opcion-2.png";
  if (texto.includes("AIR MOUSE") || texto.includes("AIRMOUSE")) return "air-mouse.png";
  if (texto.includes("CONTROL REMOTO")) return "control-remoto.png";
  if (texto.includes("HDMI")) return "cable-hdmi.png";
  if (texto.includes("ANTENA")) return "antena-wifi.png";
  if (texto.includes("FUENTE")) {
    if (esFuente24v5a(texto)) return "fuente-24v-5a.png";
    if (texto.includes("BLACK")) return "fuente-blackbox.png";
    if (esFuente5v3a(texto)) return "fuente-ebd-5v-3a.png";
    if (texto.includes("12V") || texto.includes("D3")) return "fuente-d3.png";
    if (texto.includes("CHINA") || texto.includes("EBD")) return "fuente-ebd.png";
  }
  return "";
}

async function listarAccesorios() {
  const nombres = LUGARES.map((lugar) => lugar.nombre);
  const [filas] = await pool.query(
    `SELECT a.accesorio,
            COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Oficina' THEN a.cantidad END), 0) AS oficina,
            COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Showroom' THEN a.cantidad END), 0) AS showroom,
            COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Casa Santi' THEN a.cantidad END), 0) AS casa_santi,
            COALESCE(SUM(CASE WHEN a.destino = 'venta' AND d.nombre = 'Campiña del Sur' THEN a.cantidad END), 0) AS campina,
            COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Oficina' THEN a.cantidad END), 0) AS uso_oficina,
            COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Showroom' THEN a.cantidad END), 0) AS uso_showroom,
            COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Casa Santi' THEN a.cantidad END), 0) AS uso_casa_santi,
            COALESCE(SUM(CASE WHEN a.destino = 'uso_interno' AND d.nombre = 'Campiña del Sur' THEN a.cantidad END), 0) AS uso_campina
     FROM accesorios a
     JOIN depositos d ON d.id_deposito = a.deposito_id
     WHERE d.nombre IN (?)
     GROUP BY a.accesorio
     ORDER BY a.accesorio`,
    [nombres]
  );
  return filas.map((fila) => ({
    nombre: fila.accesorio,
    archivo: archivoAccesorio(fila.accesorio),
    venta: LUGARES.map((lugar) => ({ nombre: lugar.nombre, cantidad: Number(fila[lugar.clave]) || 0 })),
    uso: LUGARES.map((lugar) => ({ nombre: lugar.nombre, cantidad: Number(fila[`uso_${lugar.clave}`]) || 0 })),
    total: LUGARES.reduce((suma, lugar) => suma + (Number(fila[lugar.clave]) || 0) + (Number(fila[`uso_${lugar.clave}`]) || 0), 0),
  }));
}

function Informe(pdf, fuente, negrita, logo, imagenes) {
  this.pdf = pdf;
  this.fuente = fuente;
  this.negrita = negrita;
  this.logo = logo;
  this.imagenes = imagenes;
  this.page = null;
  this.y = 0;
}

Informe.prototype.nueva = function nueva(detalle) {
  this.page = this.pdf.addPage([ANCHO, ALTO]);
  this.page.drawRectangle({ x: 0, y: ALTO - CABECERA, width: ANCHO, height: CABECERA, color: TINTA });
  this.page.drawRectangle({ x: 0, y: ALTO - CABECERA - 3, width: ANCHO, height: 3, color: DURAZNO });
  const logoAlto = 34;
  const logoAncho = logoAlto * (this.logo.width / this.logo.height);
  this.page.drawImage(this.logo, {
    x: MARGEN,
    y: ALTO - CABECERA + (CABECERA - logoAlto) / 2,
    width: logoAncho,
    height: logoAlto,
  });
  const titulo = "INFORME DE ACCESORIOS";
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

Informe.prototype.cabe = function cabe(alto) {
  if (this.y - alto >= 42) return;
  if (this.y > ALTO - CABECERA - 50) return;
  this.nueva(this.detalle);
};

Informe.prototype.accesorio = function accesorio(item) {
  const banda = 78;
  const ancho = ANCHO - MARGEN * 2;
  const altoGrupos = 16 + 16 + item.venta.length * 15 + 12 + 16 + item.uso.length * 15 + 12;
  const altoCaja = banda + altoGrupos;
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

  const foto = item.archivo ? this.imagenes.get(item.archivo) : null;
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
  this.page.drawText(seguro(item.nombre), {
    x: textoX,
    y: tope - 34,
    size: 14,
    font: this.negrita,
    color: TINTA,
  });
  const total = numero(item.total);
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
  const grupo = (titulo, filas, primero) => {
    if (!primero) cursor -= 12;
    this.page.drawText(titulo, { x: MARGEN + 18, y: cursor, size: 9, font: this.negrita, color: SUAVE });
    cursor -= 16;
    for (const fila of filas) {
      const cant = numero(fila.cantidad);
      const anchoCant = this.negrita.widthOfTextAtSize(cant, 9);
      this.page.drawText(seguro(fila.nombre), {
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
  };
  grupo("Venta", item.venta, true);
  grupo("Uso interno", item.uso, false);
  this.y = base - 16;
};

Informe.prototype.cerrar = function cerrar() {
  const paginas = this.pdf.getPages();
  paginas.forEach((page, indice) => {
    page.drawText("Banner Director", { x: MARGEN, y: 18, size: 8, font: this.fuente, color: SUAVE });
    const texto = `${indice + 1} / ${paginas.length}`;
    const ancho = this.fuente.widthOfTextAtSize(texto, 8);
    page.drawText(texto, { x: ANCHO - MARGEN - ancho, y: 18, size: 8, font: this.fuente, color: SUAVE });
  });
};

async function cargarImagenes(pdf, items) {
  const logo = await pdf.embedPng(fs.readFileSync(path.join(__dirname, "informe-img", "logo.png")));
  const imagenes = new Map();
  const chicas = path.join(__dirname, "informe-img", "accesorios");
  const grandes = path.join(__dirname, "..", "public", "assets", "img");
  for (const item of items) {
    if (!item.archivo || imagenes.has(item.archivo)) continue;
    const archivo = fs.existsSync(path.join(chicas, item.archivo))
      ? path.join(chicas, item.archivo)
      : path.join(grandes, item.archivo);
    if (!fs.existsSync(archivo)) continue;
    imagenes.set(item.archivo, await pdf.embedPng(fs.readFileSync(archivo)));
  }
  return { logo, imagenes };
}

async function generarInformeAccesorios(ahora = new Date()) {
  const fecha = fechaArgentina(ahora);
  const dia = String(fecha.dia).padStart(2, "0");
  const mes = String(fecha.mes).padStart(2, "0");
  const detalle = `Stock al ${dia}/${mes}/${fecha.anio}`;
  const items = await listarAccesorios();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe de accesorios ${fecha.mesNombre} ${fecha.anio}`);
  pdf.setAuthor("Banner Director");
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { logo, imagenes } = await cargarImagenes(pdf, items);
  const informe = new Informe(pdf, fuente, negrita, logo, imagenes);
  informe.detalle = detalle;
  informe.nueva(detalle);
  if (!items.length) {
    informe.page.drawText("Sin accesorios", { x: MARGEN, y: informe.y - 12, size: 12, font: fuente, color: TINTA });
  } else {
    for (const item of items) informe.accesorio(item);
  }
  informe.cerrar();
  return {
    nombre: `Informe-accesorios-${fecha.mesNombre}-${fecha.anio}.pdf`,
    pdf: Buffer.from(await pdf.save()),
  };
}

module.exports = { generarInformeAccesorios };
