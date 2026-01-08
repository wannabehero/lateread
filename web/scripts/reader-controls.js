import htmx from "htmx.org";

/**
 * Reader Controls Web Component
 *
 * A self-contained web component for reader font customization.
 * Uses Shadow DOM for encapsulation while updating CSS variables
 * on the document root for reader content styling.
 *
 * Attributes:
 *   data-font-family: "sans" | "serif" | "new-york"
 *   data-font-size: number (14-24)
 *   data-api-url: URL for persisting preferences
 *
 * @example
 * <reader-controls
 *   data-font-family="sans"
 *   data-font-size="18"
 *   data-api-url="/api/preferences/reader">
 * </reader-controls>
 */
class ReaderControls extends HTMLElement {
  static MIN_FONT_SIZE = 14;
  static MAX_FONT_SIZE = 24;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.isApplePlatform = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  }

  connectedCallback() {
    this.fontFamily = this.dataset.fontFamily || "sans";
    this.fontSize = parseInt(this.dataset.fontSize, 10) || 18;
    this.apiUrl = this.dataset.apiUrl || "/api/preferences/reader";

    this.render();
    this.bindEvents();
    this.applyToDocument();
  }

  /**
   * Calculate optimal line height based on font size.
   * Larger fonts need less relative line-height for readability.
   * 14px -> 1.7, 18px -> 1.6, 24px -> 1.5
   */
  calculateLineHeight(fontSize) {
    const minLineHeight = 1.5;
    const maxLineHeight = 1.7;
    const ratio =
      (fontSize - ReaderControls.MIN_FONT_SIZE) /
      (ReaderControls.MAX_FONT_SIZE - ReaderControls.MIN_FONT_SIZE);
    return maxLineHeight - ratio * (maxLineHeight - minLineHeight);
  }

  /**
   * Apply current preferences to document CSS variables.
   * These variables affect the reader content outside this component.
   */
  applyToDocument() {
    const root = document.documentElement;

    // Get the font family value from CSS variable preset
    const fontFamilyVar = `--reader-font-${this.fontFamily.replace(/-/g, "")}`;
    const fontFamilyValue = getComputedStyle(root)
      .getPropertyValue(fontFamilyVar)
      .trim();

    const lineHeight = this.calculateLineHeight(this.fontSize);

    root.style.setProperty("--reader-font-family", fontFamilyValue);
    root.style.setProperty("--reader-font-size", `${this.fontSize}px`);
    root.style.setProperty("--reader-line-height", lineHeight);
  }

  /**
   * Update component UI state (active buttons, disabled states, displays)
   */
  updateUI() {
    const shadow = this.shadowRoot;

    // Update font family buttons
    shadow.querySelectorAll("[data-font-family]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.fontFamily === this.fontFamily,
      );
    });

    // Update font size display
    const display = shadow.getElementById("font-size-display");
    if (display) {
      display.textContent = `${this.fontSize}px`;
    }

    // Update hidden inputs
    shadow.getElementById("font-family-input").value = this.fontFamily;
    shadow.getElementById("font-size-input").value = this.fontSize;

    // Update disabled states
    const decreaseBtn = shadow.querySelector('[data-action="decrease"]');
    const increaseBtn = shadow.querySelector('[data-action="increase"]');
    if (decreaseBtn)
      decreaseBtn.disabled = this.fontSize <= ReaderControls.MIN_FONT_SIZE;
    if (increaseBtn)
      increaseBtn.disabled = this.fontSize >= ReaderControls.MAX_FONT_SIZE;
  }

  bindEvents() {
    const shadow = this.shadowRoot;
    const form = shadow.getElementById("reader-controls-form");

    // Font family buttons
    shadow.querySelectorAll("[data-font-family]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.fontFamily = btn.dataset.fontFamily;
        this.applyToDocument();
        this.updateUI();
        this.triggerFormChange(form);
      });
    });

    // Font size buttons
    shadow.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (
          action === "increase" &&
          this.fontSize < ReaderControls.MAX_FONT_SIZE
        ) {
          this.fontSize += 1;
        } else if (
          action === "decrease" &&
          this.fontSize > ReaderControls.MIN_FONT_SIZE
        ) {
          this.fontSize -= 1;
        }
        this.applyToDocument();
        this.updateUI();
        this.triggerFormChange(form);
      });
    });
  }

  /**
   * Trigger change event on form for HTMX debounced submission
   */
  triggerFormChange(form) {
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  render() {
    const newYorkHidden = this.isApplePlatform ? "" : "hidden";

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <form
        id="reader-controls-form"
        class="reader-controls"
        hx-post="${this.apiUrl}"
        hx-trigger="change delay:500ms"
        hx-swap="none"
      >
        <input type="hidden" name="fontFamily" id="font-family-input" value="${this.fontFamily}" />
        <input type="hidden" name="fontSize" id="font-size-input" value="${this.fontSize}" />

        <div class="reader-controls-section">
          <span class="reader-controls-label">Text</span>
          <div class="reader-controls-group">
            <button
              type="button"
              class="reader-control-btn ${this.fontFamily === "sans" ? "active" : ""}"
              data-font-family="sans"
              style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
            >
              Sans
            </button>
            <button
              type="button"
              class="reader-control-btn ${this.fontFamily === "serif" ? "active" : ""}"
              data-font-family="serif"
              style="font-family: Georgia, Cambria, 'Times New Roman', Times, serif;"
            >
              Serif
            </button>
            <button
              type="button"
              class="reader-control-btn ${this.fontFamily === "new-york" ? "active" : ""} ${newYorkHidden}"
              data-font-family="new-york"
              style="font-family: 'New York', Charter, Georgia, serif;"
            >
              New York
            </button>
          </div>
          <div class="reader-controls-group reader-size-controls">
            <button
              type="button"
              class="reader-control-btn inverted"
              data-action="decrease"
              ${this.fontSize <= ReaderControls.MIN_FONT_SIZE ? "disabled" : ""}
              title="Decrease font size"
            >
              <img src="/public/assets/a-arrow-down.svg" alt="Decrease" class="button-icon" />
            </button>
            <span class="reader-font-size-display" id="font-size-display">${this.fontSize}px</span>
            <button
              type="button"
              class="reader-control-btn inverted"
              data-action="increase"
              ${this.fontSize >= ReaderControls.MAX_FONT_SIZE ? "disabled" : ""}
              title="Increase font size"
            >
              <img src="/public/assets/a-arrow-up.svg" alt="Increase" class="button-icon" />
            </button>
          </div>
        </div>
      </form>
    `;

    // Process HTMX on shadow root for HTMX to recognize the form
    htmx.process(this.shadowRoot);
  }

  getStyles() {
    return `
      .reader-controls {
        margin: 0;
        padding: 0.75rem 1rem;
      }

      .reader-controls-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .reader-controls-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--pico-muted-color);
        margin: 0;
        display: block;
      }

      .reader-controls-group {
        display: flex;
        gap: 0.5rem;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: center;
      }

      .reader-size-controls {
        justify-content: center;
      }

      .reader-control-btn {
        padding: 0.4rem 0.75rem;
        font-size: 0.85rem;
        margin: 0;
        background: transparent;
        border: 1px solid var(--pico-muted-border-color);
        color: var(--pico-contrast);
        border-radius: var(--pico-border-radius);
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .reader-control-btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--pico-primary) 10%, transparent);
        border-color: var(--pico-primary);
      }

      .reader-control-btn.active {
        background: var(--pico-primary);
        border-color: var(--pico-primary);
        color: white;
      }

      .reader-control-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .reader-control-btn.hidden {
        display: none;
      }

      .reader-font-size-display {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 55px;
        padding: 0.4rem 0.6rem;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--pico-contrast);
      }

      .reader-size-controls .reader-control-btn {
        flex: 0 0 auto;
        min-width: 36px;
      }

      .button-icon {
        width: 1em;
        height: 1em;
        vertical-align: middle;
      }

      @media (max-width: 768px) {
        .reader-controls-group {
          flex-wrap: wrap;
        }
      }

      @media (max-width: 480px) {
        .reader-control-btn {
          padding: 0.5rem 0.85rem;
          font-size: 0.9rem;
        }

        .reader-font-size-display {
          font-size: 0.9rem;
          min-width: 60px;
        }
      }
    `;
  }
}

customElements.define("reader-controls", ReaderControls);
