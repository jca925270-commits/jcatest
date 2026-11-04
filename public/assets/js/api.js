/* Helper común de acceso a la API del sistema.
   Todas las páginas lo cargan antes que su propio script.
   Nota: las páginas siguen llamando a "auth.php", "dispositivo.php", etc.
   por compatibilidad con el código ya escrito — acá se les saca el ".php"
   antes de armar la URL real, que apunta al backend Node.js. */

const API_BASE = "api";

let cargasEnCurso = 0;
let ocultarCarga;

function asegurarCapaCarga() {
  let capa = document.getElementById("carga-banner");
  if (capa) return capa;
  capa = document.createElement("div");
  capa.id = "carga-banner";
  capa.innerHTML = '<div class="carga-circulo"><img src="assets/img/logo-carga.png" alt="Banner Director"></div>';
  document.body.appendChild(capa);
  return capa;
}

function marcarCarga(activa) {
  cargasEnCurso += activa ? 1 : -1;
  if (cargasEnCurso < 0) cargasEnCurso = 0;
  const capa = asegurarCapaCarga();
  if (cargasEnCurso > 0) {
    clearTimeout(ocultarCarga);
    capa.classList.add("visible");
    return;
  }
  ocultarCarga = setTimeout(() => {
    if (cargasEnCurso === 0) capa.classList.remove("visible");
  }, 150);
}

async function apiFetch(endpoint, { method = "GET", body = null, params = null, silencioso = false, redirigir401 = true } = {}) {
  if (!silencioso) marcarCarga(true);
  try {
    return await apiFetchInterno(endpoint, { method, body, params, redirigir401 });
  } finally {
    if (!silencioso) marcarCarga(false);
  }
}

async function apiFetchInterno(endpoint, { method = "GET", body = null, params = null, redirigir401 = true } = {}) {
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
    if (resp.status === 401 && redirigir401) {
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

const FOTOS = {
  airMouse: "assets/img/air-mouse.png",
  airMouse2: "assets/img/air-mouse-opcion-2.png",
  antena: "assets/img/antena-wifi.png",
  hdmi: "assets/img/cable-hdmi.png",
  control: "assets/img/control-remoto.png",
  fuenteD3: "assets/img/fuente-d3.png",
  fuenteEbd: "assets/img/fuente-ebd.png",
  fuenteBlackbox: "assets/img/fuente-blackbox.png",
  fuente5v3a: "assets/img/fuente-ebd-5v-3a.png",
  fuente24v5a: "assets/img/fuente-24v-5a.png?v=nueva",
  blackbox: "assets/img/blackbox.png",
  d3: "assets/img/d3.png",
  nuevo: "assets/img/ebd.png",
  reparado: "assets/img/ebd-reparado.png",
  pantalla: "assets/img/pantalla-colectivo.png",
};

function esFuente5v3a(texto) {
  return texto.includes("3 AMP") || texto.includes("3A") || texto.includes("5V 3") || texto.includes("5 V 3");
}

function esFuente24v5a(texto) {
  const tiene24 = texto.includes("24V") || texto.includes("24 VOLT");
  const tiene5 = texto.includes("5.0") || texto.includes("5,0") || texto.includes("5 AMP");
  return tiene24 && tiene5;
}

function fotoEquipo(tipo) {
  const texto = String(tipo || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!texto) return "";
  if (texto.includes("OPCION 2")) return FOTOS.airMouse2;
  if (texto.includes("AIR MOUSE") || texto.includes("AIRMOUSE")) return FOTOS.airMouse;
  if (texto.includes("CONTROL REMOTO")) return FOTOS.control;
  if (texto.includes("HDMI")) return FOTOS.hdmi;
  if (texto.includes("ANTENA")) return FOTOS.antena;
  if (texto.includes("FUENTE")) {
    if (esFuente24v5a(texto)) return FOTOS.fuente24v5a;
    if (texto.includes("BLACK")) return FOTOS.fuenteBlackbox;
    if (esFuente5v3a(texto)) return FOTOS.fuente5v3a;
    if (texto.includes("12V") || texto.includes("D3")) return FOTOS.fuenteD3;
    if (texto.includes("CHINA") || texto.includes("EBD")) return FOTOS.fuenteEbd;
    return "";
  }
  if (texto.includes("PANTALLA") && texto.includes("COLECTIV")) return FOTOS.pantalla;
  if (texto.includes("FALLAD") || texto.includes("PARTIDA")) return FOTOS.reparado;
  if (texto.includes("REPARAD") && !texto.includes("D3")) return FOTOS.reparado;
  if (texto.includes("BLACKBOX") || texto.includes("BLACK BOX")) return FOTOS.blackbox;
  if (texto.includes("D3")) return FOTOS.d3;
  if (texto.includes("CUBE") || texto.includes("EBD") || texto.includes("BANNER")) return FOTOS.nuevo;
  return "";
}

const POR_PAGINA = 20;

function paginar(lista, pagina) {
  const total = Math.max(1, Math.ceil(lista.length / POR_PAGINA) || 1);
  const actual = Math.min(Math.max(1, pagina || 1), total);
  const inicio = (actual - 1) * POR_PAGINA;
  return { pagina: actual, total, filas: lista.slice(inicio, inicio + POR_PAGINA) };
}

function htmlPaginacion(pagina, total) {
  if (total <= 1) return "";
  const desde = Math.max(1, pagina - 2);
  const hasta = Math.min(total, pagina + 2);
  const numeros = [];
  for (let i = desde; i <= hasta; i++) {
    numeros.push(`<button type="button" class="btn btn-sm ${i === pagina ? "btn-teal" : "btn-outline-secondary"}" data-pagina="${i}">${i}</button>`);
  }
  return `<div class="d-flex align-items-center justify-content-end gap-2 mt-3 flex-wrap">
    <button type="button" class="btn btn-sm btn-outline-secondary" data-pagina="${pagina - 1}" ${pagina <= 1 ? "disabled" : ""}>Anterior</button>
    ${numeros.join("")}
    <button type="button" class="btn btn-sm btn-outline-secondary" data-pagina="${pagina + 1}" ${pagina >= total ? "disabled" : ""}>Siguiente</button>
  </div>`;
}

const UMBRAL_ACCESORIO = 7;

function htmlAvisoReposicion(filas, conEnlace) {
  const bajos = [];
  const altos = [];
  for (const fila of filas || []) {
    const total = Number(fila.total);
    const minimo = fila.minimo == null || fila.minimo === "" ? UMBRAL_ACCESORIO : Number(fila.minimo);
    const maximo = Number(fila.maximo) || 0;
    if (minimo > 0 && total <= minimo) bajos.push({ ...fila, minimo });
    if (maximo > 0 && total >= maximo) altos.push({ ...fila, maximo });
  }
  if (!bajos.length && !altos.length) return "";
  const enlace = conEnlace ? ` <a href="accesorios.html">Ver accesorios</a>` : "";
  const partes = [];
  if (bajos.length) {
    const lista = bajos.map((fila) => `${textoPlano(fila.accesorio)} (quedan ${Number(fila.total)}, mínimo ${fila.minimo})`).join(" · ");
    partes.push(`<div class="aviso-reposicion-titulo">Reponer en el proveedor</div>
      Llegaron al mínimo. Hay que adquirir más.${enlace}
      <div class="aviso-reposicion-lista">${lista}</div>`);
  }
  if (altos.length) {
    const lista = altos.map((fila) => `${textoPlano(fila.accesorio)} (hay ${Number(fila.total)}, máximo ${fila.maximo})`).join(" · ");
    partes.push(`<div class="aviso-reposicion-titulo">Por encima del máximo</div>
      <div class="aviso-reposicion-lista">${lista}</div>`);
  }
  return `<div class="aviso-reposicion">${partes.join("")}</div>`;
}

function macsEnTexto(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const macs = [];
  for (let i = 0; i + 12 <= limpio.length && macs.length < 2; i += 12) {
    macs.push(limpio.slice(i, i + 12));
  }
  return macs;
}

function textoIncluyeMac(valores, consulta) {
  const buscadas = macsEnTexto(consulta);
  if (!buscadas.length) return false;
  const propias = valores.flatMap((valor) => macsEnTexto(valor));
  return buscadas.some((mac) => propias.includes(mac));
}

function textoPlano(valor) {
  if (valor == null || valor === "") return "—";
  return String(valor).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function nombreVisible(texto) {
  return String(texto || "").replace(/pantallas?\s+colectivos?(?!\s*\(24)/gi, (encontrado) => `${encontrado} (24 Pulgadas)`);
}

function htmlFotoEquipo(tipo) {
  const nombre = tipo || "—";
  const src = fotoEquipo(tipo);
  const seguro = textoPlano(nombreVisible(nombre));
  if (!src) return seguro;
  return `<span class="equipo-con-foto foto-zoom" tabindex="0"><img src="${src}" alt="" class="equipo-foto"><span>${seguro}</span></span>`;
}

function esEstadoVenta(estado) {
  const texto = String(estado || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return texto === "VENTA" || texto.startsWith("VENTA ");
}

function htmlTipoFuente(tipo) {
  const texto = String(tipo || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let src = "";
  if (esFuente24v5a(texto)) src = FOTOS.fuente24v5a;
  else if (texto.includes("BLACK")) src = FOTOS.fuenteBlackbox;
  else if (esFuente5v3a(texto)) src = FOTOS.fuente5v3a;
  else if (texto.includes("EBD")) src = FOTOS.fuenteEbd;
  else return htmlFotoEquipo(tipo);
  return `<span class="equipo-con-foto foto-zoom" tabindex="0"><img src="${src}" alt="" class="equipo-foto"><span>${textoPlano(nombreVisible(tipo))}</span></span>`;
}

function badgeEstado(estado) {
  const nombres = {
    en_stock: "En stock", vendido: "Vendido", comodato: "Comodato", garantia: "Garantía",
    a_reparar: "A reparar", reparado: "Reparado", devuelto: "Devuelto",
    prueba: "Prueba", de_baja: "De baja",
  };
  return `<span class="badge badge-estado badge-${estado}">${nombres[estado] || estado}</span>`;
}

function asegurarZoomFotos() {
  if (document.getElementById("estilo-zoom-fotos")) return document.getElementById("foto-ampliada");
  const estilo = document.createElement("style");
  estilo.id = "estilo-zoom-fotos";
  estilo.textContent = `
    img.equipo-foto { cursor: zoom-in; }
    #foto-ampliada {
      position: fixed;
      z-index: 2000;
      width: min(520px, 92vw);
      height: min(640px, 86vh);
      padding: .7rem;
      border-radius: 16px;
      background: #fff;
      border: 1px solid #e5e7eb;
      box-shadow: 0 18px 48px rgba(15, 23, 42, .28);
      pointer-events: none;
    }
    #foto-ampliada img { width: 100%; height: 100%; object-fit: contain; }
  `;
  document.head.appendChild(estilo);
  let panel = document.getElementById("foto-ampliada");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "foto-ampliada";
    panel.hidden = true;
    panel.innerHTML = '<img alt="">';
    document.body.appendChild(panel);
  }
  return panel;
}

function mostrarZoomFoto(img) {
  if (!img || !img.getAttribute("src")) return;
  const panel = asegurarZoomFotos();
  const grande = panel.querySelector("img");
  const src = img.currentSrc || img.src;
  if (grande.getAttribute("src") !== src) grande.src = src;
  panel.hidden = false;
  const rect = img.getBoundingClientRect();
  const ancho = panel.offsetWidth || 520;
  const alto = panel.offsetHeight || 640;
  let left = rect.right + 14;
  if (left + ancho > window.innerWidth - 8) left = rect.left - ancho - 14;
  left = Math.max(8, Math.min(left, window.innerWidth - ancho - 8));
  let top = rect.top + rect.height / 2 - alto / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - alto - 8));
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function cajaDeFoto(nodo) {
  if (!nodo || !nodo.closest) return null;
  const directa = nodo.closest("img.equipo-foto");
  if (directa) return directa.closest(".equipo-con-foto, .foto-zoom, .accesorio-zoom") || directa;
  const caja = nodo.closest(".equipo-con-foto, .foto-zoom, .accesorio-zoom");
  if (caja && caja.querySelector("img.equipo-foto")) return caja;
  return null;
}

function iniciarZoomFotos() {
  if (window.__zoomFotosListo) return;
  window.__zoomFotosListo = true;
  const panel = asegurarZoomFotos();
  document.addEventListener("mouseover", (evento) => {
    const caja = cajaDeFoto(evento.target);
    if (!caja) return;
    mostrarZoomFoto(caja.matches("img") ? caja : caja.querySelector("img.equipo-foto"));
  });
  document.addEventListener("mouseout", (evento) => {
    const caja = cajaDeFoto(evento.target);
    if (!caja) return;
    const destino = evento.relatedTarget;
    if (destino && caja.contains(destino)) return;
    panel.hidden = true;
  });
  document.addEventListener("focusin", (evento) => {
    const caja = cajaDeFoto(evento.target);
    if (!caja) return;
    mostrarZoomFoto(caja.matches("img") ? caja : caja.querySelector("img.equipo-foto"));
  });
  document.addEventListener("focusout", (evento) => {
    const caja = cajaDeFoto(evento.target);
    if (!caja) return;
    const destino = evento.relatedTarget;
    if (destino && caja.contains(destino)) return;
    panel.hidden = true;
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarZoomFotos);
else iniciarZoomFotos();
