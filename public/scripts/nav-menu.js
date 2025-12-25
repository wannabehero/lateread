document.addEventListener("DOMContentLoaded", () => {
  const navMenus = document.querySelectorAll(".nav-menu");

  navMenus.forEach((navMenu) => {
    const menuButton = navMenu.querySelector(".nav-icon-button");

    if (!menuButton) return;

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
});
