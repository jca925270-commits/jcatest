const API = "planilla-stock";
const PESTANAS = [
  {
    id: "ingreso_ebd", titulo: "Ingreso EBD Oficina", familia: "EBD",
    columnas: [
      ["fecha_llegada", "Fecha de llegada", "date"],
      ["fecha_carga", "Fecha de carga", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_d3", titulo: "Ingreso D3 Oficina", familia: "D3",
    columnas: [
      ["fecha_llegada", "Fecha de llegada", "date"],
      ["fecha_carga", "Fecha de carga", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_ebd_reparado", titulo: "Ingreso EBD REPARADO (Testeados)", familia: "EBD_REP",
    columnas: [
      ["fecha_llegada", "Fecha de llegada", "date"],
      ["fecha_carga", "Fecha de carga", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Reparado n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_pantalla", titulo: "Ingreso Pantallas Colectivo (24 Pulgadas) Oficina", familia: "PANTALLA",
    columnas: [
      ["fecha_llegada", "Fecha de llegada", "date"],
      ["fecha_carga", "Fecha de carga", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_ebd_interno", titulo: "Ingreso EBD uso INTERNO", familia: "EBD_INT",
    columnas: [
      ["cliente", "Cliente", "text"],
      ["fecha_carga", "Fecha de carga", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
];

let filas = [filaVacia()];

function hoyArgentina() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function filaVacia() {
  const hoy = hoyArgentina();
  return { cliente: "", fecha_llegada: hoy, fecha_carga: hoy, wifi: "", eth: "", lote: "", caja: "", numero: "" };
}

function pestanaActual() {
  const id = document.getElementById("pestana").value;
  return PESTANAS.find((item) => item.id === id) || PESTANAS[0];
}

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function macsDe(valor) {
  return window.macsEnTexto ? macsEnTexto(valor) : [];
}

function marcarMenu() {
  const enlace = document.querySelector('a[href="ingresar-mac.html"]');
  if (!enlace) return;
  enlace.classList.add("active");
  let nodo = enlace.parentElement;
  while (nodo) {
    if (nodo.tagName === "DETAILS") nodo.open = true;
    nodo = nodo.parentElement;
  }
}

function pintar() {
  const pestana = pestanaActual();
  document.getElementById("equipos").innerHTML = filas.map((fila, indice) => {
    const fechas = pestana.columnas.filter(([clave]) => !["wifi", "eth", "lote", "caja", "numero"].includes(clave));
    const chicos = pestana.columnas.filter(([clave]) => clave === "lote" || clave === "caja" || clave === "numero");
    const macs = pestana.columnas.filter(([clave]) => clave === "wifi" || clave === "eth");
    return `
      <div class="border-top pt-3 mt-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h2 class="h6 mb-0">Equipo ${indice + 1}</h2>
          ${filas.length > 1 ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-quitar="${indice}">Quitar</button>` : ""}
        </div>
        <div class="d-flex flex-wrap align-items-end gap-2">
          ${[...fechas, ...chicos].map(([clave, etiqueta, tipo]) => campo(indice, clave, etiqueta, tipo, fila[clave] || "", medidaCampo(clave), tipo === "date" || clave === "lote" || clave === "caja" || clave === "numero")).join("")}
        </div>
        <div class="row g-2 align-items-end mt-1">
          ${macs.map(([clave, etiqueta, tipo]) => campo(indice, clave, etiqueta, tipo, fila[clave] || "", "col-6")).join("")}
        </div>
      </div>`;
  }).join("");
}

function medidaCampo(clave) {
  if (clave === "wifi" || clave === "eth") return "col-6";
  if (clave === "cliente") return "flex:1 1 14rem;min-width:10rem";
  if (String(clave).startsWith("fecha")) return "flex:0 0 11rem;width:11rem;max-width:11rem";
  if (clave === "numero") return "flex:0 0 8rem;width:8rem;max-width:8rem";
  return "flex:1 1 8rem;min-width:7rem";
}

function campo(indice, clave, etiqueta, tipo, valor, ancho, chico) {
  const extra = tipo === "date"
    ? 'type="date" style="min-width:0;width:100%"'
    : `type="text" maxlength="${clave === "lote" ? 80 : clave === "cliente" ? 255 : clave === "numero" ? 20 : 40}"${clave === "numero" ? ' inputmode="numeric"' : ""}`;
  const clase = `${tipo === "mac" ? " font-monospace" : ""}${chico ? " form-control-sm" : ""}`;
  const pista = clave === "wifi" || clave === "eth"
    ? ' placeholder="Escaneá o escribí la MAC"'
    : clave === "numero"
      ? ' placeholder="Opcional"'
      : "";
  const caja = String(ancho).startsWith("flex:") ? ` style="${ancho}"` : ` class="${ancho}"`;
  return `<div${caja}>
    <label class="form-label small mb-1" for="eq-${indice}-${clave}">${escapar(etiqueta)}</label>
    <input class="form-control${clase}" id="eq-${indice}-${clave}" data-clave="${clave}" ${extra}${pista} value="${escapar(valor)}" autocomplete="off">
  </div>`;
}

function leerFila(indice) {
  const fila = { ...filas[indice] };
  const pestana = pestanaActual();
  for (const [clave] of pestana.columnas) {
    const input = document.getElementById(`eq-${indice}-${clave}`);
    if (input) fila[clave] = input.value;
  }
  return fila;
}

function guardarVista() {
  filas = filas.map((_, indice) => leerFila(indice));
}

let saltoWifiEn = 0;

function indiceDeCampo(campo) {
  return Number(String(campo.id || "").split("-")[1]);
}

function enfocarEth(indice) {
  const eth = document.getElementById(`eq-${indice}-eth`);
  if (!eth) return;
  saltoWifiEn = Date.now();
  eth.focus();
}

function agregarEquipo(desde) {
  guardarVista();
  const origen = filas[Number.isInteger(desde) ? desde : filas.length - 1] || filaVacia();
  const nueva = filaVacia();
  if (origen.fecha_llegada) nueva.fecha_llegada = origen.fecha_llegada;
  if (origen.fecha_carga) nueva.fecha_carga = origen.fecha_carga;
  nueva.lote = origen.lote || "";
  nueva.caja = origen.caja || "";
  nueva.numero = "";
  filas.push(nueva);
  pintar();
  const campo = document.getElementById(`eq-${filas.length - 1}-wifi`);
  if (campo) campo.focus();
}

document.getElementById("pestana").innerHTML = PESTANAS
  .map((item) => `<option value="${item.id}">${escapar(item.titulo)}</option>`)
  .join("");

document.getElementById("pestana").addEventListener("change", () => {
  guardarVista();
  pintar();
});

document.getElementById("btn-otro").addEventListener("click", agregarEquipo);

document.getElementById("form-ingreso").addEventListener("keydown", (evento) => {
  if (evento.key !== "Enter") return;
  const campo = evento.target.closest("#equipos input");
  if (!campo) return;
  evento.preventDefault();
  const indice = indiceDeCampo(campo);
  if (campo.dataset.clave === "wifi") {
    const partes = macsDe(campo.value);
    if (partes.length >= 2) {
      const eth = document.getElementById(`eq-${indice}-eth`);
      campo.value = partes[0];
      if (eth && !eth.value) eth.value = partes[1];
    }
    enfocarEth(indice);
    return;
  }
  if (campo.dataset.clave === "eth" && Date.now() - saltoWifiEn < 500) return;
  agregarEquipo(indice);
});

document.getElementById("equipos").addEventListener("input", (evento) => {
  const campo = evento.target;
  if (campo.dataset.clave !== "wifi") return;
  const partes = macsDe(campo.value);
  const completa = Boolean(partes[0] && partes[0].length === 12);
  if (partes.length >= 2) {
    const eth = document.getElementById(`eq-${indiceDeCampo(campo)}-eth`);
    campo.value = partes[0];
    if (eth && !eth.value) eth.value = partes[1];
  }
  if (completa && campo.dataset.completa !== "1" && document.activeElement === campo) {
    enfocarEth(indiceDeCampo(campo));
  }
  campo.dataset.completa = completa ? "1" : "0";
});

document.getElementById("equipos").addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-quitar]");
  if (!boton) return;
  guardarVista();
  filas.splice(Number(boton.dataset.quitar), 1);
  pintar();
});

document.getElementById("equipos").addEventListener("change", (evento) => {
  if (evento.target.dataset.clave !== "wifi") return;
  const partes = macsDe(evento.target.value);
  if (partes.length < 2) return;
  const indice = Number(evento.target.id.split("-")[1]);
  const eth = document.getElementById(`eq-${indice}-eth`);
  evento.target.value = partes[0];
  if (eth && !eth.value) eth.value = partes[1];
});

document.getElementById("form-ingreso").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  document.getElementById("msg-ok").classList.add("d-none");
  guardarVista();
  const pestana = pestanaActual();
  const macs = [];
  for (const [indice, fila] of filas.entries()) {
    const partes = macsDe(fila.wifi);
    const wifi = partes[0] || "";
    const ethPartes = macsDe(fila.eth);
    const eth = ethPartes[0] || partes[1] || "";
    if (!wifi) {
      mostrarError("msg-error", `El equipo ${indice + 1} necesita la MAC WIFI.`);
      return;
    }
    if (fila.eth && !eth) {
      mostrarError("msg-error", `La MAC ETH del equipo ${indice + 1} está incompleta.`);
      return;
    }
    if (pestana.columnas.some(([clave]) => clave === "fecha_carga") && !fila.fecha_carga) {
      mostrarError("msg-error", `El equipo ${indice + 1} necesita la fecha de carga.`);
      return;
    }
    if (pestana.columnas.some(([clave]) => clave === "fecha_llegada") && !fila.fecha_llegada) {
      mostrarError("msg-error", `El equipo ${indice + 1} necesita la fecha de llegada.`);
      return;
    }
    macs.push({
      operacion: "ingreso",
      familia: pestana.familia,
      cliente: fila.cliente || null,
      fecha_llegada: pestana.columnas.some(([clave]) => clave === "fecha_llegada") ? fila.fecha_llegada : null,
      fecha_carga: fila.fecha_carga || null,
      wifi,
      eth: eth && eth !== wifi ? eth : "",
      lote: fila.lote || null,
      caja: fila.caja || null,
      numero: fila.numero || null,
    });
  }
  const boton = document.getElementById("btn-guardar");
  boton.disabled = true;
  try {
    const respuesta = await apiFetch(API, {
      method: "POST",
      body: {
        pais: "ARGENTINA",
        mac_operacion: "ingreso",
        mac_familia: pestana.familia,
        macs,
      },
    });
    document.getElementById("msg-error").classList.add("d-none");
    const ok = document.getElementById("msg-ok");
    ok.textContent = respuesta.aviso || "Quedó en la planilla de MAC y en MySQL.";
    ok.classList.remove("d-none");
    filas = [filaVacia()];
    pintar();
  } catch (error) {
    mostrarError("msg-error", error.message);
  } finally {
    boton.disabled = false;
  }
});

marcarMenu();
pintar();
if (window.guardiaLista) window.guardiaLista.then(marcarMenu);
