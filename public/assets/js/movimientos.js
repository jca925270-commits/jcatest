let DISPOSITIVO_ACTUAL = null;

async function cargarDepositos() {
  const cat = await apiFetch("catalogos.php");
  const sel = document.getElementById("mov-deposito-destino");
  sel.innerHTML = '<option value="">—</option>' + cat.depositos.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
}

async function buscarDispositivoParaMovimiento() {
  const q = document.getElementById("mov-buscador").value.trim();
  const info = document.getElementById("mov-dispositivo-info");
  if (!q) return;
  try {
    const filas = await apiFetch("dispositivo.php", { params: { q } });
    if (!filas.length) {
      DISPOSITIVO_ACTUAL = null;
      info.innerHTML = `<span class="text-danger">No se encontró ningún dispositivo con ese dato.</span>`;
      return;
    }
    DISPOSITIVO_ACTUAL = filas[0];
    info.innerHTML = `<span class="text-success">Encontrado: ${htmlFotoEquipo(DISPOSITIVO_ACTUAL.tipo_nombre)} —
      ${DISPOSITIVO_ACTUAL.mac_wifi || DISPOSITIVO_ACTUAL.mac_eth} (estado actual: ${DISPOSITIVO_ACTUAL.estado})</span>`;
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
}

let timeoutBusquedaCliente = null;
async function buscarClientesEnVivo() {
  const valor = document.getElementById("mov-cliente").value.trim();
  if (valor.length < 2) return;
  try {
    const clientes = await apiFetch("clientes.php", { params: { q: valor } });
    document.getElementById("lista-clientes").innerHTML =
      clientes.map(c => `<option value="${c.razon_social}">`).join("");
  } catch (err) { /* silencioso, no interrumpe la carga del formulario */ }
}
document.getElementById("mov-cliente").addEventListener("input", () => {
  clearTimeout(timeoutBusquedaCliente);
  timeoutBusquedaCliente = setTimeout(buscarClientesEnVivo, 250);
});

async function obtenerOcrearClienteId(nombre) {
  if (!nombre) return null;
  const existentes = await apiFetch("clientes.php", { params: { q: nombre } });
  const match = existentes.find(c => c.razon_social.toLowerCase() === nombre.toLowerCase());
  if (match) return match.id;
  const nuevo = await apiFetch("clientes.php", { method: "POST", body: { razon_social: nombre } });
  return nuevo.id;
}

const VISTA = new URLSearchParams(location.search).get("vista");

async function cargarHistorial() {
  const query = { limite: 100 };
  if (VISTA === "ingreso") query.tipo_movimiento = "ingreso";
  if (VISTA === "egreso") query.tipo_movimiento = "venta,comodato,garantia,devolucion,a_reparar,reparado,actualizacion";

  const filas = await apiFetch("movimientos.php", { params: query });
  document.getElementById("tabla-movimientos").innerHTML = filas.map(m => `
    <tr>
      <td>${formatearFecha(m.fecha)}</td>
      <td class="mac">${m.mac_wifi || m.mac_eth || "—"}</td>
      <td>${m.tipo_movimiento}</td>
      <td>${m.cliente_nombre || "—"}</td>
      <td>${m.origen_nombre || "—"} → ${m.destino_nombre || "—"}</td>
      <td>${m.usuario_nombre || "—"}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="text-center text-muted py-3">Sin movimientos todavía</td></tr>`;
}

function aplicarNotaVista() {
  const notas = {
    mac: "Mostrando todos los movimientos — usá el buscador de arriba para filtrar por una MAC puntual.",
    ingreso: "Mostrando solo movimientos de tipo Ingreso.",
    egreso: "Mostrando movimientos de egreso (venta, comodato, garantía, devolución, reparación, actualización).",
    fecha: "Para filtrar por rango de fechas con más detalle, usá la sección Búsqueda del menú.",
    estado: "Para ver movimientos agrupados por estado del dispositivo, usá la sección Estado del menú.",
    instancia: "La instancia de gestión (Finalizado / En proceso / Pendiente) se ve en el detalle de cada movimiento de Soporte Técnico.",
  };
  if (VISTA && notas[VISTA]) {
    document.querySelector("main .page-subtitle").insertAdjacentHTML("afterend",
      `<div class="alert alert-secondary py-2 px-3 small mb-3">${notas[VISTA]}</div>`);
  }
}

document.getElementById("mov-buscador").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); buscarDispositivoParaMovimiento(); }
});

document.getElementById("btn-registrar-mov").addEventListener("click", async () => {
  if (!DISPOSITIVO_ACTUAL) {
    mostrarError("msg-error", "Primero escaneá o buscá un dispositivo válido");
    return;
  }
  try {
    const clienteNombre = document.getElementById("mov-cliente").value.trim();
    const clienteId = await obtenerOcrearClienteId(clienteNombre);

    await apiFetch("movimientos.php", {
      method: "POST",
      body: {
        dispositivo_id: DISPOSITIVO_ACTUAL.id,
        tipo_movimiento: document.getElementById("mov-tipo").value,
        cliente_id: clienteId,
        deposito_destino_id: document.getElementById("mov-deposito-destino").value || null,
        remito: document.getElementById("mov-remito").value.trim() || null,
        factura: document.getElementById("mov-factura").value.trim() || null,
        motivo: document.getElementById("mov-motivo").value.trim() || null,
      },
    });

    mostrarExito("msg-exito", "Movimiento registrado");
    document.getElementById("mov-buscador").value = "";
    document.getElementById("mov-cliente").value = "";
    document.getElementById("mov-remito").value = "";
    document.getElementById("mov-factura").value = "";
    document.getElementById("mov-motivo").value = "";
    document.getElementById("mov-dispositivo-info").innerHTML = "";
    DISPOSITIVO_ACTUAL = null;
    document.getElementById("mov-buscador").focus();
    cargarHistorial();
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
});

(async () => {
  aplicarNotaVista();
  await cargarDepositos();
  await cargarHistorial();
  document.getElementById("mov-buscador").focus();
})();
