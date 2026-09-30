/* Egreso — salida de uno o varios equipos ya existentes en stock
   (venta, comodato, garantía, devolución, envío a reparar).
   Reutiliza POST /api/movimientos por cada equipo agregado a la lista. */

let EQUIPOS_A_EGRESAR = []; // [{id, mac, tipo_nombre, estado}]

async function cargarDepositosEgreso() {
  const cat = await apiFetch("catalogos.php");
  const sel = document.getElementById("egr-deposito-origen");
  sel.innerHTML = '<option value="">—</option>' +
    (cat.deposito || []).map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
}

function actualizarVisibilidadCliente() {
  const tipo = document.getElementById("egr-tipo").value;
  const wrap = document.getElementById("egr-cliente-wrap");
  const necesitaCliente = ["venta", "comodato", "garantia"].includes(tipo);
  wrap.style.opacity = necesitaCliente ? "1" : ".5";
  document.getElementById("egr-cliente").disabled = !necesitaCliente;
}
document.getElementById("egr-tipo").addEventListener("change", actualizarVisibilidadCliente);

let timeoutBusquedaCliente = null;
document.getElementById("egr-cliente").addEventListener("input", () => {
  clearTimeout(timeoutBusquedaCliente);
  timeoutBusquedaCliente = setTimeout(async () => {
    const valor = document.getElementById("egr-cliente").value.trim();
    if (valor.length < 2) return;
    try {
      const clientes = await apiFetch("clientes.php", { params: { q: valor } });
      document.getElementById("lista-clientes-egr").innerHTML =
        clientes.map(c => `<option value="${c.razon_social}">`).join("");
    } catch (_) { /* silencioso */ }
  }, 250);
});

async function obtenerOcrearClienteId(nombre) {
  if (!nombre) return null;
  const existentes = await apiFetch("clientes.php", { params: { q: nombre } });
  const match = existentes.find(c => c.razon_social.toLowerCase() === nombre.toLowerCase());
  if (match) return match.id;
  const nuevo = await apiFetch("clientes.php", { method: "POST", body: { razon_social: nombre } });
  return nuevo.id;
}

function renderChips() {
  const cont = document.getElementById("egr-lista-chips");
  cont.innerHTML = EQUIPOS_A_EGRESAR.map((eq, i) => `
    <span class="equipo-chip">
      <span class="mac">${eq.mac}</span>
      <span class="text-muted">${eq.tipo_nombre || ""}</span>
      <span class="quitar" data-idx="${i}">&times;</span>
    </span>
  `).join("") || `<p class="text-muted small mb-0">Todavía no agregaste ningún equipo.</p>`;

  cont.querySelectorAll(".quitar").forEach(el => {
    el.addEventListener("click", () => {
      EQUIPOS_A_EGRESAR.splice(Number(el.dataset.idx), 1);
      renderChips();
    });
  });
}

document.getElementById("egr-buscador").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const input = document.getElementById("egr-buscador");
  const q = input.value.trim();
  if (!q) return;

  try {
    const filas = await apiFetch("dispositivo.php", { params: { q } });
    if (!filas.length) {
      mostrarError("msg-error", `No se encontró ningún equipo con "${q}".`);
      return;
    }
    const d = filas[0];
    if (EQUIPOS_A_EGRESAR.some(eq => eq.id === d.id)) {
      mostrarError("msg-error", "Ese equipo ya está en la lista.");
      input.value = "";
      return;
    }
    EQUIPOS_A_EGRESAR.push({ id: d.id, mac: d.mac_wifi || d.mac_eth || "—", tipo_nombre: d.tipo_nombre, estado: d.estado });
    renderChips();
    input.value = "";
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
});

async function cargarHistorialEgresos() {
  const filas = await apiFetch("movimientos.php", {
    params: { tipo_movimiento: "venta,comodato,garantia,devolucion,a_reparar", limite: 20 },
  });
  document.getElementById("tabla-egresos").innerHTML = filas.map(m => `
    <tr>
      <td>${formatearFecha(m.fecha)}</td>
      <td class="mac">${m.mac_wifi || m.mac_eth || "—"}</td>
      <td>${m.tipo_movimiento}</td>
      <td>${m.cliente_nombre || "—"}</td>
      <td>${m.remito || "—"}</td>
      <td>${m.ticket || "—"}</td>
      <td>${m.usuario_nombre || "—"}</td>
    </tr>
  `).join("") || `<tr><td colspan="7" class="text-center text-muted py-3">Todavía no se registraron egresos</td></tr>`;
}

document.getElementById("btn-registrar-egreso").addEventListener("click", async () => {
  if (!EQUIPOS_A_EGRESAR.length) {
    mostrarError("msg-error", "Agregá al menos un equipo antes de registrar el egreso.");
    return;
  }

  const tipo = document.getElementById("egr-tipo").value;
  const depositoOrigen = document.getElementById("egr-deposito-origen").value || null;
  const remito = document.getElementById("egr-remito").value.trim() || null;
  const factura = document.getElementById("egr-factura").value.trim() || null;
  const ticket = document.getElementById("egr-ticket").value.trim() || null;
  const motivo = document.getElementById("egr-motivo").value.trim() || null;

  const necesitaCliente = ["venta", "comodato", "garantia"].includes(tipo);
  const clienteNombre = document.getElementById("egr-cliente").value.trim();
  let clienteId = null;
  if (necesitaCliente) {
    if (!clienteNombre) {
      mostrarError("msg-error", "Este tipo de egreso requiere indicar el cliente / razón social.");
      return;
    }
    clienteId = await obtenerOcrearClienteId(clienteNombre);
  }

  let ok = 0, fallidos = 0;
  for (const eq of EQUIPOS_A_EGRESAR) {
    try {
      await apiFetch("movimientos.php", {
        method: "POST",
        body: {
          dispositivo_id: eq.id,
          tipo_movimiento: tipo,
          cliente_id: clienteId,
          deposito_origen_id: depositoOrigen,
          remito, factura, ticket, motivo,
        },
      });
      ok++;
    } catch (err) {
      fallidos++;
      mostrarError("msg-error", `${eq.mac}: ${err.message}`);
    }
  }

  if (ok) {
    mostrarExito("msg-exito", `${ok} equipo(s) egresado(s) correctamente${fallidos ? ` — ${fallidos} con error` : ""}.`);
    EQUIPOS_A_EGRESAR = [];
    renderChips();
    document.getElementById("egr-cliente").value = "";
    document.getElementById("egr-remito").value = "";
    document.getElementById("egr-factura").value = "";
    document.getElementById("egr-ticket").value = "";
    document.getElementById("egr-motivo").value = "";
    cargarHistorialEgresos();
  }
});

(async () => {
  await cargarDepositosEgreso();
  actualizarVisibilidadCliente();
  renderChips();
  await cargarHistorialEgresos();
  document.getElementById("egr-buscador").focus();
})();
