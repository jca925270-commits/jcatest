function opciones(lista, seleccionado) {
  const items = [...new Set(lista.filter(Boolean))];
  const html = items.map((v) => `<option value="${textoPlano(v)}">${textoPlano(v)}</option>`).join("");
  return `<option value="">Seleccionar…</option>${html}<option value="__otro__">Otro</option>`
    .replace(`value="${textoPlano(seleccionado || "")}"`, `value="${textoPlano(seleccionado || "")}" selected`);
}

function llenarSelect(destino, lista, seleccionado) {
  const el = typeof destino === "string" ? document.getElementById(destino) : destino;
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
let catalogoDispositivos = [];
let catalogoEstados = [];

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

function plantillaDispositivo() {
  const base = document.querySelector(".dispositivo-item");
  const copia = base.cloneNode(true);
  copia.querySelectorAll("input").forEach((input) => { input.value = ""; });
  copia.querySelectorAll("select").forEach((sel) => { sel.selectedIndex = 0; });
  copia.querySelector(".caja-dispositivo").classList.add("d-none");
  return copia;
}

function aplicarCatalogoDispositivo(item) {
  const disp = item.querySelector(".sel-dispositivo");
  const est = item.querySelector(".sel-estado");
  const dispValor = disp.value;
  const estValor = est.value;
  llenarSelect(disp, catalogoDispositivos, dispValor);
  llenarSelect(est, catalogoEstados, estValor);
  est.querySelector('option[value="__otro__"]')?.remove();
  if (dispValor) disp.value = dispValor;
  if (estValor) est.value = estValor;
}

function renumerarDispositivos() {
  const items = [...document.querySelectorAll("#lista-dispositivos .dispositivo-item")];
  items.forEach((item, i) => {
    item.classList.remove("es-extra");
    item.querySelector(".dispositivo-titulo").textContent = items.length > 1 ? `Dispositivo ${i + 1}` : "Dispositivo";
    item.querySelector(".btn-quitar-dispositivo").classList.toggle("d-none", items.length === 1);
  });
}

function agregarDispositivo() {
  const copia = plantillaDispositivo();
  document.getElementById("lista-dispositivos").appendChild(copia);
  aplicarCatalogoDispositivo(copia);
  renumerarDispositivos();
  copia.querySelector(".sel-dispositivo").focus();
}

function leerDispositivos() {
  return [...document.querySelectorAll("#lista-dispositivos .dispositivo-item")].map((item) => {
    const sel = item.querySelector(".sel-dispositivo");
    const otro = item.querySelector(".inp-dispositivo-otro").value.trim();
    return {
      dispositivo: sel.value === "__otro__" ? otro : sel.value.trim(),
      estado: item.querySelector(".sel-estado").value,
      caja: item.querySelector(".inp-caja").value.trim(),
      mac: item.querySelector(".inp-mac").value.trim(),
      mac_wifi: item.querySelector(".inp-mac-wifi").value.trim(),
      mac_eth: item.querySelector(".inp-mac-eth").value.trim(),
    };
  }).filter((d, i) => i === 0 || d.dispositivo || d.estado || d.caja || d.mac || d.mac_wifi || d.mac_eth);
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
  const opcionesVisibles = [...document.querySelectorAll("#razon-lista .razon-opcion:not(.d-none)")];
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

document.getElementById("lista-dispositivos").addEventListener("change", (evento) => {
  const sel = evento.target.closest(".sel-dispositivo");
  if (!sel) return;
  const caja = sel.closest(".dispositivo-item").querySelector(".caja-dispositivo");
  const mostrar = sel.value === "__otro__";
  caja.classList.toggle("d-none", !mostrar);
  if (!mostrar) caja.querySelector("input").value = "";
});

function aplicarMacPegada(item) {
  const campo = item.querySelector(".inp-mac");
  const macs = macsEnTexto(campo.value);
  if (macs.length >= 2) {
    campo.value = `${macs[0]}${macs[1]}`;
    item.querySelector(".inp-mac-wifi").value = macs[0];
    item.querySelector(".inp-mac-eth").value = macs[1];
  } else if (macs.length === 1) {
    campo.value = macs[0];
  }
}

function normalizarMacSola(campo) {
  const macs = macsEnTexto(campo.value);
  if (macs.length >= 1) campo.value = macs[0];
}

document.getElementById("lista-dispositivos").addEventListener("paste", (evento) => {
  const campo = evento.target.closest(".inp-mac, .inp-mac-wifi, .inp-mac-eth");
  if (!campo) return;
  setTimeout(() => {
    if (campo.classList.contains("inp-mac")) aplicarMacPegada(campo.closest(".dispositivo-item"));
    else normalizarMacSola(campo);
  }, 0);
});

document.getElementById("lista-dispositivos").addEventListener("focusout", (evento) => {
  const campo = evento.target.closest(".inp-mac, .inp-mac-wifi, .inp-mac-eth");
  if (!campo) return;
  if (campo.classList.contains("inp-mac")) aplicarMacPegada(campo.closest(".dispositivo-item"));
  else normalizarMacSola(campo);
});

document.getElementById("lista-dispositivos").addEventListener("click", (evento) => {
  const boton = evento.target.closest(".btn-quitar-dispositivo");
  if (!boton) return;
  boton.closest(".dispositivo-item").remove();
  renumerarDispositivos();
});

document.getElementById("btn-agregar-dispositivo").addEventListener("click", agregarDispositivo);

async function cargarOpciones() {
  const data = await apiFetch("soporte-planilla/opciones");
  razonesCliente = data.razones || [];
  armarListaRazones();
  catalogoDispositivos = data.dispositivos || [];
  catalogoEstados = data.estados || [];
  document.querySelectorAll("#lista-dispositivos .dispositivo-item").forEach(aplicarCatalogoDispositivo);
  llenarSelect("correo", data.carriers || []);
  const envios = data.envios && data.envios.length ? data.envios : ["Envío", "Retiro"];
  llenarSelect("envio", envios);
  const instancias = data.instancias && data.instancias.length ? data.instancias : ["PENDIENTE", "EN PROCESO", "FINALIZADO"];
  llenarSelect("instancia", instancias, "PENDIENTE");
  document.getElementById("instancia").value = "PENDIENTE";
  llenarSelect("deposito", data.depositos || []);
  document.getElementById("deposito").querySelector('option[value="__otro__"]')?.remove();
  document.getElementById("instancia").querySelector('option[value="__otro__"]')?.remove();
}

function fechaHoy() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function limpiarFormulario() {
  document.getElementById("form-egreso").reset();
  [...document.querySelectorAll("#lista-dispositivos .dispositivo-item")].slice(1).forEach((item) => item.remove());
  document.querySelector("#lista-dispositivos .caja-dispositivo")?.classList.add("d-none");
  renumerarDispositivos();
  document.getElementById("fecha").value = fechaHoy();
  document.getElementById("instancia").value = "PENDIENTE";
  elegirRazon("");
  document.getElementById("caja-correo").classList.add("d-none");
  document.getElementById("caja-envio").classList.add("d-none");
  document.getElementById("msg-error").classList.add("d-none");
  document.getElementById("msg-exito").classList.add("d-none");
}

document.getElementById("correo").addEventListener("change", () => toggleOtro("correo", "caja-correo"));
document.getElementById("envio").addEventListener("change", () => toggleOtro("envio", "caja-envio"));
document.getElementById("btn-limpiar").addEventListener("click", limpiarFormulario);

document.getElementById("form-egreso").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  document.getElementById("msg-error").classList.add("d-none");
  document.getElementById("msg-exito").classList.add("d-none");
  const cuerpo = {
    fecha: document.getElementById("fecha").value,
    razon_social: document.getElementById("razon").value,
    razsocial_agreg: document.getElementById("razon-nueva").value.trim(),
    contacto: document.getElementById("contacto").value.trim(),
    correo: valorSelect("correo", "correo-otro"),
    envio_retiro: valorSelect("envio", "envio-otro"),
    seguimiento: document.getElementById("seguimiento").value.trim(),
    observacion: document.getElementById("observacion").value.trim(),
    motivo: document.getElementById("motivo").value.trim(),
    instancia_gestion: document.getElementById("instancia").value,
    deposito: document.getElementById("deposito").value,
    dispositivos: leerDispositivos(),
  };
  try {
    const respuesta = await apiFetch("soporte-planilla/egreso", { method: "POST", body: cuerpo });
    const cantidad = Number(respuesta && respuesta.cantidad) || 1;
    const omitidos = Number(respuesta && respuesta.omitidos) || 0;
    const base = cantidad > 1
      ? `${cantidad} egresos guardados. Cada equipo quedó en su fila.`
      : "Egreso guardado. Quedó en su fila.";
    mostrarExito("msg-exito", omitidos
      ? `${base} ${omitidos === 1 ? "1 ya estaba cargado y no se duplicó." : `${omitidos} ya estaban cargados y no se duplicaron.`}`
      : base);
    limpiarFormulario();
    document.getElementById("msg-exito").classList.remove("d-none");
    cargarOpciones().catch(() => {});
  } catch (err) {
    mostrarError("msg-error", err.message);
  }
});

document.getElementById("fecha").value = fechaHoy();
renumerarDispositivos();
cargarOpciones().catch((err) => mostrarError("msg-error", err.message));
