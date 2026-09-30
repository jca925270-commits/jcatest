/* Versión Tailwind de los helpers de alerta (las páginas no migradas siguen
   usando mostrarError/mostrarExito de api.js, que trabaja con clases de
   Bootstrap — no tocar esas para no romperlas mientras dura la migración). */

function mostrarErrorTW(contenedorId, mensaje) {
  const el = document.getElementById(contenedorId);
  if (!el) { alert(mensaje); return; }
  el.textContent = mensaje;
  el.classList.remove("hidden");
  el.className = "mb-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-4 py-3 text-sm";
  setTimeout(() => el.classList.add("hidden"), 6000);
}

function mostrarExitoTW(contenedorId, mensaje) {
  const el = document.getElementById(contenedorId);
  if (!el) return;
  el.textContent = mensaje;
  el.className = "mb-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-sm";
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function badgeEstadoTW(estado) {
  const nombres = {
    en_stock: "En stock", vendido: "Vendido", comodato: "Comodato", garantia: "Garantía",
    a_reparar: "A reparar", reparado: "Reparado", devuelto: "Devuelto",
    prueba: "Prueba", de_baja: "De baja", actualizacion: "Actualización",
  };
  const colores = {
    en_stock: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    vendido: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    comodato: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    garantia: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    a_reparar: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    reparado: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    actualizacion: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    devuelto: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    prueba: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    de_baja: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${colores[estado] || ""}">${nombres[estado] || estado}</span>`;
}

function formatearFechaTW(valor) {
  if (!valor) return "—";
  const d = new Date(String(valor).replace(" ", "T"));
  if (isNaN(d)) return valor;
  return d.toLocaleDateString("es-AR") + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
