require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const cors = require("cors"); // Se recomienda instalar con: npm install cors

const app = express();

// --- Middlewares Básicos y Body Parsers ---
app.use(cors()); // Habilita peticiones desde cualquier origen local/IP
app.use(express.json()); // Parsea peticiones con content-type: application/json
app.use(express.urlencoded({ extended: true })); // Parsea peticiones con datos de formulario

// --- Configuración de Sesiones ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Yanina3",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
      // secure: true, // Descomentar cuando la app corra bajo HTTPS
    },
  })
);

// --- Rutas de la API ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api/catalogos", require("./routes/catalogos"));
app.use("/api/dispositivos", require("./routes/dispositivos"));
app.use("/api/movimientos", require("./routes/movimientos"));
app.use("/api/clientes", require("./routes/clientes"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/reportes", require("./routes/reportes"));
app.use("/api/accesorios", require("./routes/accesorios"));
app.use("/api/stock", require("./routes/stock"));

// --- Frontend Estático (Archivos HTML, CSS, JS) ---
app.use(express.static(path.join(__dirname, "public")));

// --- Manejador de errores para JSON mal formados (Evita SyntaxError 400 no controlado) ---
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("❌ Error de sintaxis en JSON recibido:", err.message);
    return res.status(400).json({ error: "El formato JSON enviado no es válido" });
  }
  next(err);
});

// --- Manejador de errores genérico (Catch-all 500) ---
app.use((err, req, res, next) => {
  console.error("❌ Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// --- Inicio del Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Stock corriendo en http://localhost:${PORT}`);
});