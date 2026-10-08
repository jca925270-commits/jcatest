function opciones(lista, seleccionado) {
  const items = [...new Set(lista.filter(Boolean))];
  const html = items.map((v) => `<option value="${textoPlano(v)}">${textoPlano(v)}</option>`).join("");
  return `<option value="">Seleccionar…</option>${html}<option value="__otro__">Otro</option>`
    .replace(`value="${textoPlano(seleccionado || "")}"`, `value="${textoPlano(seleccionado || "")}" selected`);
}

function llenarSelect(id, lista, seleccionado) {
  const el = document.getElementById(id);
  el.innerHTML = opciones(lista, seleccionado);
  if (seleccionado) el.value = seleccionado;
}

function toggleOtro(selectId, cajaId) {
  const mostrar = document.getElementById(selectId).value === "__otro__";
  document.getElementById(cajaId).classList.toggle("d-none", !mostrar);
  if (!mostrar) document.getElementById(cajaId).querySelector("input").value = "";
}

function valorSelect(selectId, otroId) {
  const valor = document.getElementById(selectId).value;
  if (valor === "__otro__") return document.getElementById(otroId).value.trim();
  return valor.trim();
}

async function cargarOpciones() {
  const data = await apiFetch("soporte-planilla/opciones");
  llenarSelect("razon", data.razones || []);
  llenarSelect("dispositivo", data.dispositivos || []);
  llenarSelect("estado", data.estados || []);
  llenarSelect("correo", data.carriers || []);
  const instancias = data.instancias && data.instancias.length ? data.instancias : ["PENDIENTE", "EN PROCESO", "FINALIZADO"];
  llenarSelect("instancia", instancias, "PENDIENTE");
  document.getElementById("instancia").value = "PENDIENTE";
  llenarSelect("deposito", data.depositos || []);
  llenarSelect("lote", data.lotes || []);
  document.getElementById("deposito").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("lote").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("estado").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("instancia").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("razon").querySelector('option[value="__otro__"]')?.remove();
}

function limpiarFormulario() {
  document.getElementById("form-ingreso").reset();
  document.getElementById("fecha").value = new Date().toISOString().slice(0, 10);
  document.getElementById("instancia").value = "PENDIENTE";
  ["caja-dispositivo", "caja-correo"].forEach((id) => document.getElementById(id).classList.add("d-none"));
  document.getElementById("msg-error").classList.add("d-none");
  document.getElementById("msg-exito").classList.add("d-none");
}

document.getElementById("dispositivo").addEventListener("change", () => toggleOtro("dispositivo", "caja-dispositivo"));
document.getElementById("correo").addEventListener("change", () => toggleOtro("correo", "caja-correo"));
document.getElementById("btn-limpiar").addEventListener("click", limpiarFormulario);

document.getElementById("form-ingreso").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  document.getElementById("msg-error").classList.add("d-none");
  document.getElementById("msg-exito").classList.add("d-none");
  const cuerpo = {
    fecha: document.getElementById("fecha").value,
    razon_social: document.getElementById("razon").value,
    razsocial_agreg: document.getElementById("razon-nueva").value.trim(),
    contacto: document.getElementById("contacto").value.trim(),
    dispositivo: valorSelect("dispositivo", "dispositivo-otro"),
    estado: document.getElementById("estado").value,
    mac: document.getElementById("mac").value.trim(),
    mac_wifi: document.getElementById("mac-wifi").value.trim(),
    mac_eth: document.getElementById("mac-eth").value.trim(),
    caja: document.getElementById("caja").value.trim(),
    perifericos: document.getElementById("perifericos").value.trim(),
    correo: valorSelect("correo", "correo-otro"),
    seguimiento: document.getElementById("seguimiento").value.trim(),
    codigo_seguimiento: document.getElementById("codigo").value.trim(),
    observacion: document.getElementById("observacion").value.trim(),
    motivo: document.getElementById("motivo").value.trim(),
    instancia_gestion: document.getElementById("instancia").value,
    deposito: document.getElementById("deposito").value,
    lote: document.getElementById("lote").value,
    remito: document.getElementById("remito").value.trim(),
    num_ticket: document.getElementById("ticket").value.trim(),
    factura: document.getElementById("factura").value.trim(),
  };
  try {
    await apiFetch("soporte-planilla/ingreso", { method: "POST", body: cuerpo });
    mostrarExito("msg-exito", "Ingreso guardado. Ya figura en Movimientos → Ingreso.");
    limpiarFormulario();
    document.getElementById("msg-exito").classList.remove("d-none");
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
});

document.getElementById("fecha").value = new Date().toISOString().slice(0, 10);
cargarOpciones().catch((err) => mostrarError("msg-error", err.message));
