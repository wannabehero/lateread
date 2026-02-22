// Stream completion timeout - if no data received for this long, consider stream complete
const STREAM_COMPLETION_TIMEOUT_MS = 2000;

class WSAudioPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Audio state
    this.isPlaying = false;
    this.isPaused = false;
    this.audioContext = null;
    this.ws = null;
    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.wavHeader = null;
    this.sampleRate = 48000; // Will be updated from WAV header
    this.channels = 1; // Will be updated from WAV header
    this.nextScheduledTime = 0; // Track when next chunk should play
    this.activeSources = []; // Track active audio sources
    this.streamComplete = false; // Track if WebSocket streaming is done
    this.lastChunkTime = null; // Track when we last received data
    this.completionCheckInterval = null; // Interval to check for stream completion
  }

  static get observedAttributes() {
    return ["article-id", "title"];
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  cleanup() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.completionCheckInterval) {
      clearInterval(this.completionCheckInterval);
      this.completionCheckInterval = null;
    }
    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.isPlaying = false;
    this.isPaused = false;
    this.nextScheduledTime = 0;
    this.wavHeader = null;
    this.activeSources = [];
    this.streamComplete = false;
    this.lastChunkTime = null;
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

    // Set up media session action handlers
    navigator.mediaSession.setActionHandler("play", () => this.play());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("stop", () => this.stop());
  }

  parseWAVHeader(bytes) {
    // WAV header is 44 bytes
    // Bytes 22-23: number of channels
    // Bytes 24-27: sample rate
    // Bytes 34-35: bits per sample
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    this.channels = view.getUint16(22, true);
    this.sampleRate = view.getUint32(24, true);
  }

  convertPCMToFloat32(bytes) {
    // Convert 16-bit signed PCM to Float32Array (-1.0 to 1.0)
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 2,
    );
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768.0; // Convert to -1.0 to 1.0 range
    }
    return float32;
  }

  async playAudioChunk(audioData) {
    if (!this.audioContext) return;

    const audioBuffer = this.audioContext.createBuffer(
      this.channels,
      audioData.length / this.channels,
      this.sampleRate,
    );

    // Copy audio data to buffer
    for (let channel = 0; channel < this.channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = audioData[i * this.channels + channel];
      }
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Track this source
    this.activeSources.push(source);

    // Schedule this chunk to play after the previous one
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextScheduledTime);
    source.start(startTime);

    // Update next scheduled time (when this chunk will finish)
    this.nextScheduledTime = startTime + audioBuffer.duration;

    // Listen for when playback finishes
    source.onended = () => {
      // Remove from active sources
      const index = this.activeSources.indexOf(source);
      if (index > -1) {
        this.activeSources.splice(index, 1);
      }

      // Check if playback is complete
      this.checkPlaybackComplete();
    };
  }

  checkPlaybackComplete() {
    // Playback is complete when:
    // 1. Stream is marked complete (WebSocket closed after receiving all data)
    // 2. No more chunks in queue
    // 3. No active audio sources playing
    if (
      this.streamComplete &&
      this.audioQueue.length === 0 &&
      this.activeSources.length === 0
    ) {
      this.updatePlayState(false);
      this.updateStatus("Complete");
    }
  }

  async processAudioQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift();
      await this.playAudioChunk(audioData);
    }

    this.isProcessingQueue = false;
  }

  connectWebSocket() {
    const articleId = this.getAttribute("article-id");
    if (!articleId) {
      console.error("No article-id attribute");
      return;
    }

    // Determine protocol (ws or wss)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/tts/${articleId}`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.addEventListener("open", () => {
      this.updatePlayState(true);

      // Start checking for stream completion
      this.completionCheckInterval = setInterval(() => {
        if (
          this.lastChunkTime &&
          Date.now() - this.lastChunkTime > STREAM_COMPLETION_TIMEOUT_MS
        ) {
          this.streamComplete = true;
          this.checkPlaybackComplete();
          if (this.completionCheckInterval) {
            clearInterval(this.completionCheckInterval);
            this.completionCheckInterval = null;
          }
        }
      }, 500); // Check every 500ms
    });

    this.ws.addEventListener("message", async (event) => {
      if (typeof event.data === "string") {
        // Text message (status)
        const message = JSON.parse(event.data);

        if (message.type === "error") {
          console.error("TTS error:", message.message);
          this.stop();
          this.updateStatus(`Error: ${message.message}`);
        } else if (message.type === "complete") {
          // Audio generation complete - mark stream as done
          this.streamComplete = true;
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
          // Check if we're already done playing
          this.checkPlaybackComplete();
        }
      } else {
        // Binary message (audio chunk)
        const bytes = new Uint8Array(event.data);
        this.lastChunkTime = Date.now(); // Update last chunk timestamp

        // Check if this chunk contains the WAV header (first chunk)
        if (!this.wavHeader && bytes.length >= 44) {
          // Check for RIFF signature to confirm it's a WAV header
          const signature = String.fromCharCode(...bytes.slice(0, 4));
          if (signature === "RIFF") {
            // Parse header from first 44 bytes
            this.parseWAVHeader(bytes.slice(0, 44));
            this.wavHeader = bytes.slice(0, 44);

            // If there's audio data after the header, process it
            if (bytes.length > 44) {
              const audioData = this.convertPCMToFloat32(bytes.slice(44));
              this.audioQueue.push(audioData);
              this.processAudioQueue();
            }
          } else {
            // No header found, just process as audio data
            const audioData = this.convertPCMToFloat32(bytes);
            this.audioQueue.push(audioData);
            this.processAudioQueue();
          }
        } else {
          // Subsequent chunks are just audio data
          const audioData = this.convertPCMToFloat32(bytes);
          this.audioQueue.push(audioData);
          this.processAudioQueue();
        }
      }
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      // Don't reset playing state - audio might still be in queue
    });

    this.ws.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      this.stop();
      this.updateStatus("Connection error");
    });
  }

  play() {
    if (this.isPaused) {
      // Resume from pause
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
      this.isPaused = false;
      this.updatePlayState(true);
      return;
    }

    // Initialize AudioContext
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    // Reset state for new playback
    this.nextScheduledTime = 0;
    this.activeSources = [];
    this.streamComplete = false;
    this.lastChunkTime = null;

    // Set up Media Session
    this.setAudioMetadata();

    // Connect WebSocket
    this.connectWebSocket();
  }

  pause() {
    if (this.audioContext && this.audioContext.state === "running") {
      this.audioContext.suspend();
      this.isPaused = true;
      this.updatePlayState(false);
    }
  }

  stop() {
    this.cleanup();
    this.updatePlayState(false);
    this.updateStatus("");
  }

  updatePlayState(playing) {
    this.isPlaying = playing;
    const playBtn = this.shadowRoot.querySelector("#play-btn");
    const pauseBtn = this.shadowRoot.querySelector("#pause-btn");
    const stopBtn = this.shadowRoot.querySelector("#stop-btn");

    if (playing) {
      playBtn.style.display = "none";
      pauseBtn.style.display = "inline-block";
      stopBtn.style.display = "inline-block";
    } else {
      playBtn.style.display = "inline-block";
      pauseBtn.style.display = "none";
      stopBtn.style.display = this.isPaused ? "inline-block" : "none";
    }
  }

  updateStatus(status) {
    const statusEl = this.shadowRoot.querySelector("#status");
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  render() {
    if (this.shadowRoot.innerHTML.trim() !== "") return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 2rem;
        }
        .player {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          background: #007bff;
          color: white;
          cursor: pointer;
          font-size: 14px;
        }
        button:hover {
          background: #0056b3;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        #status {
          margin-left: auto;
          font-size: 14px;
          color: #666;
        }
      </style>
      <div class="player">
        <button id="play-btn" type="button">▶ Play</button>
        <button id="pause-btn" type="button" style="display:none;">⏸ Pause</button>
        <button id="stop-btn" type="button" style="display:none;">⏹ Stop</button>
        <span id="status"></span>
      </div>
    `;

    // Add event listeners
    this.shadowRoot
      .querySelector("#play-btn")
      .addEventListener("click", () => this.play());
    this.shadowRoot
      .querySelector("#pause-btn")
      .addEventListener("click", () => this.pause());
    this.shadowRoot
      .querySelector("#stop-btn")
      .addEventListener("click", () => this.stop());
  }
}

customElements.define("ws-audio-player", WSAudioPlayer);
