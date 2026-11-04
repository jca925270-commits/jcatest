const nodemailer = require("nodemailer");

function configurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporte() {
  if (!configurado()) {
    const err = new Error("Falta configurar el correo de salida.");
    err.status = 503;
    throw err;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function enviarCorreo({ to, subject, text, html }) {
  const destinos = [...new Set(
    (Array.isArray(to) ? to : [to])
      .map((correo) => String(correo || "").trim().toLowerCase())
      .filter(Boolean)
  )];
  if (!destinos.length) {
    const err = new Error("No hay correos para enviar.");
    err.status = 400;
    throw err;
  }
  const desde = process.env.SMTP_FROM
    ? process.env.SMTP_FROM
    : `"Sistema de Stock" <${process.env.SMTP_USER}>`;
  try {
    const info = await transporte().sendMail({
      from: desde,
      to: destinos.join(", "),
      subject,
      text,
      html,
    });
    return { id: info.messageId, enviados: destinos.length };
  } catch (e) {
    if (e.status) throw e;
    console.error("Correo:", e.code || "SMTP_ERROR");
    const err = new Error("No se pudo enviar el correo.");
    err.status = 500;
    throw err;
  }
}

module.exports = { enviarCorreo, configurado };
