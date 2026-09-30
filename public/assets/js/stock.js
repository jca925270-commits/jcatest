document.addEventListener("DOMContentLoaded", () => {
  obtenerStock();
});

async function obtenerStock() {
  try {
    const response = await fetch("/api/stock");
    if (!response.ok) throw new Error("Error al consultar API de stock");

    const datos = await response.json();
    const tbody = document.getElementById("tabla-stock");
    if (!tbody) return;

    tbody.innerHTML = "";

    datos.forEach((fila) => {
      const fechaFormateada = fila.fecha
        ? new Date(fila.fecha).toLocaleDateString("es-AR")
        : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fila.id_stock}</td>
        <td>${fechaFormateada}</td>
        <td><span class="badge">${fila.tipo_movimiento || "-"}</span></td>
        <td>${fila.remito || "-"}</td>
        <td>${fila.factura || "-"}</td>
        <td>${fila.Razon_Social || "-"}</td>
        <td>${fila.dispositivo || "-"}</td>
        <td>${fila.ticket || "-"}</td>
        <td style="color: #4CAF50; font-weight: bold;">${fila.ingreso || 0}</td>
        <td style="color: #F44336; font-weight: bold;">${fila.egreso || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error cargando los datos de stock:", error);
  }
}