document.addEventListener("DOMContentLoaded", () => {
  const navMenu = document.querySelector(".nav-menu");
  const menuButton = document.querySelector(".nav-icon-button");

  if (!navMenu || !menuButton) return;

  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    navMenu.classList.toggle("is-open");
  });

  document.addEventListener("click", (e) => {
    if (!navMenu.contains(e.target)) {
      navMenu.classList.remove("is-open");
    }
  });
});
