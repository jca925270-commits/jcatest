let CATALOGOS = { tipos_equipo: [], depositos: [], lotes: [] };

function llenarSelect(select, opciones, incluirVacio = true) {
  select.innerHTML = (incluirVacio ? '<option value="">—</option>' : "") +
    opciones.map(o => `<option value="${o.id}">${o.nombre}</option>`).join("");
}

async function cargarCatalogos() {
  CATALOGOS = await apiFetch("catalogos.php");
  llenarSelect(document.getElementById("filtro-tipo"), CATALOGOS.tipos_equipo);
  llenarSelect(document.getElementById("filtro-deposito"), CATALOGOS.depositos);
  llenarSelect(document.getElementById("disp-tipo"), CATALOGOS.tipos_equipo, false);
  llenarSelect(document.getElementById("disp-deposito"), CATALOGOS.depositos);
  llenarSelect(document.getElementById("disp-lote"), CATALOGOS.lotes);
}

async function buscardispositivo() {
  const params = {
    q: document.getElementById("buscador").value.trim(),
    estado: document.getElementById("filtro-estado").value,
    tipo_equipo_id: document.getElementById("filtro-tipo").value,
    deposito_id: document.getElementById("filtro-deposito").value,
  };
  try {
    const filas = await apiFetch("dispositivo.php", { params });
    document.getElementById("contador-resultados").textContent = `${filas.length} resultado(s)`;
    document.getElementById("tabla-dispositivo").innerHTML = filas.map(d => `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td class="px-3 py-2 font-mono text-[13px]">${d.mac_wifi || "—"}</td>
        <td class="px-3 py-2 font-mono text-[13px]">${d.mac_eth || "—"}</td>
        <td class="px-3 py-2">${htmlFotoEquipo(d.tipo_nombre)}</td>
        <td class="px-3 py-2">${badgeEstadoTW(d.estado)}</td>
        <td class="px-3 py-2">${d.deposito_nombre || "—"}</td>
        <td class="px-3 py-2">${d.cliente_nombre || "—"}</td>
        <td class="px-3 py-2">${d.caja_n || "—"}</td>
        <td class="px-3 py-2 text-right">
          <button class="text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2.5 py-1" onclick="abrirModalEditar(${d.id})">Editar</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="8" class="text-center text-slate-400 py-8">Sin resultados</td></tr>`;
  } catch (err) {
    mostrarErrorTW("msg-error", err.message);
  }
}

function abrirModalNuevo() {
  document.getElementById("modal-titulo").textContent = "Nuevo dispositivo";
  document.getElementById("form-dispositivo").reset();
  document.getElementById("disp-id").value = "";
  abrirModal("modal-dispositivo");
}

async function abrirModalEditar(id) {
  const d = await apiFetch("dispositivo.php", { params: { id } });
  document.getElementById("modal-titulo").textContent = "Editar dispositivo";
  document.getElementById("disp-id").value = d.id;
  document.getElementById("disp-mac-wifi").value = d.mac_wifi || "";
  document.getElementById("disp-mac-eth").value = d.mac_eth || "";
  document.getElementById("disp-tipo").value = d.tipo_equipo_id;
  document.getElementById("disp-deposito").value = d.deposito_actual_id || "";
  document.getElementById("disp-lote").value = d.lote_id || "";
  document.getElementById("disp-caja").value = d.caja_n || "";
  document.getElementById("disp-cod-fabrica").value = d.codigo_barras_fabrica || "";
  document.getElementById("disp-estado").value = d.estado;
  document.getElementById("disp-obs").value = d.observaciones || "";
  abrirModal("modal-dispositivo");
}

document.getElementById("btn-guardar-dispositivo").addEventListener("click", async () => {
  const id = document.getElementById("disp-id").value;
  const payload = {
    mac_wifi: document.getElementById("disp-mac-wifi").value.trim() || null,
    mac_eth: document.getElementById("disp-mac-eth").value.trim() || null,
    tipo_equipo_id: document.getElementById("disp-tipo").value,
    deposito_actual_id: document.getElementById("disp-deposito").value || null,
    lote_id: document.getElementById("disp-lote").value || null,
    caja_n: document.getElementById("disp-caja").value.trim() || null,
    codigo_barras_fabrica: document.getElementById("disp-cod-fabrica").value.trim() || null,
    estado: document.getElementById("disp-estado").value,
    observaciones: document.getElementById("disp-obs").value.trim() || null,
  };
  try {
    if (id) {
      payload.id = id;
      await apiFetch("dispositivo.php", { method: "PUT", body: payload });
    } else {
      await apiFetch("dispositivo.php", { method: "POST", body: payload });
    }
    cerrarModal("modal-dispositivo");
    mostrarExitoTW("msg-exito", "Dispositivo guardado correctamente");
    buscardispositivo();
  } catch (err) {
    mostrarErrorTW("msg-error", err.message);
  }
});

document.getElementById("buscador").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); buscardispositivo(); }
});
document.getElementById("btn-buscar").addEventListener("click", buscardispositivo);
["filtro-estado", "filtro-tipo", "filtro-deposito"].forEach(id =>
  document.getElementById(id).addEventListener("change", buscardispositivo)
);

function ubicacionPlanilla(nombre, pais) {
  if (pais === "PARAGUAY") return "Paraguay";
  const n = nombre.toLowerCase();
  if (n.includes("campi")) return "Campiña del Sur";
  if (n.includes("casa santi")) return "Casa Santi";
  if (n.includes("contenedor")) return "Contenedor";
  if (n.includes("showroom")) return "Showroom";
  if (n.includes("casas varias")) return "Casas varias";
  return "Oficina";
}

function tipoPlanilla(nombre) {
  const n = nombre.toUpperCase();
  if (n.includes("D3+")) return "D3+";
  if (n.includes("EBD")) return "EBD";
  if (n.includes("CUBE")) return "CUBE";
  if (n.includes("D3")) return "D3";
  return "";
}

async function cargarStockUbicacion() {
  const cont = document.getElementById("stock-ubicacion");
  if (!cont) return;
  const filas = await apiFetch("reportes.php", { params: { accion: "categorias_stock" } });
  const orden = ["Campiña del Sur", "Casa Santi", "Contenedor", "Oficina", "Showroom", "Casas varias", "Paraguay"];
  const grupos = new Map();
  for (const f of filas) {
    const ubi = ubicacionPlanilla(f.nombre, f.pais);
    if (!grupos.has(ubi)) grupos.set(ubi, []);
    grupos.get(ubi).push(f);
  }
  cont.innerHTML = orden.filter((u) => grupos.has(u)).map((ubi) => {
    const items = grupos.get(ubi).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const detalle = items.map((f) => {
      const src = fotoEquipo(tipoPlanilla(f.nombre));
      const foto = src ? `<img src="${src}" alt="" class="equipo-foto">` : "";
      return `<div class="flex items-center justify-between gap-3 py-2 border-t border-slate-200/10">
        <div class="flex items-center gap-2 min-w-0 text-sm">${foto}<span class="truncate">${f.nombre}</span></div>
        <span class="font-mono text-sm shrink-0">${f.cantidad_actual}</span>
      </div>`;
    }).join("");
    return `<section class="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4">
      <h2 class="text-sm font-semibold tracking-wide uppercase text-orange-300 mb-1">${ubi}</h2>
      ${detalle}
    </section>`;
  }).join("");
}

(async () => {
  await cargarStockUbicacion();
  await cargarCatalogos();
  const qURL = new URLSearchParams(location.search).get("q");
  if (qURL) document.getElementById("buscador").value = qURL;
  await buscardispositivo();
  document.getElementById("buscador").focus();
})();
