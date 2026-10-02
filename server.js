require("dotenv").config();
const { spawn } = require("child_process");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const path = require("path");
const cors = require("cors");

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("Configurá SESSION_SECRET con una clave aleatoria de al menos 32 caracteres.");
}
const pool = require("./config/db");
const app = express();
const production = process.env.NODE_ENV === "production";
app.disable("x-powered-by");
if (production) app.set("trust proxy", 1);

// El frontend servido por Express funciona sin CORS.
// Para un frontend separado, indicar sus URLs exactas en CORS_ORIGINS.
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
if (allowedOrigins.length) app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionStore = new MySQLStore({
  createDatabaseTable: true,
  expiration: 1000 * 60 * 60 * 8,
  endConnectionOnClose: false,
}, pool);
sessionStore.on("error", err => console.error("Error de sesiones:", err.code || "SESSION_ERROR"));
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/catalogos", require("./routes/catalogos"));
app.use("/api/dispositivos", require("./routes/dispositivos"));
app.use("/api/movimientos", require("./routes/movimientos"));
app.use("/api/clientes", require("./routes/clientes"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/reportes", require("./routes/reportes"));
app.use("/api/accesorios", require("./routes/accesorios"));
app.use("/api/stock", require("./routes/stock"));
app.use("/api/deposito", require("./routes/deposito"));
app.use("/api/estado", require("./routes/estado"));
app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "El formato JSON enviado no es válido" });
  }
  next(err);
});
app.use((err, req, res, next) => {
  console.error("Error no controlado:", err.code || err.name || "SERVER_ERROR");
  res.status(500).json({ error: "Error interno del servidor" });
});

async function start() {
  try {
    await pool.query("SELECT 1");
    await sessionStore.onReady();
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Servidor de Stock iniciado en puerto ${port}`);
    });
    server.on("error", err => {
      console.error("No se pudo abrir el puerto:", err.code);
      process.exit(1);
    });
    iniciarSyncPlanilla();
  } catch (err) {
    console.error("No se pudo iniciar la conexión o las sesiones:", err.code || err.name);
    process.exit(1);
  }
}
function iniciarSyncPlanilla() {
  if (!process.env.GOOGLE_SHEET_ID) return;
  const child = spawn("python", [path.join(__dirname, "import", "sync_planilla_drive.py")], {
    cwd: __dirname,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", err => console.error("No se pudo iniciar la sincronización de la planilla:", err.code || err.message));
  child.on("exit", code => {
    if (code) console.error("La sincronización de la planilla se detuvo. Código:", code);
  });
}

start();
