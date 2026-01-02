import type { FC } from "hono/jsx";
import type { ReaderPreferences } from "../db/types";

interface ReaderControlsProps {
  preferences: ReaderPreferences;
}

export const ReaderControls: FC<ReaderControlsProps> = ({ preferences }) => {
  const { fontFamily, fontSize } = preferences;

  return (
    <form
      class="reader-controls"
      id="reader-controls-form"
      hx-post="/api/preferences/reader"
      hx-trigger="change delay:500ms"
      hx-swap="none"
    >
      {/* Hidden inputs for form submission */}
      <input
        type="hidden"
        name="fontFamily"
        id="font-family-input"
        value={fontFamily}
      />
      <input
        type="hidden"
        name="fontSize"
        id="font-size-input"
        value={fontSize.toString()}
      />

      <div class="reader-controls-section">
        <span class="reader-controls-label">Text</span>
        <div class="reader-controls-group">
          <button
            type="button"
            class={`reader-control-btn ${fontFamily === "sans" ? "active" : ""}`}
            data-font-family="sans"
            style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
          >
            Sans
          </button>
          <button
            type="button"
            class={`reader-control-btn ${fontFamily === "serif" ? "active" : ""}`}
            data-font-family="serif"
            style="font-family: Georgia, Cambria, 'Times New Roman', Times, serif;"
          >
            Serif
          </button>
          <button
            type="button"
            class={`reader-control-btn ${fontFamily === "new-york" ? "active" : ""}`}
            data-font-family="new-york"
            data-apple-only="true"
            style="font-family: 'New York', Charter, Georgia, serif;"
          >
            New York
          </button>
        </div>
        <div class="reader-controls-group reader-size-controls">
          <button
            type="button"
            class="reader-control-btn contrast"
            data-font-size-action="decrease"
            disabled={fontSize <= 14}
            title="Decrease font size"
          >
            <img
              src="/public/icons/a-arrow-down.svg"
              alt="Decrease"
              class="button-icon"
            />
          </button>
          <span class="reader-font-size-display" id="font-size-display">
            {fontSize}px
          </span>
          <button
            type="button"
            class="reader-control-btn contrast"
            data-font-size-action="increase"
            disabled={fontSize >= 24}
            title="Increase font size"
          >
            <img
              src="/public/icons/a-arrow-up.svg"
              alt="Increase"
              class="button-icon"
            />
          </button>
        </div>
      </div>
    </form>
  );
};
