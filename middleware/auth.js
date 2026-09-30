function requerirLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({ error: "No autenticado" });
  }
  next();
}

/**
 * Middleware factory: requerirRol(['admin']) o requerirRol(['admin','operador'])
 */
function requerirRol(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session.usuario) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!rolesPermitidos.includes(req.session.usuario.rol)) {
      return res.status(403).json({ error: "No tenés permisos para esta acción" });
    }
    next();
  };
}

module.exports = { requerirLogin, requerirRol };
