/* ventanas.js — "escritorio" de ventanas flotantes, arrastrables y apilables.
   A diferencia de modal.js (un diálogo centrado, uno a la vez), acá pueden
   convivir varias ventanas abiertas al mismo tiempo, cada una movible con
   el mouse por su barra de título, y la que tocás pasa a primer plano. */

let zIndexTope = 1000;
const ventanasAbiertas = new Map(); // id -> elemento

function crearContenedorVentanas() {
  let cont = document.getElementById("contenedor-ventanas");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "contenedor-ventanas";
    cont.className = "fixed inset-0 pointer-events-none z-40";
    document.body.appendChild(cont);
  }
  return cont;
}

/**
 * Abre (o trae al frente, si ya está abierta) una ventana flotante.
 * @param {Object} opciones
 * @param {string} opciones.id - identificador único de la ventana (ej: "ficha-123")
 * @param {string} opciones.titulo - texto de la barra de título
 * @param {string} opciones.contenidoHtml - HTML del cuerpo de la ventana
 * @param {number} [opciones.ancho=340] - ancho en px
 */
function abrirVentana({ id, titulo, contenidoHtml, ancho = 340 }) {
  if (ventanasAbiertas.has(id)) {
    traerAlFrente(id);
    return;
  }

  const cont = crearContenedorVentanas();
  const offset = (ventanasAbiertas.size % 6) * 28; // que no se apilen exactamente encima
  const win = document.createElement("div");
  win.id = id;
  win.style.left = 90 + offset + "px";
  win.style.top = 90 + offset + "px";
  win.style.width = ancho + "px";
  win.className = "pointer-events-auto absolute bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl";
  win.style.zIndex = ++zIndexTope;

  win.innerHTML = `
    <div class="ventana-header flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 cursor-move select-none rounded-t-xl bg-slate-50 dark:bg-slate-800/60">
      <h3 class="text-sm font-semibold text-slate-800 dark:text-white truncate">${titulo}</h3>
      <button class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg leading-none px-1" onclick="cerrarVentana('${id}')">&times;</button>
    </div>
    <div class="p-4 text-sm max-h-[60vh] overflow-y-auto">${contenidoHtml}</div>
  `;

  cont.appendChild(win);
  ventanasAbiertas.set(id, win);
  hacerArrastrable(win);
  win.addEventListener("mousedown", () => traerAlFrente(id));
}

function cerrarVentana(id) {
  const win = ventanasAbiertas.get(id);
  if (win) {
    win.remove();
    ventanasAbiertas.delete(id);
  }
}

function traerAlFrente(id) {
  const win = ventanasAbiertas.get(id);
  if (win) win.style.zIndex = ++zIndexTope;
}

function hacerArrastrable(win) {
  const header = win.querySelector(".ventana-header");
  let arrastrando = false;
  let offsetX = 0, offsetY = 0;

  header.addEventListener("mousedown", (e) => {
    arrastrando = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!arrastrando) return;
    win.style.left = Math.max(0, e.clientX - offsetX) + "px";
    win.style.top = Math.max(0, e.clientY - offsetY) + "px";
  });

  document.addEventListener("mouseup", () => { arrastrando = false; });
}
