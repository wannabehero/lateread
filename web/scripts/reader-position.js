import htmx from "htmx.org";

/**
 * Reader Position Web Component
 *
 * Tracks and restores reading position for articles.
 * Uses element-based positioning for consistent behavior across screen sizes.
 *
 * Attributes:
 *   article-id: UUID of the article
 *   initial-element: Starting element index (0-indexed)
 *   initial-offset: Starting offset within element (0-100%)
 *
 * @example
 * <reader-position
 *   article-id="uuid-here"
 *   initial-element="12"
 *   initial-offset="45">
 *   <div class="reader-content">...</div>
 * </reader-position>
 */
class ReaderPosition extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Bound references for cleanup
    this.handleScroll = this.onScroll.bind(this);
    this.handleVisibilityChange = this.onVisibilityChange.bind(this);
  }

  connectedCallback() {
    const articleId = this.getAttribute("article-id");

    this.shadowRoot.innerHTML = `
      <form
        hx-post="/api/articles/${articleId}/position"
        hx-trigger="save-position delay:2s"
        hx-swap="none"
      >
        <input type="hidden" name="element" value="0">
        <input type="hidden" name="offset" value="0">
      </form>
      <slot></slot>
    `;

    htmx.process(this.shadowRoot);

    this.form = this.shadowRoot.querySelector("form");
    this.elementInput = this.shadowRoot.querySelector('input[name="element"]');
    this.offsetInput = this.shadowRoot.querySelector('input[name="offset"]');

    // Restore position immediately (works for direct navigation)
    this.restorePosition();

    // Also restore after HTMX settles (for hx-boost navigation)
    document.body.addEventListener(
      "htmx:afterSettle",
      () => this.restorePosition(),
      { once: true },
    );

    // Add listeners
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  disconnectedCallback() {
    // Clean up listeners when component is removed
    window.removeEventListener("scroll", this.handleScroll);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
  }

  /**
   * Get all trackable content elements from the slotted content
   */
  getContentElements() {
    const content = this.querySelector(".reader-content");
    if (!content) return [];
    return Array.from(
      content.querySelectorAll(
        "p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, figure",
      ),
    );
  }

  /**
   * Restore reading position from initial attributes
   */
  restorePosition() {
    const elementIndex = this.getAttribute("initial-element");
    const offsetPercent = this.getAttribute("initial-offset");

    if (!elementIndex) return;

    const elements = this.getContentElements();
    const element = elements[parseInt(elementIndex, 10)];
    if (!element) return;

    // Scroll after layout settles
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const elementTop = window.scrollY + rect.top;
      const offset = (parseInt(offsetPercent || "0", 10) / 100) * rect.height;

      window.scrollTo({
        top: elementTop + offset - 100, // 100px from top for header
        behavior: "instant",
      });
    });
  }

  /**
   * Calculate current reading position based on scroll
   */
  getCurrentPosition() {
    const elements = this.getContentElements();
    const viewportTop = window.scrollY + 100; // Account for header

    for (let i = 0; i < elements.length; i++) {
      const rect = elements[i].getBoundingClientRect();
      const elementTop = window.scrollY + rect.top;
      const elementBottom = elementTop + rect.height;

      if (elementBottom > viewportTop) {
        const offsetWithin = Math.max(0, viewportTop - elementTop);

        // Guard against division by zero or invalid height
        let offsetPercent = 0;
        if (rect.height > 0) {
          offsetPercent = Math.round((offsetWithin / rect.height) * 100);
        }

        // Ensure value is valid and within bounds
        offsetPercent = Number.isFinite(offsetPercent)
          ? Math.min(Math.max(offsetPercent, 0), 100)
          : 0;

        return {
          element: i,
          offset: offsetPercent,
        };
      }
    }
    return { element: 0, offset: 0 };
  }

  /**
   * Handle scroll events - update form and trigger HTMX save
   */
  onScroll() {
    const position = this.getCurrentPosition();

    this.elementInput.value = position.element;
    this.offsetInput.value = position.offset;

    // Trigger HTMX - it will debounce with delay:2s
    htmx.trigger(this.form, "save-position");
  }

  /**
   * Handle visibility change - save immediately when leaving page
   */
  onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      this.saveImmediately();
    }
  }

  /**
   * Save position immediately using sendBeacon for reliability
   */
  saveImmediately() {
    const position = this.getCurrentPosition();
    this.elementInput.value = position.element;
    this.offsetInput.value = position.offset;

    navigator.sendBeacon(
      `/api/articles/${this.getAttribute("article-id")}/position`,
      new FormData(this.form),
    );
  }
}

customElements.define("reader-position", ReaderPosition);
