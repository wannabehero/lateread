/**
 * MediaSession API integration for article audio player
 * Sets metadata for iOS lock screen and control center
 */

/**
 * Set MediaSession metadata for the given audio element
 * Called via hx-on:play attribute
 * @param {HTMLAudioElement} audioElement - The audio element
 */
window.setAudioMetadata = (audioElement) => {
  if (!("mediaSession" in navigator)) {
    return;
  }

  const title = audioElement.dataset.title;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title,
    album: "lateread",
    artwork: [
      {
        src: "/public/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  });
};
