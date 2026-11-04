/* Se incluye en todas las páginas protegidas (no en login.html).
   Verifica sesión activa, muestra los datos del usuario en el sidebar
   y oculta las secciones que no correspondan a su rol. */

let resolverGuardia;
window.guardiaLista = new Promise((resolve) => { resolverGuardia = resolve; });

function cerrarGuardia(usuario) {
  window.usuarioSesion = usuario || null;
  if (!resolverGuardia) return;
  resolverGuardia(window.usuarioSesion);
  resolverGuardia = null;
}

async function iniciarGuardia() {
  let data;
  try {
    data = await apiFetch("auth.php", { params: { accion: "me" } });
  } catch (_) {
    cerrarGuardia(null);
    window.location.href = "login.html";
    return null;
  }
  if (!data || !data.usuario) {
    cerrarGuardia(null);
    window.location.href = "login.html";
    return null;
  }

  const u = data.usuario;
  cerrarGuardia(u);
  const nombreEl = document.getElementById("usuario-nombre");
  const rolEl = document.getElementById("usuario-rol");
  if (nombreEl) nombreEl.textContent = u.nombre;
  if (rolEl) rolEl.textContent = u.rol;

  // Oculta ítems de nav marcados como solo-admin si el usuario no lo es
  if (u.rol !== "admin") {
    document.querySelectorAll("[data-solo-admin]").forEach((el) => el.remove());
  }
  // Oculta acciones de escritura (crear/editar/borrar) para rol de solo lectura
  if (u.rol === "lectura") {
    document.querySelectorAll("[data-requiere-escritura]").forEach((el) => el.remove());
  }

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      await apiFetch("auth.php", { method: "POST", params: { accion: "logout" } });
      window.location.href = "login.html";
    });
    if (!document.getElementById("btn-cambiar-clave")) {
      const link = document.createElement("a");
      link.id = "btn-cambiar-clave";
      link.href = "#";
      link.textContent = "Cambiar contraseña";
      link.className = btnLogout.className;
      btnLogout.before(link);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        abrirCuenta();
      });
    }
    const cambiar = document.getElementById("btn-cambiar-clave");
    if (cambiar) cambiar.className = btnLogout.className;
  }
  mostrarReloj();

  document.querySelectorAll("aside.sidebar nav > details.nav-group").forEach((grupo) => {
    if (grupo.querySelector(":scope > .menu-panel")) return;
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    [...grupo.children].forEach((hijo) => {
      if (hijo.tagName !== "SUMMARY") panel.appendChild(hijo);
    });
    grupo.appendChild(panel);
    panel.querySelectorAll("details.nav-group").forEach((sub) => {
      sub.addEventListener("toggle", () => {
        if (!sub.open) return;
        const caja = panel.getBoundingClientRect();
        const item = sub.getBoundingClientRect();
        if (item.bottom > caja.bottom) panel.scrollTop += item.bottom - caja.bottom + 8;
      });
    });
    grupo.addEventListener("toggle", () => {
      if (!grupo.open) return;
      document.querySelectorAll("aside.sidebar nav > details.nav-group[open]").forEach((otro) => {
        if (otro !== grupo) otro.open = false;
      });
    });
  });
  if (!window.menuSuperiorListo) {
    window.menuSuperiorListo = true;
    document.addEventListener("click", (evento) => {
      if (evento.target.closest("aside.sidebar details")) return;
      document.querySelectorAll("aside.sidebar nav > details.nav-group[open]").forEach((grupo) => {
        grupo.open = false;
      });
    });
  }

  // Marca como activo el sub-acceso del menú cuya URL (con query string) coincide
  // con la actual, y abre automáticamente el grupo desplegable que lo contiene.
  document.querySelectorAll("aside.sidebar nav > a.nav-link").forEach((a) => {
    const linkUrl = new URL(a.getAttribute("href"), location.href);
    if (linkUrl.pathname === location.pathname) a.classList.add("active");
  });

  document.querySelectorAll(".sidebar a.sub-link").forEach((a) => {
    const linkUrl = new URL(a.getAttribute("href"), location.href);
    const mismoPath = linkUrl.pathname === location.pathname;
    const mismaBusqueda = linkUrl.search === location.search;
    const estadoActual = new URLSearchParams(location.search).get("estado") || "vendido";
    const estadoLink = new URLSearchParams(linkUrl.search).get("estado");
    const mismoEstado = mismoPath && location.pathname.endsWith("estado.html") && estadoLink === estadoActual;
    const fichaCliente = mismoPath && location.pathname.endsWith("clientes.html") && !linkUrl.search;
    if (mismoPath && (mismaBusqueda || mismoEstado || fichaCliente)) {
      a.classList.add("active");
      let grupo = a.closest("details.nav-group");
      while (grupo) {
        const enLaBarra = grupo.parentElement && grupo.parentElement.matches("nav");
        if (enLaBarra) grupo.classList.add("tiene-activo");
        else grupo.open = true;
        grupo = grupo.parentElement ? grupo.parentElement.closest("details.nav-group") : null;
      }
    }
  });

  return u;
}

const ICONO_POR_TEXTO = {
  Dashboard: "dashboard",
  "Búsqueda": "search",
  dispositivo: "devices",
  Dispositivo: "devices",
  "Depósitos": "warehouse",
  "Reparados y Reutilizados": "build",
  Ingreso: "move_to_inbox",
  Egreso: "outbox",
  Movimientos: "sync_alt",
  "Soporte Técnico": "support_agent",
  "Depósito": "warehouse",
  Estado: "flag",
  Stock: "menu_book",
  Clientes: "receipt_long",
  Reportes: "monitoring",
  Usuarios: "person",
};

function teñirIconosMenu() {
  document.querySelectorAll("aside.sidebar .nav-link, aside.sidebar summary").forEach((el) => {
    if (el.classList.contains("sub-link") || el.querySelector(".nav-icono")) return;
    const limpio = el.textContent.replace(/\p{Extended_Pictographic}|\uFE0F/gu, "").trim();
    const icono = ICONO_POR_TEXTO[limpio];
    if (!icono) return;
    el.textContent = "";
    const span = document.createElement("span");
    span.className = "nav-icono";
    span.setAttribute("aria-hidden", "true");
    span.textContent = icono;
    el.append(span, document.createTextNode(" " + limpio));
  });
}

function colocarLogo() {
  const marca = document.querySelector("aside.sidebar .brand, aside.sidebar > div:first-child");
  if (!marca || marca.querySelector(".logo-banner")) return;
  const subtitulo = marca.classList.contains("brand")
    ? `<small>SOPORTE Y LOGISTICA</small>`
    : `<div class="logo-subtitulo">SOPORTE Y LOGISTICA</div>`;
  marca.innerHTML = `<img class="logo-banner" src="assets/img/logo.png" alt="Banner Director">${subtitulo}`;
}

function textoAhora() {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.filter((parte) => parte.type !== "literal").map((parte) => [parte.type, parte.value]));
  return `Hoy es: ${valor.day}/${valor.month}/${valor.year} ${valor.hour}:${valor.minute}`;
}

function mostrarReloj() {
  const caja = document.getElementById("btn-logout")?.parentElement;
  if (!caja || document.getElementById("reloj-sitio")) return;
  const reloj = document.createElement("div");
  reloj.id = "reloj-sitio";
  reloj.className = "reloj-sitio";
  caja.appendChild(reloj);
  const pintar = () => { reloj.textContent = textoAhora(); };
  pintar();
  setInterval(pintar, 1000);
}

async function actualizarSyncPlanilla() {
  let el = document.getElementById("sync-planilla");
  if (!el) {
    el = document.createElement("div");
    el.id = "sync-planilla";
    el.className = "sync-planilla";
    document.body.appendChild(el);
  }
  try {
    const data = await apiFetch("reportes.php", { params: { accion: "ultima_sync" }, silencioso: true });
    if (!data) return;
    el.textContent = data.ultima_sync
      ? `Última sincronización: ${data.ultima_sync}`
      : "Sin sincronización de la planilla";
  } catch (_) {
    el.textContent = "";
  }
}

function asegurarModalCuenta() {
  if (document.getElementById("modal-cuenta")) return;
  const estilo = document.createElement("style");
  estilo.textContent = `
    #modal-cuenta { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.55); }
    #modal-cuenta.oculta { display: none; }
    #modal-cuenta .caja { width: 100%; max-width: 380px; background: #1c1917; color: #fff8f3; border-radius: 16px; padding: 22px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
    #modal-cuenta h2 { margin: 0 0 14px; font-size: 18px; }
    #modal-cuenta label { display: block; margin: 10px 0 4px; font-size: 12px; color: #d6d3d1; }
    #modal-cuenta input { width: 100%; box-sizing: border-box; border: 1px solid #44403c; background: #292524; color: #fff8f3; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
    #modal-cuenta .acciones { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
    #modal-cuenta button { border: 0; border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
    #modal-cuenta .primario { background: #ffb5a0; color: #1c1917; font-weight: 600; }
    #modal-cuenta .secundario { background: transparent; color: #d6d3d1; }
    #modal-cuenta .aviso { margin-top: 10px; font-size: 13px; }
    #modal-cuenta .aviso.error { color: #ffb4a8; }
    #modal-cuenta .aviso.ok { color: #b8e0c8; }
  `;
  document.head.appendChild(estilo);
  const modal = document.createElement("div");
  modal.id = "modal-cuenta";
  modal.className = "oculta";
  modal.innerHTML = `
    <form class="caja" id="form-cuenta">
      <h2>Cambiar contraseña</h2>
      <label for="cuenta-actual">Contraseña actual</label>
      <input type="password" id="cuenta-actual" autocomplete="current-password">
      <label for="cuenta-nueva">Contraseña nueva</label>
      <input type="password" id="cuenta-nueva" autocomplete="new-password">
      <label for="cuenta-repetir">Repetir la contraseña nueva</label>
      <input type="password" id="cuenta-repetir" autocomplete="new-password">
      <div class="acciones">
        <button type="button" class="secundario" id="cuenta-cerrar">Cerrar</button>
        <button type="submit" class="primario">Guardar</button>
      </div>
      <div id="cuenta-aviso" class="aviso"></div>
    </form>
  `;
  document.body.appendChild(modal);
  document.getElementById("cuenta-cerrar").addEventListener("click", () => modal.classList.add("oculta"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("oculta"); });
  document.getElementById("form-cuenta").addEventListener("submit", cambiarClaveCuenta);
}

function avisoCuenta(texto, ok) {
  const el = document.getElementById("cuenta-aviso");
  el.textContent = texto;
  el.className = "aviso " + (ok ? "ok" : "error");
}

function abrirCuenta() {
  asegurarModalCuenta();
  document.getElementById("cuenta-actual").value = "";
  document.getElementById("cuenta-nueva").value = "";
  document.getElementById("cuenta-repetir").value = "";
  avisoCuenta("", true);
  document.getElementById("modal-cuenta").classList.remove("oculta");
}

async function cambiarClaveCuenta(e) {
  e.preventDefault();
  const nueva = document.getElementById("cuenta-nueva").value;
  if (nueva !== document.getElementById("cuenta-repetir").value) {
    avisoCuenta("Las contraseñas nuevas no coinciden.", false);
    return;
  }
  try {
    const data = await apiFetch("auth.php", {
      method: "POST",
      params: { accion: "cambiar" },
      body: { actual: document.getElementById("cuenta-actual").value, nueva },
    });
    if (!data) return;
    document.getElementById("cuenta-actual").value = "";
    document.getElementById("cuenta-nueva").value = "";
    document.getElementById("cuenta-repetir").value = "";
    avisoCuenta("Listo. La próxima vez ingresá con la contraseña nueva.", true);
  } catch (err) {
    avisoCuenta(err.message, false);
  }
}

colocarLogo();
teñirIconosMenu();
document.addEventListener("DOMContentLoaded", () => {
  colocarLogo();
  teñirIconosMenu();
  iniciarGuardia().then(() => actualizarSyncPlanilla());
  setInterval(actualizarSyncPlanilla, 15000);
});
