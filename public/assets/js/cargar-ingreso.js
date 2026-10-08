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

let razonesCliente = [];

function normalizarBusqueda(valor) {
  return String(valor || "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function armarListaRazones() {
  const lista = document.getElementById("razon-lista");
  lista.innerHTML = `${razonesCliente.map((nombre) => `<button type="button" class="razon-opcion" data-razon="${textoPlano(nombre)}">${textoPlano(nombre)}</button>`).join("")}<div class="razon-vacio d-none">No hay clientes con ese nombre</div>`;
}

function pintarRazones(filtro) {
  const lista = document.getElementById("razon-lista");
  if (lista.childElementCount <= 1) armarListaRazones();
  const consulta = normalizarBusqueda(filtro);
  let visibles = 0;
  lista.querySelectorAll(".razon-opcion").forEach((boton) => {
    const mostrar = !consulta || normalizarBusqueda(boton.dataset.razon).includes(consulta);
    boton.classList.toggle("d-none", !mostrar);
    boton.classList.remove("activa");
    if (mostrar) visibles += 1;
  });
  lista.querySelector(".razon-vacio").classList.toggle("d-none", visibles > 0);
}

function elegirRazon(nombre) {
  document.getElementById("razon").value = nombre || "";
  document.getElementById("razon-boton").textContent = nombre || "Seleccionar…";
  cerrarRazones();
}

function abrirRazones() {
  const panel = document.getElementById("razon-panel");
  panel.classList.remove("d-none");
  document.getElementById("razon-boton").setAttribute("aria-expanded", "true");
  const filtro = document.getElementById("razon-filtro");
  filtro.value = "";
  pintarRazones("");
  filtro.focus();
}

function cerrarRazones() {
  document.getElementById("razon-panel").classList.add("d-none");
  document.getElementById("razon-boton").setAttribute("aria-expanded", "false");
}

document.getElementById("razon-boton").addEventListener("click", () => {
  const abierto = !document.getElementById("razon-panel").classList.contains("d-none");
  if (abierto) cerrarRazones();
  else abrirRazones();
});

document.getElementById("razon-filtro").addEventListener("input", (evento) => {
  pintarRazones(evento.target.value);
});

document.getElementById("razon-filtro").addEventListener("keydown", (evento) => {
  const opcionesVisibles = [...document.querySelectorAll("#razon-lista .razon-opcion")];
  const activa = document.querySelector("#razon-lista .razon-opcion.activa");
  const indice = opcionesVisibles.indexOf(activa);
  if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
    evento.preventDefault();
    const siguiente = evento.key === "ArrowDown" ? indice + 1 : indice - 1;
    const elegida = opcionesVisibles[Math.max(0, Math.min(opcionesVisibles.length - 1, siguiente))];
    if (!elegida) return;
    if (activa) activa.classList.remove("activa");
    elegida.classList.add("activa");
    elegida.scrollIntoView({ block: "nearest" });
  }
  if (evento.key === "Enter") {
    evento.preventDefault();
    if (activa) elegirRazon(activa.dataset.razon);
  }
  if (evento.key === "Escape") cerrarRazones();
});

document.getElementById("razon-lista").addEventListener("click", (evento) => {
  const opcion = evento.target.closest(".razon-opcion");
  if (opcion) elegirRazon(opcion.dataset.razon);
});

document.addEventListener("click", (evento) => {
  if (!document.getElementById("razon-widget").contains(evento.target)) cerrarRazones();
});

async function cargarOpciones() {
  const data = await apiFetch("soporte-planilla/opciones");
  razonesCliente = data.razones || [];
  armarListaRazones();
  llenarSelect("dispositivo", data.dispositivos || []);
  llenarSelect("estado", data.estados || []);
  llenarSelect("correo", data.carriers || []);
  const instancias = data.instancias && data.instancias.length ? data.instancias : ["PENDIENTE", "EN PROCESO", "FINALIZADO"];
  llenarSelect("instancia", instancias, "PENDIENTE");
  document.getElementById("instancia").value = "PENDIENTE";
  llenarSelect("deposito", data.depositos || []);
  document.getElementById("deposito").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("estado").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("instancia").querySelector('option[value="__otro__"]')?.remove();
}

function fechaHoy() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function limpiarFormulario() {
  document.getElementById("form-ingreso").reset();
  document.getElementById("fecha").value = fechaHoy();
  document.getElementById("instancia").value = "PENDIENTE";
  elegirRazon("");
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
    correo: valorSelect("correo", "correo-otro"),
    seguimiento: document.getElementById("seguimiento").value.trim(),
    observacion: document.getElementById("observacion").value.trim(),
    motivo: document.getElementById("motivo").value.trim(),
    instancia_gestion: document.getElementById("instancia").value,
    deposito: document.getElementById("deposito").value,
  };
  try {
    await apiFetch("soporte-planilla/ingreso", { method: "POST", body: cuerpo });
    mostrarExito("msg-exito", "Ingreso guardado. Ya figura en Movimientos → Ingreso.");
    limpiarFormulario();
    document.getElementById("msg-exito").classList.remove("d-none");
    cargarOpciones().catch(() => {});
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
});

document.getElementById("fecha").value = fechaHoy();
cargarOpciones().catch((err) => mostrarError("msg-error", err.message));
