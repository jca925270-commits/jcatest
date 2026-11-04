const pool = require("../config/db");

let tablaLista = null;

function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = pool.query(
      `CREATE TABLE IF NOT EXISTS registro_usuarios (
         id INT AUTO_INCREMENT PRIMARY KEY,
         fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         usuario_id INT NULL,
         usuario_nombre VARCHAR(120) NOT NULL,
         rol VARCHAR(40) NULL,
         tipo ENUM('ingreso','salida','cambio') NOT NULL,
         detalle VARCHAR(500) NOT NULL,
         INDEX idx_registro_fecha (fecha)
       ) ENGINE=InnoDB`
    ).catch((error) => {
      tablaLista = null;
      throw error;
    });
  }
  return tablaLista;
}

function texto(valor, maximo = 80) {
  if (valor == null || typeof valor === "object") return "";
  const limpio = String(valor).replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  return limpio.slice(0, maximo);
}

function anotar({ usuario, tipo, detalle }) {
  const nombre = texto(usuario && usuario.nombre, 120);
  if (!nombre || !detalle) return Promise.resolve();
  return asegurarTabla().then(() => pool.query(
    `INSERT INTO registro_usuarios (usuario_id, usuario_nombre, rol, tipo, detalle)
     VALUES (?,?,?,?,?)`,
    [
      usuario.id || null,
      nombre,
      texto(usuario.rol, 40) || null,
      tipo,
      texto(detalle, 500),
    ]
  )).catch((error) => {
    console.error("No se pudo guardar el registro de usuario:", error.code || error.message);
  });
}

const ETIQUETAS = {
  "POST /api/movimientos": "Registró un movimiento",
  "POST /api/clientes": "Creó un cliente",
  "PUT /api/clientes": "Editó un cliente",
  "POST /api/usuarios": "Creó un usuario",
  "PUT /api/usuarios": "Editó un usuario",
  "DELETE /api/usuarios": "Eliminó un usuario",
  "POST /api/dispositivos": "Cargó un dispositivo",
  "PUT /api/dispositivos": "Editó un dispositivo",
  "DELETE /api/dispositivos": "Eliminó un dispositivo",
  "POST /api/accesorios": "Registró un accesorio",
  "POST /api/accesorios/limites": "Corrigió un mínimo o máximo de accesorio",
  "POST /api/soporte-planilla/ingreso": "Cargó un ingreso de soporte",
  "POST /api/soporte-planilla/egreso": "Cargó un egreso de soporte",
  "PUT /api/soporte-planilla": "Editó un registro de soporte",
  "PATCH /api/soporte-planilla/instancia": "Actualizó una instancia de soporte",
  "POST /api/trazabilidad/registrar-pantalla": "Registró una pantalla",
  "POST /api/trazabilidad/pantalla-con-falla": "Marcó una pantalla con falla",
  "DELETE /api/trazabilidad/pantalla-con-falla/:id": "Quitó una pantalla con falla",
  "PUT /api/trazabilidad/:hoja/:id": "Editó una fila de trazabilidad",
  "DELETE /api/trazabilidad/:hoja/:id": "Eliminó una fila de trazabilidad",
  "PUT /api/estado/:id": "Editó un estado",
  "DELETE /api/estado/:id": "Eliminó un estado",
  "POST /api/planilla-stock": "Modificó el stock de la planilla",
  "POST /api/stock": "Actualizó el stock",
  "POST /api/reportes": "Guardó un dato de reportes",
  "DELETE /api/reportes": "Eliminó un dato de reportes",
  "POST /api/testeo": "Cargó un testeo",
  "PUT /api/testeo": "Editó un testeo",
  "DELETE /api/testeo": "Eliminó un testeo",
};

function camino(req) {
  return String(req.originalUrl || req.path || "").split("?")[0];
}

function rutaClave(req) {
  const partes = camino(req).split("/");
  const acciones = new Set(["registrar-pantalla", "pantalla-con-falla"]);
  const normal = partes.map((parte, indice) => {
    if (/^\d+$/.test(parte)) return ":id";
    if (partes[2] === "trazabilidad" && indice === 3 && !acciones.has(parte)) return ":hoja";
    return parte;
  });
  return `${req.method} ${normal.join("/")}`;
}

function contexto(req) {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const query = req.query || {};
  const campos = [
    ["tipo", body.tipo_movimiento || body.tipo || query.tipo],
    ["estado", body.estado || query.estado],
    ["usuario", camino(req) === "/api/usuarios" ? body.nombre : ""],
    ["cliente", body.razon_social],
    ["dispositivo", body.dispositivo_id],
    ["equipo", body.dispositivo || body.accesorio || body.categoria],
    ["WiFi", body.mac_wifi],
    ["Ethernet", body.mac_eth],
    ["cantidad", body.cantidad],
    ["factura", body.factura],
    ["remito", body.remito],
    ["motivo", body.motivo],
    ["hoja", req.params && req.params.hoja],
  ];
  const extra = [];
  if (camino(req) === "/api/usuarios" && body.password) extra.push("con cambio de contraseña");
  return campos
    .map(([etiqueta, valor]) => {
      const limpio = texto(valor);
      return limpio ? `${etiqueta} ${limpio}` : "";
    })
    .concat(extra)
    .filter(Boolean)
    .join(" · ");
}

function describirCambio(req) {
  const clave = rutaClave(req);
  const base = ETIQUETAS[clave] || `${req.method} ${camino(req)}`;
  const datos = contexto(req);
  return datos ? `${base} · ${datos}` : base;
}

function observarCambios(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
    const ruta = camino(req);
    if (!ruta.startsWith("/api/")) return;
    if (ruta.startsWith("/api/auth")) return;
    const usuario = req.session && req.session.usuario;
    if (!usuario) return;
    anotar({ usuario, tipo: "cambio", detalle: describirCambio(req) });
  });
  next();
}

module.exports = { asegurarTabla, anotar, observarCambios };
