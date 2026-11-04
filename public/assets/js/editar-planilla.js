let catalogoPlanilla = null;
let edicionActual = null;
let ticketEdicion = 0;

function puedeEditarPlanilla() {
  const rol = window.usuarioSesion && window.usuarioSesion.rol;
  return rol === "admin" || rol === "operador";
}

function clienteDePlanilla(fila) {
  return String(fila.razon_social || fila.razsocial_agreg || "").trim().toLocaleLowerCase("es");
}

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function listaConActual(lista, actual) {
  const items = [...new Set((lista || []).filter(Boolean).map((v) => String(v)))];
  const texto = String(actual || "").trim();
  if (!texto) return items;
  const indice = items.findIndex((v) => v.toLocaleLowerCase("es") === texto.toLocaleLowerCase("es"));
  if (indice >= 0) items[indice] = texto;
  else items.push(texto);
  return items;
}

function htmlOpciones(lista, { otro = false } = {}) {
  const opciones = lista.map((v) => `<option value="${escapar(v)}">${escapar(v)}</option>`).join("");
  const extra = otro ? `<option value="__otro__">Otro</option>` : "";
  return `<option value="">Seleccionar…</option>${opciones}${extra}`;
}

function asignarSelect(select, lista, valor, { otro = false, caja, input } = {}) {
  const actual = String(valor || "").trim();
  const items = [...new Set((lista || []).filter(Boolean).map((v) => String(v)))];
  const coincide = items.find((v) => v.toLocaleLowerCase("es") === actual.toLocaleLowerCase("es"));
  const usarOtro = Boolean(otro && actual && !coincide);
  const visibles = coincide ? items.map((v) => (v === coincide ? actual : v)) : items;
  if (!usarOtro && actual && !coincide) visibles.push(actual);
  select.innerHTML = htmlOpciones(visibles, { otro });
  select.value = usarOtro ? "__otro__" : (actual || "");
  if (caja && input) {
    caja.classList.toggle("d-none", !usarOtro);
    input.value = usarOtro ? actual : "";
  }
}

function asegurarModalPlanilla() {
  let modal = document.getElementById("modal-editar-planilla");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "modal-editar-planilla";
  modal.className = "modal fade";
  modal.tabIndex = -1;
  modal.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="modal-editar-titulo">Editar</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <p class="small text-muted" id="modal-editar-aviso"></p>
          <div id="modal-editar-campos"></div>
          <div id="modal-editar-error" class="alert alert-danger d-none mt-3 mb-0"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-teal" id="modal-editar-guardar">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const estilo = document.createElement("style");
  estilo.textContent = `
    #modal-editar-planilla .form-select {
      background-color: var(--surface-alt);
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23ffb5a0' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right .75rem center;
      background-size: 16px 12px;
      padding-right: 2.25rem;
    }
    #modal-editar-planilla .seccion + .seccion { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border); }
  `;
  document.head.appendChild(estilo);
  modal.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-agregar-equipo]")) agregarEquipoModal(modal);
    const quitar = evento.target.closest("[data-quitar-equipo]");
    if (quitar) {
      const items = modal.querySelectorAll(".dispositivo-item");
      if (items.length > 1) quitar.closest(".dispositivo-item").remove();
      renumerarEquiposModal(modal);
    }
    if (evento.target.closest("#modal-editar-guardar")) guardarEdicion();
  });
  modal.addEventListener("change", (evento) => {
    const select = evento.target.closest("select[data-otro]");
    if (!select || !modal.contains(select)) return;
    const raiz = select.closest(".dispositivo-item") || modal;
    const caja = raiz.querySelector(`[data-caja="${select.dataset.otro}"]`);
    if (!caja) return;
    const mostrar = select.value === "__otro__";
    caja.classList.toggle("d-none", !mostrar);
    if (!mostrar) caja.querySelector("input").value = "";
  });
  modal.addEventListener("paste", (evento) => {
    const campo = evento.target.closest(".inp-mac, .inp-mac-wifi, .inp-mac-eth");
    if (!campo || !modal.contains(campo)) return;
    setTimeout(() => {
      if (campo.classList.contains("inp-mac")) aplicarMacPegada(campo.closest(".dispositivo-item"));
      else normalizarMacSola(campo);
    }, 0);
  });
  modal.addEventListener("focusout", (evento) => {
    const campo = evento.target.closest(".inp-mac, .inp-mac-wifi, .inp-mac-eth");
    if (!campo || !modal.contains(campo)) return;
    if (campo.classList.contains("inp-mac")) aplicarMacPegada(campo.closest(".dispositivo-item"));
    else normalizarMacSola(campo);
  });
  return modal;
}

function renumerarEquiposModal(modal) {
  const items = [...modal.querySelectorAll(".dispositivo-item")];
  items.forEach((item, i) => {
    item.querySelector(".dispositivo-titulo").textContent = items.length > 1 ? `Dispositivo ${i + 1}` : "Dispositivo";
    item.querySelector("[data-quitar-equipo]").classList.toggle("d-none", items.length === 1);
  });
}

function agregarEquipoModal(modal) {
  const lista = modal.querySelector("[data-lista-equipos]");
  const copia = lista.querySelector(".dispositivo-item").cloneNode(true);
  copia.querySelectorAll("input").forEach((input) => { input.value = ""; });
  copia.querySelectorAll("select").forEach((select) => { select.value = ""; });
  copia.querySelector("[data-caja='dispositivo']").classList.add("d-none");
  lista.appendChild(copia);
  renumerarEquiposModal(modal);
  copia.querySelector("[data-select='dispositivo']").focus();
}

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

function ponerMacs(item, mac, wifi, eth) {
  const partes = macsEnTexto(mac);
  const wifiLimpia = macsEnTexto(wifi)[0] || String(wifi || "").trim() || partes[0] || "";
  const ethLimpia = macsEnTexto(eth)[0] || String(eth || "").trim() || partes[1] || "";
  item.querySelector(".inp-mac-wifi").value = wifiLimpia;
  item.querySelector(".inp-mac-eth").value = ethLimpia;
  const juntas = macsEnTexto(wifiLimpia)[0] && macsEnTexto(ethLimpia)[0]
    ? `${macsEnTexto(wifiLimpia)[0]}${macsEnTexto(ethLimpia)[0]}`
    : "";
  item.querySelector(".inp-mac").value = juntas || String(mac || "").trim() || wifiLimpia || ethLimpia;
}

function bloqueDispositivo() {
  return `
    <div class="dispositivo-item mb-3" data-equipo="principal">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small text-muted dispositivo-titulo">Dispositivo</span>
        <button type="button" class="btn btn-link btn-sm text-danger p-0 d-none" data-quitar-equipo>Quitar</button>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-md-5">
          <label class="form-label small mb-1">Dispositivo</label>
          <select class="form-select" data-select="dispositivo" data-otro="dispositivo"></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">Estado</label>
          <select class="form-select" data-select="estado"></select>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">Caja N°</label>
          <input type="text" class="form-control inp-caja">
        </div>
      </div>
      <div class="row g-2 mb-2 d-none" data-caja="dispositivo">
        <div class="col-md-4">
          <label class="form-label small mb-1">Otro dispositivo</label>
          <input type="text" class="form-control" data-otro-dispositivo>
        </div>
      </div>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-1">MAC</label>
          <input type="text" class="form-control font-mono inp-mac" placeholder="Pegá las dos MAC" autocomplete="off">
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">MAC WiFi</label>
          <input type="text" class="form-control font-mono inp-mac-wifi" placeholder="AABBCCDDEEFF" autocomplete="off">
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">MAC Ethernet</label>
          <input type="text" class="form-control font-mono inp-mac-eth" placeholder="AABBCCDDEEFF" autocomplete="off">
        </div>
      </div>
    </div>`;
}

function valorCatalogo(raiz, nombre) {
  const select = raiz.querySelector(`[data-select="${nombre}"]`);
  if (!select) return "";
  if (select.value !== "__otro__") return select.value.trim();
  const input = raiz.querySelector(`[data-caja="${nombre}"] input`);
  return input ? input.value.trim() : "";
}

function otroVacio(raiz, nombre) {
  const select = raiz.querySelector(`[data-select="${nombre}"]`);
  return Boolean(select && select.value === "__otro__" && !valorCatalogo(raiz, nombre));
}

function leerEquipo(item) {
  if (item.classList.contains("d-none")) {
    return { dispositivo: "", estado: "", caja: "", mac: "", mac_wifi: "", mac_eth: "" };
  }
  return {
    dispositivo: valorCatalogo(item, "dispositivo"),
    estado: item.querySelector("[data-select='estado']")?.value.trim() || "",
    caja: item.querySelector(".inp-caja")?.value.trim() || "",
    mac: item.querySelector(".inp-mac").value.trim(),
    mac_wifi: item.querySelector(".inp-mac-wifi").value.trim(),
    mac_eth: item.querySelector(".inp-mac-eth").value.trim(),
  };
}

function htmlFormulario(tipo) {
  const egreso = tipo === "egreso";
  return `
    <div class="seccion">
      <h2 class="h6 mb-3">Identificación</h2>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-1">Razón social</label>
          <select class="form-select" data-select="razon"></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">Nueva razón social</label>
          <input type="text" class="form-control" data-campo="razsocial_agreg" placeholder="Si no está en la lista">
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">Contacto</label>
          <input type="text" class="form-control" data-campo="contacto" placeholder="${egreso ? "Quien retira" : "Quien deja o retira"}">
        </div>
      </div>
    </div>
    <div class="seccion">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h6 mb-0">Dispositivos</h2>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-agregar-equipo>Agregar otro dispositivo</button>
      </div>
      <div data-lista-equipos>${bloqueDispositivo()}</div>
    </div>
    <div class="seccion">
      <h2 class="h6 mb-3">Seguimiento</h2>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label small mb-1">Correo/transporte</label>
          <select class="form-select" data-select="correo" data-otro="correo"></select>
        </div>
        <div class="col-md-6">
          <label class="form-label small mb-1">Nº Seguimiento</label>
          <input type="text" class="form-control" data-campo="seguimiento">
        </div>
        ${egreso ? `
          <div class="col-md-6">
            <label class="form-label small mb-1">Envío / retiro</label>
            <select class="form-select" data-select="envio" data-otro="envio"></select>
          </div>` : ""}
        <div class="col-md-6 d-none" data-caja="correo">
          <label class="form-label small mb-1">Otro correo/transporte</label>
          <input type="text" class="form-control">
        </div>
        ${egreso ? `
          <div class="col-md-6 d-none" data-caja="envio">
            <label class="form-label small mb-1">Otro envío / retiro</label>
            <input type="text" class="form-control">
          </div>` : ""}
      </div>
    </div>
    <div class="seccion">
      <h2 class="h6 mb-3">${egreso ? "Contexto del egreso" : "Contexto del ingreso"}</h2>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label small mb-1">${egreso ? "Observaciones — cómo salió" : "Observaciones — cómo llegó"}</label>
          <textarea class="form-control" rows="2" data-campo="observacion" placeholder="Estado del embalaje, transporte, condición general"></textarea>
        </div>
        <div class="col-md-6">
          <label class="form-label small mb-1">${egreso ? "Motivo del egreso" : "Motivo por el que lo trajeron"}</label>
          <textarea class="form-control" rows="2" data-campo="motivo" placeholder="${egreso ? "Venta, garantía, devolución, envío a reparar..." : "Falla reportada, solicitud de actualización, devolución..."}"></textarea>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">Instancia/gestión</label>
          <select class="form-select" data-select="instancia"></select>
        </div>
      </div>
    </div>
    <div class="seccion">
      <h2 class="h6 mb-3">${egreso ? "Datos de la salida" : "Datos de la recepción"}</h2>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label small mb-1">${egreso ? "Depósito origen" : "Depósito destino"}</label>
          <select class="form-select" data-select="deposito"></select>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">${egreso ? "Fecha de salida" : "Fecha de llegada"}</label>
          <input type="date" class="form-control" data-campo="fecha">
          <div class="form-text d-none" data-nota-fecha></div>
        </div>
      </div>
    </div>`;
}

function pintarFormulario(modal, tipo, fila, data) {
  const campos = document.getElementById("modal-editar-campos");
  campos.innerHTML = htmlFormulario(tipo);
  const razones = listaConActual(data.razones, fila.razon_social)
    .sort((a, b) => a.localeCompare(b, "es"));
  asignarSelect(modal.querySelector("[data-select='razon']"), razones, fila.razon_social);
  modal.querySelector("[data-campo='razsocial_agreg']").value = fila.razsocial_agreg || "";
  modal.querySelector("[data-campo='contacto']").value = fila.contacto || "";

  const principal = modal.querySelector("[data-equipo='principal']");
  asignarSelect(principal.querySelector("[data-select='dispositivo']"), data.dispositivos, fila.dispositivo, {
    otro: true,
    caja: principal.querySelector("[data-caja='dispositivo']"),
    input: principal.querySelector("[data-otro-dispositivo]"),
  });
  asignarSelect(principal.querySelector("[data-select='estado']"), data.estados, fila.estado);
  principal.querySelector(".inp-caja").value = fila.caja || "";
  ponerMacs(principal, fila.mac, fila.mac_wifi, fila.mac_eth);

  asignarSelect(modal.querySelector("[data-select='correo']"), data.carriers, fila.correo, {
    otro: true,
    caja: modal.querySelector("[data-caja='correo']"),
    input: modal.querySelector("[data-caja='correo'] input"),
  });
  modal.querySelector("[data-campo='seguimiento']").value = fila.seguimiento || "";
  if (tipo === "egreso") {
    const envios = data.envios && data.envios.length ? data.envios : ["Envío", "Retiro"];
    asignarSelect(modal.querySelector("[data-select='envio']"), envios, fila.envio_retiro, {
      otro: true,
      caja: modal.querySelector("[data-caja='envio']"),
      input: modal.querySelector("[data-caja='envio'] input"),
    });
  }
  modal.querySelector("[data-campo='observacion']").value = fila.observacion || "";
  modal.querySelector("[data-campo='motivo']").value = fila.motivo || "";
  const instancias = data.instancias && data.instancias.length ? data.instancias : ["PENDIENTE", "EN PROCESO", "FINALIZADO"];
  asignarSelect(modal.querySelector("[data-select='instancia']"), instancias, fila.instancia_gestion);
  asignarSelect(modal.querySelector("[data-select='deposito']"), data.depositos, fila.deposito);
  const fecha = String(fila.fecha || "").slice(0, 10);
  modal.querySelector("[data-campo='fecha']").value = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "";
  if (fila.fecha_texto) {
    const nota = modal.querySelector("[data-nota-fecha]");
    nota.textContent = `En la grilla se ve ${fila.fecha_texto}. Si cambiás la fecha, la grilla pasa a mostrar esa fecha.`;
    nota.classList.remove("d-none");
  }
}

function mostrarAviso(texto) {
  const aviso = document.getElementById("modal-editar-error");
  aviso.textContent = texto || "";
  aviso.classList.toggle("d-none", !texto);
}

async function guardarEdicion() {
  const actual = edicionActual;
  if (!actual) return;
  const modal = document.getElementById("modal-editar-planilla");
  const boton = document.getElementById("modal-editar-guardar");
  const items = [...modal.querySelectorAll(".dispositivo-item")];
  mostrarAviso("");
  if (items.some((item) => otroVacio(item, "dispositivo")) || otroVacio(modal, "correo")
    || (actual.tipo === "egreso" && otroVacio(modal, "envio"))) {
    mostrarAviso("Completá el texto de Otro.");
    return;
  }
  const dispositivos = items.map(leerEquipo).filter((equipo, indice) => indice === 0 || equipo.dispositivo || equipo.mac || equipo.mac_wifi || equipo.mac_eth || equipo.estado || equipo.caja);
  const equipo = dispositivos[0];
  const razonLista = valorCatalogo(modal, "razon").replace(/\s+/g, " ");
  const razonNueva = modal.querySelector("[data-campo='razsocial_agreg']").value.trim().replace(/\s+/g, " ");
  const razon = razonLista || razonNueva;
  const hayEquipo = dispositivos.some((item) => item.dispositivo || item.mac || item.mac_wifi || item.mac_eth);
  if (!razon && !hayEquipo) {
    mostrarAviso("Completá al menos la razón social, el dispositivo o una MAC.");
    return;
  }
  const fechaElegida = modal.querySelector("[data-campo='fecha']").value;
  const fechaOriginal = String(actual.fila.fecha || "").slice(0, 10);
  const cuerpo = {
    tipo: actual.tipo,
    id: actual.fila.id,
    fecha: fechaElegida && fechaElegida !== fechaOriginal ? fechaElegida : "",
    razon_social: razon,
    razsocial_agreg: razonNueva,
    contacto: modal.querySelector("[data-campo='contacto']").value.trim(),
    dispositivo: equipo.dispositivo,
    estado: equipo.estado,
    caja: equipo.caja,
    mac: equipo.mac,
    mac_wifi: equipo.mac_wifi,
    mac_eth: equipo.mac_eth,
    dispositivos,
    correo: valorCatalogo(modal, "correo"),
    seguimiento: modal.querySelector("[data-campo='seguimiento']").value.trim(),
    observacion: modal.querySelector("[data-campo='observacion']").value.trim(),
    motivo: modal.querySelector("[data-campo='motivo']").value.trim(),
    instancia_gestion: valorCatalogo(modal, "instancia"),
    deposito: valorCatalogo(modal, "deposito"),
  };
  if (actual.tipo === "egreso") cuerpo.envio_retiro = valorCatalogo(modal, "envio");
  boton.disabled = true;
  try {
    const resultado = await apiFetch("soporte-planilla", { method: "PUT", body: cuerpo });
    catalogoPlanilla = null;
    bootstrap.Modal.getOrCreateInstance(modal).hide();
    const equipos = (resultado && resultado.acompañados) || 0;
    const agregados = (resultado && resultado.agregados) || 0;
    const omitidos = (resultado && resultado.omitidos) || 0;
    const partes = ["Cambios guardados."];
    if (agregados) partes.push(agregados === 1 ? "Se agregó 1 fila nueva con el mismo cliente." : `Se agregaron ${agregados} filas nuevas con el mismo cliente.`);
    if (omitidos) partes.push(omitidos === 1 ? "1 equipo ya estaba cargado y no se duplicó." : `${omitidos} equipos ya estaban cargados y no se duplicaron.`);
    if (equipos) partes.push(`El seguimiento quedó igual en ${equipos + 1} equipos de este cliente.`);
    mostrarExito("msg-exito", partes.join(" "));
    await actual.alGuardar();
  } catch (error) {
    mostrarAviso(error.message);
  } finally {
    boton.disabled = false;
  }
}

async function abrirEdicionPlanilla({ tipo, fila, filas, alGuardar }) {
  const modal = asegurarModalPlanilla();
  const mio = ++ticketEdicion;
  edicionActual = { tipo, fila, alGuardar };
  const cliente = clienteDePlanilla(fila);
  const otras = cliente
    ? filas.filter((otra) => otra.id !== fila.id
      && clienteDePlanilla(otra) === cliente
      && String(otra.fecha || "") === String(fila.fecha || "")
      && String(otra.seguimiento || "") === String(fila.seguimiento || ""))
    : [];
  document.getElementById("modal-editar-titulo").textContent = tipo === "egreso" ? "Editar egreso" : "Editar ingreso";
  const avisoEquipos = otras.length
    ? `Hay ${otras.length} equipo${otras.length === 1 ? "" : "s"} más de este cliente con la misma fecha y el mismo seguimiento. Si cambiás el seguimiento, el correo, el envío o la observación de la encomienda, queda igual en todos.`
    : "Los cambios se guardan en este equipo.";
  document.getElementById("modal-editar-aviso").textContent = `${avisoEquipos} Si agregás otro dispositivo, queda en una fila nueva con el mismo cliente.`;
  mostrarAviso("");
  document.getElementById("modal-editar-campos").innerHTML = `<p class="text-muted mb-0">Cargando opciones…</p>`;
  document.getElementById("modal-editar-guardar").disabled = true;
  bootstrap.Modal.getOrCreateInstance(modal).show();
  let data;
  try {
    if (!catalogoPlanilla) catalogoPlanilla = await apiFetch("soporte-planilla/opciones");
    data = catalogoPlanilla;
  } catch (error) {
    data = { razones: [], dispositivos: [], estados: [], carriers: [], instancias: [], envios: [], depositos: [] };
  }
  if (mio !== ticketEdicion) return;
  pintarFormulario(modal, tipo, fila, data);
  document.getElementById("modal-editar-guardar").disabled = false;
}
