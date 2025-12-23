(() => {
  if (!("speechSynthesis" in window)) {
    document.getElementById("tts-listen").style.display = "none";
    return;
  }

  let utterance = null;
  let isPaused = false;
  let voices = [];

  const listenBtn = document.getElementById("tts-listen");
  const playerDiv = document.getElementById("tts-player");
  const playBtn = document.getElementById("tts-play");
  const pauseBtn = document.getElementById("tts-pause");
  const stopBtn = document.getElementById("tts-stop");
  const speedSelect = document.getElementById("tts-speed");
  const voiceSelect = document.getElementById("tts-voice");

  function createVoiceOption(voice, index) {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (voice.default) {
      option.textContent += " - Default";
    }
    return option;
  }

  function addVoiceGroup(label, voiceList) {
    if (voiceList.length === 0) return;

    const group = document.createElement("optgroup");
    group.label = label;
    voiceList.forEach(({ voice, index }) => {
      group.appendChild(createVoiceOption(voice, index));
    });
    voiceSelect.appendChild(group);
  }

  function loadVoices() {
    voices = speechSynthesis.getVoices();

    if (voices.length === 0) {
      return;
    }

    voiceSelect.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default Voice";
    voiceSelect.appendChild(defaultOption);

    const ttsControls = document.querySelector(".tts-controls");
    const articleLanguage = ttsControls?.dataset.language || "";

    const matchingVoices = [];
    const otherVoices = [];

    voices.forEach((voice, index) => {
      const voiceData = { voice, index };

      if (
        articleLanguage &&
        voice.lang.toLowerCase().startsWith(articleLanguage.toLowerCase())
      ) {
        matchingVoices.push(voiceData);
      } else {
        otherVoices.push(voiceData);
      }
    });

    if (articleLanguage) {
      addVoiceGroup(`${articleLanguage.toUpperCase()} Voices`, matchingVoices);
      addVoiceGroup("Other Voices", otherVoices);
    } else {
      addVoiceGroup("All Voices", otherVoices);
    }
  }

  loadVoices();
  speechSynthesis.addEventListener("voiceschanged", loadVoices);

  function extractText() {
    const contentDiv = document.querySelector(".reader-content");
    if (!contentDiv) return "";

    const clone = contentDiv.cloneNode(true);

    clone.querySelectorAll("script, style, img, svg").forEach((el) => {
      el.remove();
    });

    let text = clone.textContent || "";
    text = text.replace(/\s+/g, " ").trim();

    return text;
  }

  function updateButtonStates(playing) {
    if (playing) {
      playBtn.style.display = "none";
      pauseBtn.style.display = "inline-block";
    } else {
      playBtn.style.display = "inline-block";
      pauseBtn.style.display = "none";
    }
  }

  listenBtn.addEventListener("click", () => {
    const text = extractText();

    if (!text) {
      alert("No text content found to read");
      return;
    }

    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = parseFloat(speedSelect.value);

    const voiceIndex = voiceSelect.value;
    if (voiceIndex !== "") {
      utterance.voice = voices[parseInt(voiceIndex, 10)];
    }

    utterance.onend = () => {
      updateButtonStates(false);
      isPaused = false;
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      updateButtonStates(false);
      isPaused = false;
    };

    speechSynthesis.speak(utterance);

    listenBtn.style.display = "none";
    playerDiv.style.display = "flex";
    updateButtonStates(true);
    isPaused = false;
  });

  playBtn.addEventListener("click", () => {
    if (isPaused) {
      speechSynthesis.resume();
      updateButtonStates(true);
      isPaused = false;
    }
  });

  pauseBtn.addEventListener("click", () => {
    if (speechSynthesis.speaking && !isPaused) {
      speechSynthesis.pause();
      updateButtonStates(false);
      isPaused = true;
    }
  });

  stopBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    listenBtn.style.display = "inline-block";
    playerDiv.style.display = "none";
    updateButtonStates(false);
    isPaused = false;
    utterance = null;
  });

  function restartWithNewSettings() {
    if (!utterance) return;

    // Only proceed if actively playing or paused
    if (!isPaused && !speechSynthesis.speaking) return;

    const isCurrentlyPaused = isPaused;

    const text = extractText();

    // Clear callbacks first to prevent them from firing during cancel
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
    }
    utterance = null;
    speechSynthesis.cancel();

    if (isCurrentlyPaused) {
      // If was paused, reset to initial state
      // User needs to click Listen again
      listenBtn.style.display = "inline-block";
      playerDiv.style.display = "none";
      updateButtonStates(false);
      isPaused = false;
      utterance = null;
    } else {
      // If was playing, restart with new settings
      utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = parseFloat(speedSelect.value);

      const voiceIndex = voiceSelect.value;
      if (voiceIndex !== "") {
        utterance.voice = voices[parseInt(voiceIndex)];
      }

      utterance.onend = () => {
        updateButtonStates(false);
        isPaused = false;
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        updateButtonStates(false);
        isPaused = false;
      };

      speechSynthesis.speak(utterance);
      updateButtonStates(true);
      isPaused = false;
    }
  }

  speedSelect.addEventListener("change", restartWithNewSettings);
  voiceSelect.addEventListener("change", restartWithNewSettings);
})();
