document.addEventListener("click", () => {
  const navMenus = document.querySelectorAll(".nav-menu");
  navMenus.forEach((navMenu) => {
    navMenu.classList.remove("is-open");
  });
});
