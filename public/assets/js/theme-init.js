// Se carga de forma bloqueante, en el <head>, antes que cualquier otra cosa,
// para que la página nunca "parpadee" con el tema incorrecto al cargar.
(function () {
  document.documentElement.classList.add("dark");
  try { localStorage.removeItem("tema"); } catch (e) {}
})();
