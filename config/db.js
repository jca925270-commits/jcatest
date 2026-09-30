require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const host = process.env.DB_HOST || "127.0.0.1";
const sslEnabled = process.env.DB_SSL === "true" || host.endsWith(".aivencloud.com");
let ssl;
if (sslEnabled) {
  const ca = process.env.DB_SSL_CA
    ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
    : process.env.DB_SSL_CA_PATH
      ? fs.readFileSync(path.resolve(__dirname, "..", process.env.DB_SSL_CA_PATH), "utf8")
      : null;
  if (!ca) throw new Error("Configurá DB_SSL_CA o DB_SSL_CA_PATH con el certificado CA de Aiven.");
  ssl = { ca, rejectUnauthorized: true };
}

const pool = mysql.createPool({
  host,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "stock_db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  ...(ssl ? { ssl } : {}),
  waitForConnections: true,
  connectionLimit: 5,
  namedPlaceholders: true,
  connectTimeout: 15000,
});

module.exports = pool;
