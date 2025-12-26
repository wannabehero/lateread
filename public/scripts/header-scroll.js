// Header Auto-hide on Scroll (only on pages with data-collapsible="true")
(() => {
  const header = document.querySelector(".fixed-nav");
  if (!header) return;

  let lastScrollY = window.scrollY;
  let ticking = false;
  let isCollapsible = false;
  const scrollThreshold = 10; // Minimum scroll distance to trigger hide/show

  // Check if header should be collapsible
  function checkCollapsible() {
    isCollapsible = header.hasAttribute("data-collapsible");

    // Reset header state when navigating away from collapsible page
    if (!isCollapsible) {
      header.classList.remove("header-hidden");
    }
  }

  function updateHeader() {
    // Only apply scroll behavior on collapsible pages
    if (!isCollapsible) {
      ticking = false;
      return;
    }

    const currentScrollY = window.scrollY;
    const scrollDifference = currentScrollY - lastScrollY;

    // Only trigger if scroll exceeds threshold
    if (Math.abs(scrollDifference) < scrollThreshold) {
      ticking = false;
      return;
    }

    // Hide header when scrolling down, show when scrolling up
    if (scrollDifference > 0 && currentScrollY > 100) {
      // Scrolling down and past 100px from top
      header.classList.add("header-hidden");
    } else if (scrollDifference < 0) {
      // Scrolling up
      header.classList.remove("header-hidden");
    }

    // Always show header when near top of page
    if (currentScrollY < 50) {
      header.classList.remove("header-hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }

  // Initialize
  checkCollapsible();

  // Listen to scroll events
  window.addEventListener("scroll", onScroll, { passive: true });

  // Handle HTMX page loads (re-check collapsible state and reset)
  document.body.addEventListener("htmx:afterSwap", () => {
    lastScrollY = window.scrollY;
    checkCollapsible();
  });
})();
