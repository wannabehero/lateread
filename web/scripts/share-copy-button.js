class ShareCopyButton extends HTMLElement {
  constructor() {
    super();
    this.canShare = navigator.share !== undefined;
  }

  connectedCallback() {
    this.render();
    this.querySelector("button").addEventListener("click", () =>
      this.handleClick(),
    );
  }

  render() {
    const icon = this.canShare
      ? "/public/assets/share.svg"
      : "/public/assets/copy.svg";
    const title = this.canShare ? "Share" : "Copy link";
    const alt = this.canShare ? "Share" : "Copy";

    this.innerHTML = `
      <button type="button" title="${title}">
        <span class="button-text">
          <img src="${icon}" alt="${alt}" class="button-icon" />
        </span>
      </button>
    `;
  }

  async handleClick() {
    const url = this.dataset.url;
    const title = this.dataset.title;

    if (this.canShare) {
      try {
        await navigator.share({ title, url });
      } catch (err) {
        // User cancelled or share failed - ignore AbortError
        if (err.name !== "AbortError") {
          this.copyToClipboard(url);
        }
      }
    } else {
      this.copyToClipboard(url);
    }
  }

  async copyToClipboard(url) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard", "success");
    } catch {
      showToast("Failed to copy link", "error");
    }
  }
}

customElements.define("share-copy-button", ShareCopyButton);
