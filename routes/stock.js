const express = require("express");
const router = express.Router();
const db = require("../config/db");

// 1. GET /api/stock - SELECT * FROM stock_actual
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM stock_actual ORDER BY fecha DESC");
    res.json(rows);
  } catch (err) {
    console.error("Error al obtener stock_actual:", err);
    res.status(500).json({ 
      error: "Error al obtener el stock actual", 
      detalle: err.message 
    });
  }
});

// 2. POST /api/stock - INSERT INTO stock_actual
router.post("/", async (req, res) => {
  try {
    const { 
      fecha, 
      deposito, 
      dispositivo, 
      mac_wifi, 
      estado, 
      num_remito, 
      num_factura, 
      razon_social, 
      num_ticket, 
      motivo, 
      tipo_movimiento, 
      cantidad 
    } = req.body;

    // Valores por defecto seguros para evitar valores NULL en columnas ENUM / NOT NULL
    const fechaFinal = fecha ? new Date(fecha) : new Date();
    const depositoFinal = deposito || 'SHOWROOM';
    const estadoFinal = estado || 'COMPLETADO';
    const tipoMovimientoFinal = tipo_movimiento || 'INGRESO';
    const cantidadFinal = parseInt(cantidad, 10) || 1;

    const query = `
      INSERT INTO stock_actual 
      (fecha, deposito, dispositivo, mac_wifi, estado, num_remito, num_factura, razon_social, num_ticket, motivo, tipo_movimiento, cantidad) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      fechaFinal,
      depositoFinal,
      dispositivo || null,
      mac_wifi || null,
      mac_eth,
      estadoFinal,
      num_remito || null,
      num_factura || null,
      razon_social || null,
      num_ticket || null,
      motivo || null,
      tipoMovimientoFinal,
      cantidadFinal
    ];

    const [result] = await db.query(query, values);

    res.status(201).json({
      mensaje: "Registro insertado con éxito",
      id_registro: result.insertId
    });

  } catch (err) {
    console.error("Error al insertar en stock_actual:", err);
    res.status(500).json({ 
      error: "Error interno del servidor al insertar el registro", 
      detalle: err.message 
    });
  }
});

module.exports = router;