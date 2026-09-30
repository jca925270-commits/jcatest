/* Modales simples en JS puro. Cada modal es un <div id="..." class="hidden fixed inset-0 ...">
   que se muestra/oculta alternando las clases "hidden" y "flex". */

function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.add("flex");
}

function cerrarModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("hidden");
  el.classList.remove("flex");
}

// Cierra cualquier modal abierto si se hace click en el fondo (data-modal-backdrop)
// o en un botón/elemento marcado con data-cerrar-modal, o al presionar Escape.
document.addEventListener("click", (e) => {
  const backdrop = e.target.closest("[data-modal-backdrop]");
  if (backdrop) cerrarModal(backdrop.id);
  const cerrar = e.target.closest("[data-cerrar-modal]");
  if (cerrar) cerrarModal(cerrar.closest("[data-modal-backdrop]").id);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll("[data-modal-backdrop]:not(.hidden)").forEach((m) => cerrarModal(m.id));
});
