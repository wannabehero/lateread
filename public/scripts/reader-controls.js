// Reader Font Customization Controls
(() => {
  // Only run on reader pages
  const readerControls = document.getElementById("reader-controls-form");
  if (!readerControls) return;

  // Detect Apple platforms for San Francisco/New York fonts
  const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!isApplePlatform) {
    document.querySelectorAll('[data-apple-only="true"]').forEach((btn) => {
      btn.classList.add("hidden");
    });
  }

  // Get hidden inputs
  const fontFamilyInput = document.getElementById("font-family-input");
  const fontSizeInput = document.getElementById("font-size-input");
  const fontSizeDisplay = document.getElementById("font-size-display");

  // Calculate optimal line height based on font size
  function calculateLineHeight(fontSize) {
    // Larger fonts need less relative line-height for optimal readability
    // 14px -> 1.7, 18px -> 1.6, 24px -> 1.5
    const minSize = 14;
    const maxSize = 24;
    const minLineHeight = 1.5;
    const maxLineHeight = 1.7;

    // Linear interpolation between min and max
    const ratio = (fontSize - minSize) / (maxSize - minSize);
    const lineHeight = maxLineHeight - ratio * (maxLineHeight - minLineHeight);

    // Clamp between min and max
    return Math.max(minLineHeight, Math.min(maxLineHeight, lineHeight));
  }

  // Apply preferences to CSS variables instantly
  function applyPreferences(prefs) {
    const root = document.documentElement;

    // Get the font family from the CSS variable
    const fontFamilyVar = `--reader-font-${prefs.fontFamily.replace(/-/g, "")}`;
    const fontFamilyValue = getComputedStyle(root)
      .getPropertyValue(fontFamilyVar)
      .trim();

    // Calculate appropriate line height for the font size
    const lineHeight = calculateLineHeight(prefs.fontSize);

    root.style.setProperty("--reader-font-family", fontFamilyValue);
    root.style.setProperty("--reader-font-size", `${prefs.fontSize}px`);
    root.style.setProperty("--reader-line-height", lineHeight);

    // Update hidden inputs for HTMX form submission
    fontFamilyInput.value = prefs.fontFamily;
    fontSizeInput.value = prefs.fontSize;

    // Update UI state
    updateActiveStates(prefs);

    // Trigger change event on form to activate HTMX delay trigger
    const changeEvent = new Event("change", { bubbles: true });
    readerControls.dispatchEvent(changeEvent);
  }

  // Update active button states and displays
  function updateActiveStates(prefs) {
    // Font family buttons
    document.querySelectorAll("[data-font-family]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.fontFamily === prefs.fontFamily,
      );
    });

    // Font size display
    if (fontSizeDisplay) {
      fontSizeDisplay.textContent = `${prefs.fontSize}px`;
    }

    // Disable size buttons at limits
    const decreaseBtn = document.querySelector(
      '[data-font-size-action="decrease"]',
    );
    const increaseBtn = document.querySelector(
      '[data-font-size-action="increase"]',
    );
    if (decreaseBtn) decreaseBtn.disabled = prefs.fontSize <= 14;
    if (increaseBtn) increaseBtn.disabled = prefs.fontSize >= 24;
  }

  // Get current preferences from inputs
  function getCurrentPreferences() {
    return {
      fontFamily: fontFamilyInput.value,
      fontSize: parseInt(fontSizeInput.value, 10),
    };
  }

  // Event: Font family change
  document.querySelectorAll("[data-font-family]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const currentPrefs = getCurrentPreferences();
      currentPrefs.fontFamily = btn.dataset.fontFamily;
      applyPreferences(currentPrefs);
    });
  });

  // Event: Font size change
  document.querySelectorAll("[data-font-size-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const currentPrefs = getCurrentPreferences();
      const action = btn.dataset.fontSizeAction;

      if (action === "increase" && currentPrefs.fontSize < 24) {
        currentPrefs.fontSize += 1;
      } else if (action === "decrease" && currentPrefs.fontSize > 14) {
        currentPrefs.fontSize -= 1;
      }

      applyPreferences(currentPrefs);
    });
  });

  // Initialize: Apply current preferences on load
  const initialPrefs = getCurrentPreferences();
  applyPreferences(initialPrefs);
})();
