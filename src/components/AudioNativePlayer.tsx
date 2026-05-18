import type { FC } from "hono/jsx";

const PUBLIC_USER_ID =
  "f1068c235c8ee06adbae638770bfd1dc7c5b0a7bc555d50610b3aeb55fce6dd2";

export const AudioNativePlayer: FC = () => {
  return (
    <>
      <script
        src="https://elevenlabs.io/player/audioNativeHelper.js"
        type="text/javascript"
      ></script>
      <div
        id="elevenlabs-audionative-widget"
        data-height="90"
        data-width="100%"
        data-frameborder="no"
        data-scrolling="no"
        data-publicuserid={PUBLIC_USER_ID}
        data-playerurl="https://elevenlabs.io/player/index.html"
      >
        Loading the{" "}
        <a
          href="https://elevenlabs.io/text-to-speech"
          target="_blank"
          rel="noopener"
        >
          Elevenlabs Text to Speech
        </a>{" "}
        AudioNative Player...
      </div>
    </>
  );
};
