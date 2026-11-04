const API = "planilla-stock";
let catalogo = { categorias: [], estados: [], razones: [] };
const PESTANAS = [
  {
    id: "ingreso_ebd", titulo: "Ingreso EBD Oficina", operacion: "ingreso", familia: "EBD",
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
    id: "egreso_ebd", titulo: "Egreso EBD 2.0", operacion: "egreso", familia: "EBD",
    columnas: [
      ["cliente", "Cliente", "cliente"],
      ["fecha_despacho", "Fecha de despacho", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_d3", titulo: "Ingreso D3 Oficina", operacion: "ingreso", familia: "D3",
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
    id: "egreso_d3", titulo: "Egreso D3 2.0 (venta/comodato desde Comercial)", operacion: "egreso", familia: "D3",
    columnas: [
      ["cliente", "Cliente", "cliente"],
      ["fecha_despacho", "Fecha de despacho", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_ebd_reparado", titulo: "Ingreso EBD REPARADO (Testeados)", operacion: "ingreso", familia: "EBD_REP",
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
    id: "egreso_ebd_reparado", titulo: "Egreso EBD REPARADO (Venta/Migracion/Garantia)", operacion: "egreso", familia: "EBD_REP",
    columnas: [
      ["cliente", "Cliente", "cliente"],
      ["fecha_despacho", "Fecha de despacho", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Reparado n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_pantalla", titulo: "Ingreso Pantallas Colectivo (24 Pulgadas) Oficina", operacion: "ingreso", familia: "PANTALLA",
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
    id: "egreso_pantalla", titulo: "Egreso Pantallas Colectivo (24 Pulgadas) Oficina", operacion: "egreso", familia: "PANTALLA",
    columnas: [
      ["cliente", "Cliente", "cliente"],
      ["fecha_despacho", "Fecha de despacho", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "ingreso_ebd_interno", titulo: "Ingreso EBD uso INTERNO", operacion: "ingreso", familia: "EBD_INT",
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
    id: "egreso_ebd_interno", titulo: "Egreso EBD uso INTERNO", operacion: "egreso", familia: "EBD_INT",
    columnas: [
      ["cliente", "Cliente", "cliente"],
      ["fecha_despacho", "Fecha de despacho", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
  {
    id: "devolucion_d3", titulo: "Devo D3 Oficina", operacion: "devolucion", familia: "D3",
    columnas: [
      ["fecha_despacho", "Fecha de Devolucion", "date"],
      ["wifi", "MAC WIFI", "mac"],
      ["eth", "MAC ETH", "mac"],
      ["lote", "Lote", "text"],
      ["caja", "Caja n°", "text"],
      ["numero", "Número de equipo", "text"],
    ],
  },
];
let pestanaId = "egreso_ebd";
let filasMac = [filaVacia()];
let busquedaMac = 0;

function filaVacia() {
  return { cliente: "", fecha_llegada: "", fecha_carga: "", fecha_despacho: "", wifi: "", eth: "", lote: "", caja: "", numero: "" };
}

function pestanaActual() {
  return PESTANAS.find((item) => item.id === pestanaId) || PESTANAS[0];
}

function pestanaFamilia(operacion, familia) {
  return PESTANAS.find((item) => item.operacion === operacion && item.familia === familia) || PESTANAS[1];
}

function cantidadPedida(id) {
  const numero = parseInt(document.getElementById(id).value, 10);
  if (!Number.isInteger(numero) || numero < 0) return 0;
  return Math.min(numero, 30);
}

const CONTADORES = [
  "cant-ing-ebd", "cant-ing-d3", "cant-ing-rep", "cant-ing-pan", "cant-ing-int",
  "cant-ebd", "cant-d3", "cant-rep", "cant-pan", "cant-int",
];

function modoGuiado() {
  return CONTADORES.reduce((suma, id) => suma + cantidadPedida(id), 0) > 0;
}

function nombreFamilia(familia) {
  if (familia === "EBD_REP") return "EBD reparado";
  if (familia === "EBD_INT") return "EBD uso interno";
  if (familia === "PANTALLA") return "pantalla";
  return familia || "ese tipo";
}

function anchoColumna(clave) {
  if (clave === "wifi" || clave === "eth") return "col-6";
  if (clave === "lote" || clave === "caja") return "col-6 col-lg-2";
  if (clave === "cliente") return "col-lg-4 col-md-6";
  return "col-lg-3 col-md-4";
}

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function opciones(lista, valor, etiqueta) {
  return lista.map((item) => `<option value="${escapar(valor(item))}">${escapar(etiqueta(item))}</option>`).join("");
}

function categoriaVisible(item) {
  const nombre = String(item.nombre || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  return !nombre.includes("CONTENEDOR") && !nombre.includes("CASA SANTI");
}

function llenarCategorias() {
  const pais = document.getElementById("pais").value;
  const categorias = catalogo.categorias.filter((item) => (
    String(item.pais || "").toUpperCase() === pais && categoriaVisible(item)
  ));
  document.getElementById("categoria").innerHTML = `<option value="">Elegí el dispositivo</option>${
    opciones(categorias, (item) => item.id, (item) => item.nombre)
  }`;
}

function normalizarBusqueda(valor) {
  return String(valor || "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function listaRazones(filtro, indice) {
  const consulta = normalizarBusqueda(filtro);
  const coinciden = (catalogo.razones || [])
    .filter((nombre) => !consulta || normalizarBusqueda(nombre).includes(consulta))
    .slice(0, 12);
  if (!coinciden.length) return `<div class="razon-vacio">No hay clientes con ese nombre</div>`;
  const marca = indice == null ? "" : ` data-cliente-mac="${indice}"`;
  return coinciden.map((nombre) => (
    `<button type="button" class="razon-opcion" data-razon="${escapar(nombre)}"${marca}>${escapar(nombre)}</button>`
  )).join("");
}

function razonElegida() {
  const nueva = document.getElementById("razon-nueva").value.trim();
  return nueva || document.getElementById("razon").value.trim();
}

function mostrarClienteMac() {
  const nombre = razonElegida();
  filasMac.forEach((fila) => { fila.cliente = nombre; });
  document.querySelectorAll("[data-cliente-fijo]").forEach((campo) => { campo.value = nombre; });
}

function elegirRazon(nombre) {
  document.getElementById("razon").value = nombre || "";
  document.getElementById("razon-nueva").value = "";
  document.getElementById("razon-boton").textContent = nombre || "Seleccionar…";
  document.getElementById("razon-panel").classList.add("d-none");
  document.getElementById("razon-boton").setAttribute("aria-expanded", "false");
  mostrarClienteMac();
}

function actualizarAviso2() {
  const aviso = document.getElementById("aviso-2");
  const activo = document.getElementById("marca-2").checked;
  aviso.classList.toggle("d-none", !activo);
  if (!activo) return;
  const categoria = document.getElementById("categoria");
  const nombre = categoria && categoria.selectedOptions[0] ? categoria.selectedOptions[0].textContent : "";
  const cruda = /\bD3\b/i.test(nombre) ? "D3" : /\bEBD\b/i.test(nombre) ? "EBD" : pestanaActual().familia;
  const familia = cruda === "EBD_REP" || cruda === "EBD_INT" ? "EBD" : cruda;
  document.getElementById("texto-2").textContent = `(${familia} con 2.0 Lite)`;
}

function abrirRazones() {
  const panel = document.getElementById("razon-panel");
  const abierta = !panel.classList.contains("d-none");
  panel.classList.toggle("d-none", abierta);
  document.getElementById("razon-boton").setAttribute("aria-expanded", abierta ? "false" : "true");
  if (abierta) return;
  const filtro = document.getElementById("razon-filtro");
  filtro.value = "";
  document.getElementById("razon-lista").innerHTML = listaRazones("");
  filtro.focus();
}

async function cargarOpciones() {
  catalogo = await apiFetch(`${API}/opciones`);
  const lista = opciones(catalogo.estados || [], (item) => item, (item) => item);
  document.getElementById("estado").innerHTML = `<option value="">Elegí el estado</option>${lista}`;
  llenarCategorias();
}

function campoMac(indice, clave, etiqueta, tipo, valor, ancho) {
  const id = `mac-${indice}-${clave}`;
  const medida = ancho || anchoColumna(clave);
  const caja = String(medida).startsWith("flex:") ? ` style="${medida}"` : ` class="${medida}"`;
  if (tipo === "cliente") {
    const nombre = razonElegida();
    return `<div${caja}>
      <label class="form-label small" for="${id}">${escapar(etiqueta)}</label>
      <input class="form-control form-control-sm" id="${id}" data-cliente-fijo value="${escapar(nombre)}" placeholder="La razón social de arriba" readonly tabindex="-1">
    </div>`;
  }
  const extra = tipo === "date"
    ? 'type="date" style="min-width:0;width:100%"'
    : `type="text" maxlength="${clave === "lote" ? 80 : clave === "numero" ? 20 : 40}"${clave === "wifi" || clave === "eth" ? ' placeholder="Últimas 4, o escaneá la MAC"' : ""}${clave === "numero" ? ' inputmode="numeric" placeholder="Buscar N°"' : ""}`;
  const clase = `${tipo === "mac" ? " font-monospace" : ""}${clave === "lote" || clave === "caja" || clave === "numero" || tipo === "date" ? " form-control-sm" : ""}`;
  return `<div${caja}>
    <label class="form-label small" for="${id}">${escapar(etiqueta)}</label>
    <input class="form-control${clase}" id="${id}" data-clave="${clave}" ${extra} value="${escapar(valor)}" autocomplete="off">
  </div>`;
}

function filasDe(operacion, familia, cantidad) {
  const previas = filasMac.filter((fila) => fila.operacion === operacion && fila.familia === familia);
  const fecha = document.getElementById("fecha").value;
  return Array.from({ length: cantidad }, (_, indice) => {
    const previa = previas[indice];
    if (previa) return { ...previa, operacion, familia, cliente: razonElegida() };
    const fila = { ...filaVacia(), operacion, familia, cliente: razonElegida() };
    if (operacion === "ingreso") {
      fila.fecha_llegada = fecha;
      fila.fecha_carga = fecha;
    } else {
      fila.fecha_despacho = fecha;
    }
    return fila;
  });
}

function armarFilas() {
  if (!modoGuiado()) {
    if (filasMac.some((fila) => fila.operacion)) filasMac = [filaVacia()];
    pintarMacForm();
    return;
  }
  filasMac = [
    ...filasDe("ingreso", "EBD", cantidadPedida("cant-ing-ebd")),
    ...filasDe("ingreso", "EBD_INT", cantidadPedida("cant-ing-int")),
    ...filasDe("ingreso", "EBD_REP", cantidadPedida("cant-ing-rep")),
    ...filasDe("ingreso", "PANTALLA", cantidadPedida("cant-ing-pan")),
    ...filasDe("ingreso", "D3", cantidadPedida("cant-ing-d3")),
    ...filasDe("egreso", "EBD", cantidadPedida("cant-ebd")),
    ...filasDe("egreso", "EBD_INT", cantidadPedida("cant-int")),
    ...filasDe("egreso", "EBD_REP", cantidadPedida("cant-rep")),
    ...filasDe("egreso", "PANTALLA", cantidadPedida("cant-pan")),
    ...filasDe("egreso", "D3", cantidadPedida("cant-d3")),
  ];
  pintarMacForm();
}

function familiaDeCategoria() {
  const categoria = (catalogo.categorias || []).find((item) => String(item.id) === document.getElementById("categoria").value);
  if (!categoria) return "";
  const nombre = String(categoria.nombre || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  if (/\bPANTALLA/.test(nombre)) return "PANTALLA";
  if (/INTERNO/.test(nombre) && /\bEBD\b/.test(nombre)) return "EBD_INT";
  if (/REPARAD/.test(nombre) && /\bEBD\b/.test(nombre)) return "EBD_REP";
  if (/\bD3\b/.test(nombre)) return "D3";
  if (/\bEBD\b/.test(nombre)) return "EBD";
  return "";
}

function copiarCantidad(origen, operacion) {
  const familia = familiaDeCategoria();
  const numero = parseInt(document.getElementById(origen).value, 10);
  const cantidad = Number.isInteger(numero) && numero > 0 ? Math.min(numero, 30) : 0;
  const destinos = {
    "EBD|ingreso": "cant-ing-ebd",
    "EBD_INT|ingreso": "cant-ing-int",
    "EBD_REP|ingreso": "cant-ing-rep",
    "PANTALLA|ingreso": "cant-ing-pan",
    "D3|ingreso": "cant-ing-d3",
    "EBD|egreso": "cant-ebd",
    "EBD_INT|egreso": "cant-int",
    "EBD_REP|egreso": "cant-rep",
    "PANTALLA|egreso": "cant-pan",
    "D3|egreso": "cant-d3",
  };
  for (const [clave, id] of Object.entries(destinos)) {
    if (!clave.endsWith(`|${operacion}`)) continue;
    document.getElementById(id).value = clave === `${familia}|${operacion}` ? String(cantidad) : "0";
  }
  armarFilas();
  avisoMac();
}

function avisoMac() {
  const aviso = document.getElementById("aviso-mac");
  if (!aviso) return;
  const familia = familiaDeCategoria();
  const hojas = {
    EBD: ["Ingreso EBD Oficina", "Egreso EBD 2.0"],
    EBD_REP: ["Ingreso EBD REPARADO (Testeados)", "Egreso EBD REPARADO (Venta/Migracion/Garantia)"],
    PANTALLA: ["Ingreso Pantallas Colectivo (24 Pulgadas) Oficina", "Egreso Pantallas Colectivo (24 Pulgadas) Oficina"],
    EBD_INT: ["Ingreso EBD uso INTERNO", "Egreso EBD uso INTERNO"],
    D3: ["Ingreso D3 Oficina", "Egreso D3 2.0"],
  };
  if (!familia || !hojas[familia]) {
    aviso.textContent = document.getElementById("categoria").value
      ? "Este dispositivo se registra solo en el stock."
      : "";
    return;
  }
  const [ingresoHoja, egresoHoja] = hojas[familia];
  const ingreso = parseInt(document.getElementById("ingreso").value, 10);
  const egreso = parseInt(document.getElementById("egreso").value, 10);
  const partes = [];
  if (Number.isInteger(ingreso) && ingreso > 0) partes.push(`${Math.min(ingreso, 30)} en ${ingresoHoja}`);
  if (Number.isInteger(egreso) && egreso > 0) partes.push(`${Math.min(egreso, 30)} en ${egresoHoja}`);
  aviso.textContent = partes.length
    ? `Esos equipos se cargan en ${partes.join(" y ")}.`
    : `Con una cantidad de ingreso se cargan en ${ingresoHoja}. Con una de egreso, en ${egresoHoja}.`;
}

function pintarMacForm() {
  if (modoGuiado()) {
    pintarLugares();
    return;
  }
  document.getElementById("mac-formulario").innerHTML = "";
}

function pintarLugares() {
  const caja = document.getElementById("mac-formulario");
  const grupos = [
    ["ingreso", "EBD", "Ingreso EBD"],
    ["ingreso", "EBD_INT", "Ingreso EBD uso interno"],
    ["ingreso", "EBD_REP", "Ingreso EBD reparado"],
    ["ingreso", "PANTALLA", "Ingreso pantallas"],
    ["ingreso", "D3", "Ingreso D3"],
    ["egreso", "EBD", "Egreso EBD"],
    ["egreso", "EBD_INT", "Egreso EBD uso interno"],
    ["egreso", "EBD_REP", "Egreso EBD reparado"],
    ["egreso", "PANTALLA", "Egreso pantallas"],
    ["egreso", "D3", "Egreso D3"],
  ];
  caja.innerHTML = grupos.map(([operacion, familia, titulo]) => {
    const filas = filasMac.map((fila, indice) => ({ fila, indice }))
      .filter((item) => item.fila.operacion === operacion && item.fila.familia === familia);
    if (!filas.length) return "";
    const pestana = pestanaFamilia(operacion, familia);
    const tituloHoja = pestana.titulo || titulo;
    const ayuda = operacion === "egreso" ? "Buscá una MAC libre o el número de equipo." : "Buscá o escaneá la MAC, o el número de equipo.";
    return `<h3 class="h6 mt-3 mb-2">${escapar(tituloHoja)}</h3>${filas.map(({ fila, indice }, orden) => {
      const fechas = pestana.columnas.filter(([clave]) => !["wifi", "eth", "lote", "caja", "numero"].includes(clave));
      const chicos = pestana.columnas.filter(([clave]) => clave === "lote" || clave === "caja" || clave === "numero");
      const macs = pestana.columnas.filter(([clave]) => clave === "wifi" || clave === "eth");
      const linea = (lista, medida) => lista.map(([clave, etiqueta, tipo]) => campoMac(indice, clave, etiqueta, tipo, fila[clave] || "", medida(clave))).join("");
      const medidaArriba = (clave) => {
        if (clave === "cliente") return "flex:1 1 14rem;min-width:10rem";
        if (String(clave).startsWith("fecha")) return "flex:0 0 11rem;width:11rem;max-width:11rem";
        if (clave === "numero") return "flex:0 0 8rem;width:8rem;max-width:8rem";
        return "flex:1 1 8rem;min-width:7rem";
      };
      return `
      <p class="small text-muted mb-1">${escapar(tituloHoja)} ${orden + 1} de ${filas.length}. ${ayuda}</p>
      <div data-fila="${indice}">
        <div class="d-flex flex-wrap align-items-end gap-2">${linea([...fechas, ...chicos], medidaArriba)}</div>
        <div class="row g-2 align-items-end mt-1">${linea(macs, () => "col-6")}</div>
      </div>
      <div class="mac-resultados mb-3" data-resultados="${indice}"></div>`;
    }).join("")}`;
  }).join("");
}

function cajaSinEquipo(valor) {
  return String(valor || "")
    .replace(/\(?\s*equipo\s*\(?\s*\d+\s*\)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–]+|[-–]+$/g, "");
}

function numeroEnCaja(valor) {
  const hallado = /equipo\s*\(?\s*(\d+)/i.exec(String(valor || ""));
  return hallado ? hallado[1] : "";
}

function leerMacs() {
  const pestana = pestanaActual();
  return filasMac
    .filter((fila) => String(fila.wifi || fila.eth || "").replace(/[^0-9A-Fa-f]/g, "").length >= 12)
    .map((fila) => ({ ...fila, familia: fila.familia || pestana.familia, operacion: fila.operacion || pestana.operacion }));
}

function fechaVisible(fecha) {
  const coincide = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return coincide ? `${coincide[3]}/${coincide[2]}/${coincide[1]}` : "";
}

function textoHallazgo(item) {
  const estado = item.libre === false
    ? `Ocupada por ${item.ocupada_por || "un cliente"}`
    : "Libre";
  const equipo = item.numero_equipo ? `Equipo ${item.numero_equipo}` : "";
  const caja = cajaSinEquipo(item.caja);
  return [item.wifi, item.eth, equipo, caja && `Caja ${caja}`, item.lote && `Lote ${item.lote}`, estado, item.lugar, fechaVisible(item.fecha)].filter(Boolean).join(" · ");
}

function ocupadasVisibles(items) {
  const ocupadas = items.filter((item) => item.libre === false);
  const salidas = ocupadas.filter((item) => !/ingreso/i.test(item.lugar || ""));
  return salidas.length ? salidas : ocupadas;
}

function hex12(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return limpio.length >= 12 ? limpio.slice(0, 12) : "";
}

function yaElegido(item, excepto) {
  const tomadas = new Set();
  filasMac.forEach((fila, indice) => {
    if (indice === excepto) return;
    [fila.wifi, fila.eth].forEach((valor) => {
      const mac = hex12(valor);
      if (mac) tomadas.add(mac);
    });
  });
  return [item.wifi, item.eth].some((valor) => {
    const mac = hex12(valor);
    return mac && tomadas.has(mac);
  });
}

function hayEquipoRepetido() {
  const tomadas = new Set();
  for (const fila of filasMac) {
    const propias = [hex12(fila.wifi), hex12(fila.eth)].filter(Boolean);
    if (propias.some((mac) => tomadas.has(mac))) return true;
    propias.forEach((mac) => tomadas.add(mac));
  }
  return false;
}

function htmlHallazgos(indice, items) {
  return items.map((item) => {
    if (yaElegido(item, indice)) {
      return `<div class="small text-muted py-1">${escapar(textoHallazgo(item))}. Ya está en otra fila.</div>`;
    }
    if (item.libre === false) {
      return `<div class="small text-danger py-1">${escapar(textoHallazgo(item))}. Quedó el registro como está.</div>`;
    }
    return `<button type="button" class="razon-opcion" data-tomar="${indice}" data-wifi="${escapar(item.wifi)}" data-eth="${escapar(item.eth)}" data-lote="${escapar(item.lote)}" data-caja="${escapar(item.caja)}" data-numero="${escapar(item.numero_equipo || "")}" data-libre="1" data-ocupante="">
      ${escapar(textoHallazgo(item))}
    </button>`;
  }).join("");
}

function soltarMac(indice) {
  const fila = filasMac[indice];
  if (!fila) return;
  fila.wifi = "";
  fila.eth = "";
  ["wifi", "eth"].forEach((clave) => {
    const campo = document.getElementById(`mac-${indice}-${clave}`);
    if (campo) campo.value = "";
  });
}

async function buscarEnFila(indice, consulta) {
  const caja = document.querySelector(`[data-resultados="${indice}"]`);
  if (!caja) return;
  const marca = busquedaMac;
  const partes = window.macsEnTexto ? macsEnTexto(consulta) : [];
  const hex = String(consulta || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const buscada = partes[0] || (hex.length >= 4 ? hex.slice(-12) : "");
  if (buscada.length < 4) {
    caja.innerHTML = "";
    return;
  }
  const hallados = await apiFetch(`${API}/mac`, { params: { q: buscada } }) || [];
  if (marca !== busquedaMac || !caja.isConnected) return;
  const filaMac = filasMac[indice] || {};
  const familia = filaMac.familia;
  const completas = buscada.length === 12
    ? hallados.filter((item) => item.wifi === buscada || item.eth === buscada)
    : hallados;
  const deEsta = completas.filter((item) => !familia || item.familia === familia);
  const ajenas = completas.filter((item) => familia && item.familia !== familia);
  if (buscada.length === 12 && !deEsta.length && ajenas.length) {
    soltarMac(indice);
    caja.innerHTML = `<div class="small text-danger py-1">Esa MAC es de ${escapar(nombreFamilia(ajenas[0].familia))}. Este lugar es para ${escapar(nombreFamilia(familia))}.</div>`;
    return;
  }
  const base = deEsta.length ? deEsta : completas;
  const ocupadas = ocupadasVisibles(base);
  if (buscada.length === 12 && ocupadas.length) {
    soltarMac(indice);
    caja.innerHTML = htmlHallazgos(indice, ocupadas);
    return;
  }
  const libres = base.filter((item) => item.libre !== false && !yaElegido(item, indice));
  if (buscada.length === 12 && !libres.length && base.some((item) => yaElegido(item, indice))) {
    soltarMac(indice);
    caja.innerHTML = `<div class="small text-danger py-1">Ese equipo ya está en otra fila.</div>`;
    return;
  }
  if (buscada.length === 12 && libres.length === 1) {
    const propia = libres[0];
    filasMac[indice].wifi = propia.wifi || buscada;
    filasMac[indice].eth = partes[1] || propia.eth || "";
    if (propia.lote) filasMac[indice].lote = propia.lote;
    filasMac[indice].caja = cajaSinEquipo(propia.caja);
    filasMac[indice].numero = propia.numero_equipo || numeroEnCaja(propia.caja);
    pintarMacForm();
    return;
  }
  if (!hallados.length) {
    caja.innerHTML = `<div class="small text-muted py-1">Esa MAC no está en la planilla. Si está libre, completá el renglón para cargarla.</div>`;
    return;
  }
  const visibles = (deEsta.length ? deEsta : hallados).filter((item) => !familia || item.familia === familia);
  if (!visibles.length) {
    caja.innerHTML = `<div class="small text-muted py-1">No hay una MAC de ${escapar(nombreFamilia(familia))} con esas cifras. Si es nueva, completala en el renglón.</div>`;
    return;
  }
  caja.innerHTML = htmlHallazgos(indice, [
    ...visibles.filter((item) => item.libre !== false),
    ...ocupadasVisibles(visibles),
  ]);
}

async function buscarNumeroEnFila(indice, consulta) {
  const caja = document.querySelector(`[data-resultados="${indice}"]`);
  if (!caja) return;
  const marca = busquedaMac;
  const numero = String(consulta || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!numero) {
    caja.innerHTML = "";
    return;
  }
  const hallados = await apiFetch(`${API}/mac`, { params: { numero } }) || [];
  if (marca !== busquedaMac || !caja.isConnected) return;
  const familia = (filasMac[indice] || {}).familia;
  const deEsta = hallados.filter((item) => !familia || item.familia === familia);
  const ajenas = hallados.filter((item) => familia && item.familia !== familia);
  if (!deEsta.length && ajenas.length) {
    caja.innerHTML = `<div class="small text-danger py-1">Ese número es de ${escapar(nombreFamilia(ajenas[0].familia))}. Este lugar es para ${escapar(nombreFamilia(familia))}.</div>`;
    return;
  }
  if (!deEsta.length) {
    caja.innerHTML = `<div class="small text-muted py-1">No hay un equipo con el número ${escapar(numero)}.</div>`;
    return;
  }
  caja.innerHTML = htmlHallazgos(indice, [
    ...deEsta.filter((item) => item.libre !== false),
    ...ocupadasVisibles(deEsta),
  ]);
}

document.getElementById("pais").addEventListener("change", () => {
  llenarCategorias();
  actualizarAviso2();
  copiarCantidad("ingreso", "ingreso");
  copiarCantidad("egreso", "egreso");
});
document.getElementById("categoria").addEventListener("change", () => {
  actualizarAviso2();
  copiarCantidad("ingreso", "ingreso");
  copiarCantidad("egreso", "egreso");
});
document.getElementById("ingreso").addEventListener("input", () => copiarCantidad("ingreso", "ingreso"));
document.getElementById("egreso").addEventListener("input", () => copiarCantidad("egreso", "egreso"));
CONTADORES.forEach((id) => {
  document.getElementById(id).addEventListener("input", armarFilas);
});
document.getElementById("marca-2").addEventListener("change", actualizarAviso2);
document.getElementById("mac-formulario").addEventListener("change", (evento) => {
  const fila = evento.target.closest("[data-fila]");
  if (fila && evento.target.dataset.clave) {
    filasMac[Number(fila.dataset.fila)][evento.target.dataset.clave] = evento.target.value;
  }
  if (evento.target.id !== "mac-pestana") return;
  pestanaId = evento.target.value;
  pintarMacForm();
  actualizarAviso2();
});
document.getElementById("mac-formulario").addEventListener("input", (evento) => {
  if (evento.target.classList.contains("mac-cliente-filtro")) {
    const panel = evento.target.closest(".mac-cliente-panel");
    const indice = Number(evento.target.closest("[data-fila]").dataset.fila);
    panel.querySelector(".razon-lista").innerHTML = listaRazones(evento.target.value, indice);
    return;
  }
  if (evento.target.classList.contains("mac-cliente-nueva")) {
    const texto = evento.target.value.trim();
    if (!texto) return;
    const filaNueva = evento.target.closest("[data-fila]");
    const indice = Number(filaNueva.dataset.fila);
    filasMac[indice].cliente = texto;
    const boton = filaNueva.querySelector(".mac-cliente-boton");
    if (boton) boton.textContent = texto;
    return;
  }
  const fila = evento.target.closest("[data-fila]");
  const clave = evento.target.dataset.clave;
  if (!fila || !clave) return;
  const indice = Number(fila.dataset.fila);
  const previoWifi = clave === "wifi" && window.macsEnTexto ? (macsEnTexto(filasMac[indice].wifi)[0] || "") : "";
  filasMac[indice][clave] = evento.target.value;
  if (clave === "cliente") {
    const boton = fila.querySelector(".mac-cliente-boton");
    if (boton) boton.textContent = evento.target.value.trim() || "Seleccionar…";
    return;
  }
  if (clave === "numero") {
    const marcaNumero = ++busquedaMac;
    setTimeout(() => {
      if (marcaNumero !== busquedaMac) return;
      buscarNumeroEnFila(indice, evento.target.value).catch((error) => mostrarError("msg-error", error.message));
    }, 300);
    return;
  }
  if (clave !== "wifi" && clave !== "eth") return;
  if (clave === "wifi" && window.macsEnTexto) {
    const partes = macsEnTexto(evento.target.value);
    if (partes.length >= 2) {
      evento.target.value = partes[0];
      filasMac[indice].wifi = partes[0];
      if (!filasMac[indice].eth && partes[1]) {
        filasMac[indice].eth = partes[1];
        const eth = document.getElementById(`mac-${indice}-eth`);
        if (eth) eth.value = partes[1];
      }
    }
    const ahora = partes[0] || "";
    if (ahora.length === 12 && previoWifi.length < 12 && document.activeElement === evento.target) {
      const eth = document.getElementById(`mac-${indice}-eth`);
      if (eth) eth.focus();
    }
  }
  const marca = ++busquedaMac;
  setTimeout(() => {
    if (marca !== busquedaMac) return;
    buscarEnFila(indice, evento.target.value).catch((error) => mostrarError("msg-error", error.message));
  }, 300);
});
document.getElementById("mac-formulario").addEventListener("click", (evento) => {
  const otra = evento.target.closest("#btn-otra-mac");
  if (otra) {
    filasMac.push(filaVacia());
    pintarMacForm();
    return;
  }
  const quitar = evento.target.closest("[data-quitar-fila]");
  if (quitar) {
    filasMac.splice(Number(quitar.dataset.quitarFila), 1);
    pintarMacForm();
    return;
  }
  const abrirCliente = evento.target.closest(".mac-cliente-boton");
  if (abrirCliente) {
    const panel = abrirCliente.parentElement.querySelector(".mac-cliente-panel");
    const abierta = !panel.classList.contains("d-none");
    document.querySelectorAll(".mac-cliente-panel").forEach((item) => item.classList.add("d-none"));
    if (!abierta) {
      panel.classList.remove("d-none");
      const filtro = panel.querySelector(".mac-cliente-filtro");
      filtro.value = "";
      panel.querySelector(".razon-lista").innerHTML = listaRazones("", Number(abrirCliente.dataset.fila));
      filtro.focus();
    }
    return;
  }
  const tomar = evento.target.closest("[data-tomar]");
  if (tomar) {
    if (tomar.dataset.libre === "0") {
      mostrarError("msg-error", `Esa MAC está con ${tomar.dataset.ocupante}. Quedó el registro como está.`);
      return;
    }
    const indice = Number(tomar.dataset.tomar);
    if (yaElegido({ wifi: tomar.dataset.wifi, eth: tomar.dataset.eth }, indice)) {
      mostrarError("msg-error", "Ese equipo ya está en otra fila.");
      return;
    }
    filasMac[indice].wifi = tomar.dataset.wifi || "";
    filasMac[indice].eth = tomar.dataset.eth || "";
    if (tomar.dataset.lote) filasMac[indice].lote = tomar.dataset.lote;
    filasMac[indice].caja = cajaSinEquipo(tomar.dataset.caja);
    filasMac[indice].numero = tomar.dataset.numero || numeroEnCaja(tomar.dataset.caja);
    pintarMacForm();
    return;
  }
  const cliente = evento.target.closest("[data-cliente-mac]");
  if (!cliente) return;
  const indice = Number(cliente.dataset.clienteMac);
  filasMac[indice].cliente = cliente.dataset.razon || "";
  pintarMacForm();
});

pintarMacForm();
document.getElementById("razon-boton").addEventListener("click", abrirRazones);
document.getElementById("razon-filtro").addEventListener("input", () => {
  document.getElementById("razon-lista").innerHTML = listaRazones(document.getElementById("razon-filtro").value);
});
document.getElementById("razon-nueva").addEventListener("input", () => {
  const nueva = document.getElementById("razon-nueva").value.trim();
  document.getElementById("razon-boton").textContent = nueva || document.getElementById("razon").value || "Seleccionar…";
  mostrarClienteMac();
});
document.getElementById("razon-lista").addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-razon]");
  if (boton) elegirRazon(boton.dataset.razon);
});
document.getElementById("form-planilla").addEventListener("keydown", (evento) => {
  if (evento.key !== "Enter") return;
  if (evento.target.closest(".razon-panel")) {
    evento.preventDefault();
    return;
  }
  const campo = evento.target.closest("#mac-formulario input");
  if (!campo) return;
  evento.preventDefault();
  if (campo.dataset.clave !== "wifi") return;
  const fila = campo.closest("[data-fila]");
  const eth = fila ? fila.querySelector('[data-clave="eth"]') : null;
  if (eth) eth.focus();
});
document.addEventListener("click", (evento) => {
  document.querySelectorAll(".razon-buscar").forEach((caja) => {
    if (caja.contains(evento.target)) return;
    caja.querySelector(".razon-panel")?.classList.add("d-none");
    caja.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "false");
  });
});

function valorMarcado(campo, tilde, marca) {
  if (document.getElementById(tilde).checked) return marca;
  return document.getElementById(campo).value.trim();
}

function valorTicket() {
  const elegido = document.getElementById("ticket").value;
  if (elegido === "NUMERO") return document.getElementById("ticket-numero").value.trim();
  return elegido;
}

document.getElementById("ticket").addEventListener("change", () => {
  const numero = document.getElementById("ticket-numero");
  const pideNumero = document.getElementById("ticket").value === "NUMERO";
  numero.classList.toggle("d-none", !pideNumero);
  if (!pideNumero) numero.value = "";
});

function marcarAusente(campo, tilde) {
  const caja = document.getElementById(tilde);
  const input = document.getElementById(campo);
  input.disabled = caja.checked;
  if (caja.checked) input.value = "";
}

document.getElementById("sin-factura").addEventListener("change", () => marcarAusente("factura", "sin-factura"));
document.getElementById("sin-remito").addEventListener("change", () => marcarAusente("remito", "sin-remito"));

document.getElementById("form-planilla").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const razon = razonElegida();
  const ingreso = document.getElementById("ingreso").value;
  const egreso = document.getElementById("egreso").value;
  const pestana = modoGuiado()
    ? { operacion: filasMac.some((fila) => fila.operacion === "egreso") ? "egreso" : "ingreso", familia: filasMac[0] ? filasMac[0].familia : "EBD" }
    : pestanaActual();
  filasMac.forEach((fila) => {
    if ((fila.operacion || pestana.operacion) === "egreso") fila.cliente = razon;
  });
  const macs = leerMacs();
  if (hayEquipoRepetido()) {
    mostrarError("msg-error", "Ese equipo ya está en otra fila.");
    return;
  }
  const soloMac = macs.length > 0 && !ingreso && !egreso;
  if (!soloMac) {
    if (!document.getElementById("fecha").value) {
      mostrarError("msg-error", "Completá la fecha del movimiento de stock.");
      return;
    }
    if (!razon) {
      mostrarError("msg-error", "Completá la razón social del movimiento de stock.");
      return;
    }
    if (!document.getElementById("categoria").value) {
      mostrarError("msg-error", "Elegí el dispositivo.");
      return;
    }
    if (!valorTicket()) {
      mostrarError("msg-error", "Elegí el ticket.");
      return;
    }
  }
  if (macs.some((fila) => fila.operacion === "egreso" && !String(fila.cliente || "").trim())) {
    mostrarError("msg-error", "En un egreso, la primera columna es el cliente.");
    return;
  }
  if (modoGuiado() && filasMac.some((fila) => String(fila.wifi || fila.eth || "").replace(/[^0-9A-F]/g, "").length < 12)) {
    mostrarError("msg-error", "Completá la MAC de cada equipo que entra o sale.");
    return;
  }
  const boton = document.getElementById("btn-registrar");
  boton.disabled = true;
  try {
    const respuesta = await apiFetch(API, {
      method: "POST",
      body: {
        pais: document.getElementById("pais").value,
        fecha: document.getElementById("fecha").value,
        estado: document.getElementById("estado").value,
        motivo: document.getElementById("estado").value,
        remito: valorMarcado("remito", "sin-remito", "SIN REMITO"),
        factura: valorMarcado("factura", "sin-factura", "SIN FACTURA"),
        razon_social: razon,
        ticket: valorTicket(),
        categoria_id: document.getElementById("categoria").value,
        ingreso,
        egreso,
        mac_operacion: pestana.operacion,
        mac_familia: pestana.familia,
        con_2_0: document.getElementById("marca-2").checked,
        macs,
      },
    });
    if (!respuesta) return;
    if (respuesta.avisoOcupadas) mostrarError("msg-error", respuesta.avisoOcupadas);
    mostrarExito("msg-exito", respuesta.aviso || "Movimiento registrado.");
    if (razon && !(catalogo.razones || []).some((nombre) => normalizarBusqueda(nombre) === normalizarBusqueda(razon))) {
      catalogo.razones.push(razon);
    }
    elegirRazon("");
    document.getElementById("marca-2").checked = false;
    actualizarAviso2();
    document.getElementById("remito").value = "";
    document.getElementById("factura").value = "";
    document.getElementById("sin-remito").checked = false;
    document.getElementById("sin-factura").checked = false;
    marcarAusente("remito", "sin-remito");
    marcarAusente("factura", "sin-factura");
    document.getElementById("ticket").value = "";
    document.getElementById("ticket-numero").value = "";
    document.getElementById("ticket-numero").classList.add("d-none");
    document.getElementById("estado").value = "";
    document.getElementById("ingreso").value = "";
    document.getElementById("egreso").value = "";
    CONTADORES.forEach((id) => {
      document.getElementById(id).value = "0";
    });
    filasMac = [filaVacia()];
    pintarMacForm();
    avisoMac();
    document.getElementById("razon-panel").classList.add("d-none");
  } catch (error) {
    mostrarError("msg-error", error.message);
  } finally {
    boton.disabled = false;
  }
});

cargarOpciones().catch((error) => mostrarError("msg-error", error.message));
