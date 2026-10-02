/* Helper común de acceso a la API del sistema.
   Todas las páginas lo cargan antes que su propio script.
   Nota: las páginas siguen llamando a "auth.php", "dispositivo.php", etc.
   por compatibilidad con el código ya escrito — acá se les saca el ".php"
   antes de armar la URL real, que apunta al backend Node.js. */

const API_BASE = "api";

async function apiFetch(endpoint, { method = "GET", body = null, params = null } = {}) {
  let rutaLimpia = endpoint.replace(/\.php$/i, "");
  if (rutaLimpia === "dispositivo") rutaLimpia = "dispositivos";
  let url = `${API_BASE}/${rutaLimpia}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }
  const opciones = {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  };
  const resp = await fetch(url, opciones);
  let data = null;
  try { data = await resp.json(); } catch (_) { /* respuesta vacía */ }

  if (!resp.ok) {
    if (resp.status === 401) {
      window.location.href = "login.html";
      return null;
    }
    const msg = (data && data.error) || `Error ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

function mostrarError(contenedorId, mensaje) {
  const el = document.getElementById(contenedorId);
  if (!el) { alert(mensaje); return; }
  el.textContent = mensaje;
  el.classList.remove("d-none");
  setTimeout(() => el.classList.add("d-none"), 5000);
}

function mostrarExito(contenedorId, mensaje) {
  const el = document.getElementById(contenedorId);
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove("d-none", "alert-danger");
  el.classList.add("alert-success");
  setTimeout(() => el.classList.add("d-none"), 3000);
}

function formatearFecha(valor) {
  if (!valor) return "—";
  const d = new Date(valor.replace(" ", "T"));
  if (isNaN(d)) return valor;
  return d.toLocaleDateString("es-AR") + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

const FOTOS_EQUIPO = {
  EBD: "assets/img/equipo-banner.png",
  CUBE: "assets/img/equipo-banner.png",
  D3: "assets/img/digital-desk.png",
  "D3+": "assets/img/digital-desk.png",
};

function fotoEquipo(tipo) {
  return FOTOS_EQUIPO[String(tipo || "").trim().toUpperCase()] || "";
}

function htmlFotoEquipo(tipo) {
  const nombre = tipo || "—";
  const src = fotoEquipo(tipo);
  if (!src) return nombre;
  return `<span class="equipo-con-foto"><img src="${src}" alt="${nombre}" class="equipo-foto"><span>${nombre}</span></span>`;
}

function badgeEstado(estado) {
  const nombres = {
    en_stock: "En stock", vendido: "Vendido", comodato: "Comodato", garantia: "Garantía",
    a_reparar: "A reparar", reparado: "Reparado", devuelto: "Devuelto",
    prueba: "Prueba", de_baja: "De baja",
  };
  return `<span class="badge badge-estado badge-${estado}">${nombres[estado] || estado}</span>`;
}
