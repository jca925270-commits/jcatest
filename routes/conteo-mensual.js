const express = require("express");
const { enviarAvisoMensual } = require("../lib/conteo");

const router = express.Router();

router.get("/", async (req, res) => {
  const secreto = process.env.CRON_SECRET || "";
  const autorizacion = req.headers.authorization || "";
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: "No autorizado" });
  }
  try {
    return res.json(await enviarAvisoMensual());
  } catch (e) {
    console.error("Conteo mensual:", e.code || e.status || "ERROR");
    return res.status(e.status || 500).json({ error: e.status ? e.message : "No se pudo enviar el conteo." });
  }
});

module.exports = router;
