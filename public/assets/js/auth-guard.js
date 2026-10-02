/* Se incluye en todas las páginas protegidas (no en login.html).
   Verifica sesión activa, muestra los datos del usuario en el sidebar
   y oculta las secciones que no correspondan a su rol. */

async function iniciarGuardia() {
  let data;
  try {
    data = await apiFetch("auth.php", { params: { accion: "me" } });
  } catch (_) {
    window.location.href = "login.html";
    return null;
  }
  if (!data || !data.usuario) {
    window.location.href = "login.html";
    return null;
  }

  const u = data.usuario;
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
  }

  // Marca como activo el sub-acceso del menú cuya URL (con query string) coincide
  // con la actual, y abre automáticamente el grupo desplegable que lo contiene.
  document.querySelectorAll(".sidebar .sub-link").forEach((a) => {
    const linkUrl = new URL(a.getAttribute("href"), location.href);
    if (linkUrl.pathname === location.pathname && linkUrl.search === location.search) {
      a.classList.add("active");
      const grupo = a.closest("details.nav-group");
      if (grupo) grupo.open = true;
    }
  });

  return u;
}

const ICONO_POR_TEXTO = {
  Dashboard: "dashboard",
  "Búsqueda": "search",
  dispositivo: "inventory_2",
  "Reparados y Reutilizados": "build",
  Ingreso: "move_to_inbox",
  Egreso: "outbox",
  Movimientos: "sync_alt",
  "Soporte Técnico": "support_agent",
  "Depósito": "warehouse",
  Estado: "sell",
  Stock: "menu_book",
  Clientes: "receipt_long",
  Reportes: "monitoring",
  Usuarios: "person",
};

function teñirIconosMenu() {
  document.querySelectorAll("aside.sidebar .nav-link, aside.sidebar summary").forEach((el) => {
    if (el.querySelector(".nav-icono")) return;
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
    ? `<small>Trazabilidad por MAC</small>`
    : `<div class="logo-subtitulo">Trazabilidad por MAC</div>`;
  marca.innerHTML = `<img class="logo-banner" src="assets/img/logo.png" alt="Banner Director">${subtitulo}`;
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
    const data = await apiFetch("reportes.php", { params: { accion: "ultima_sync" } });
    if (!data) return;
    el.textContent = data.ultima_sync
      ? `Última sincronización: ${data.ultima_sync}`
      : "Sin sincronización de la planilla";
  } catch (_) {
    el.textContent = "";
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
