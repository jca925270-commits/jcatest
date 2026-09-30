function alternarTema() {
  const esOscuro = document.documentElement.classList.toggle("dark");
  localStorage.setItem("tema", esOscuro ? "dark" : "light");
  actualizarIconoTema();
}

function actualizarIconoTema() {
  const btn = document.getElementById("btn-tema");
  if (!btn) return;
  const esOscuro = document.documentElement.classList.contains("dark");
  btn.textContent = esOscuro ? "☀️ Claro" : "🌙 Oscuro";
}

document.addEventListener("DOMContentLoaded", actualizarIconoTema);
