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

document.addEventListener("DOMContentLoaded", iniciarGuardia);
