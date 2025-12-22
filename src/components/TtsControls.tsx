import type { FC } from "hono/jsx";

export const TtsControls: FC = () => {
  return (
    <>
      <div class="tts-controls">
        <button type="button" id="tts-listen" class="tts-button">
          Listen
        </button>
        <div id="tts-player" class="tts-player" style="display: none;">
          <button type="button" id="tts-play" class="tts-button">
            Play
          </button>
          <button
            type="button"
            id="tts-pause"
            class="tts-button"
            style="display: none;"
          >
            Pause
          </button>
          <button type="button" id="tts-stop" class="tts-button">
            Stop
          </button>
          <select id="tts-speed" class="tts-speed">
            <option value="0.75">0.75x</option>
            <option value="1" selected>
              1x
            </option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <select id="tts-voice" class="tts-voice">
            <option value="">Loading voices...</option>
          </select>
        </div>
      </div>

      <script src="/public/scripts/tts-controls.js"></script>
    </>
  );
};
