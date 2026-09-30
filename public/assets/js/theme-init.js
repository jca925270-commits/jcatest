// Se carga de forma bloqueante, en el <head>, antes que cualquier otra cosa,
// para que la página nunca "parpadee" con el tema incorrecto al cargar.
(function () {
  var guardado = localStorage.getItem("tema");
  var esOscuro = guardado ? guardado === "dark" : true; // oscuro por defecto
  document.documentElement.classList.toggle("dark", esOscuro);
})();
