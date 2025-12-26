// Header Auto-hide on Scroll
(() => {
  const header = document.querySelector(".fixed-nav");
  if (!header) return;

  let lastScrollY = window.scrollY;
  let ticking = false;
  const scrollThreshold = 10; // Minimum scroll distance to trigger hide/show

  function updateHeader() {
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

  // Listen to scroll events
  window.addEventListener("scroll", onScroll, { passive: true });

  // Handle HTMX page loads (reset state)
  document.body.addEventListener("htmx:afterSwap", () => {
    lastScrollY = window.scrollY;
    header.classList.remove("header-hidden");
  });
})();
