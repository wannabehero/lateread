class ArticlePlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["src", "title"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (this.shadowRoot.querySelector("audio")) {
      this.updateAttributes();
    }
  }

  setAudioMetadata() {
    if (!("mediaSession" in navigator)) {
      return;
    }

    const title = this.getAttribute("title");

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      album: "lateread",
      artwork: [
        {
          src: "/public/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    });
  }

  updateAttributes() {
    const audio = this.shadowRoot.querySelector("audio");
    if (!audio) return;

    const src = this.getAttribute("src");
    if (src && audio.src !== src && !src.endsWith(audio.src)) {
      // audio.src is absolute, this.getAttribute('src') might be relative
      // We set it if it differs
      audio.src = src;
    }

    // We don't need to put title on the audio element, we use it from this.getAttribute('title') in setAudioMetadata
  }

  render() {
    if (this.shadowRoot.innerHTML.trim() !== "") return;

    const src = this.getAttribute("src");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 2rem;
        }
        audio {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          display: block;
        }
      </style>
      <audio
        controls
        preload="none"
        id="article-audio"
        ${src ? `src="${src}"` : ""}
      ></audio>
    `;

    const audio = this.shadowRoot.querySelector("audio");
    audio.addEventListener("play", () => this.setAudioMetadata());
  }
}

customElements.define("article-player", ArticlePlayer);
