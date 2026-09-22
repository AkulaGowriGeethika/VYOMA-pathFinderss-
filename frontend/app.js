VYOMA Clean Voice Policy
Replacement JavaScript block. Remove older duplicate voice-filter and strict-policy blocks before adding this one.
/* =========================================================
 VYOMA CLEAN VOICE POLICY
 Replace ALL previous voice-filter / strict-policy blocks with this
 single block. Keep only your maneuver calls and GNSS calls.
========================================================= */
(() => {
 "use strict";
 if (window.__VYOMA_CLEAN_VOICE_POLICY__) return;
 window.__VYOMA_CLEAN_VOICE_POLICY__ = true;
 const synth = window.speechSynthesis;
 if (!synth || typeof synth.speak !== "function") return;
 const toggleIds = [
 "settingsVoiceToggle",
 "voiceGuidanceToggle",
 "voiceAssistance",
 "voice-assistance"
 ];
 function voiceEnabled() {
 const toggle = toggleIds
 .map(id => document.getElementById(id))
 .find(el => el && "checked" in el);
 // If a real toggle exists, it is the only authority.
 if (toggle) return toggle.checked === true;
 // No toggle means voice must remain OFF by default.
 return false;
 }
 const maneuverPattern =
 /\b(turn\s+(left|right)|continue\s+(straight|ahead)|go\s+straight|keep\s+(left|right)|bear\s+(left|right)|slight\s+(left|right)|sharp\s+(left|right const gnssPattern =
 /^\s*GNSS\s+signal\s+(lost|restored)\.?\s*$/i;
 function permitted(text) {
 const value = String(text || "").replace(/\s+/g, " ").trim();
 if (!value || !voiceEnabled()) return false;
 // Only exact GNSS notifications or actual maneuver instructions.
 return gnssPattern.test(value) || maneuverPattern.test(value);
 }
 const nativeSpeak = synth.speak.bind(synth);
 synth.speak = function (utterance) {
 const text = String(utterance?.text || "");
 if (!permitted(text)) return;
 return nativeSpeak(utterance);
 };
 function guardedSpeak(text) {
 if (!permitted(text)) return;
 if (typeof window.__VYOMA_ORIGINAL_SPEAK === "function") {
 return window.__VYOMA_ORIGINAL_SPEAK(text);
 }
 }
 if (typeof window.vyomaSpeak === "function" &&
 !window.__VYOMA_ORIGINAL_SPEAK) {
 window.__VYOMA_ORIGINAL_SPEAK = window.vyomaSpeak;
 }
 window.vyomaSpeakGuidance = guardedSpeak;
 // Stop speech immediately when either supported toggle is switched off.
 document.addEventListener("change", event => {
 const el = event.target;
 if (el && toggleIds.includes(el.id) && !el.checked) {
 synth.cancel();
 }
 });
 // Public helper for the two permitted GNSS messages.
 window.vyomaSpeakGnss = function (state) {
 const message =
 state === "lost"
 ? "GNSS signal lost."
 : state === "restored"
 ? "GNSS signal restored."
 : "";
 guardedSpeak(message);
 };
})();

/* =========================================================
   VYOMA FINAL VOICE CONTROL
   Speak ONLY:
   1. Actual maneuver directions
   2. GNSS signal lost.
   3. GNSS signal restored.

   Voice OFF = complete silence.
========================================================= */

(function installVYOMAVoiceControl() {
  "use strict";

  if (window.__VYOMA_FINAL_VOICE_CONTROL__) {
    return;
  }

  window.__VYOMA_FINAL_VOICE_CONTROL__ = true;

  const synth = window.speechSynthesis;

  const getElement = (id) => {
    return document.getElementById(id);
  };

  /*
    Check whether voice assistance is enabled.

    The settings toggle takes priority.
    The guidance toggle is used if settings toggle
    does not exist.

    If neither toggle exists, voice is OFF.
  */
  function isVoiceEnabled() {
    const settingsToggle = getElement("settingsVoiceToggle");
    const guidanceToggle = getElement("voiceGuidanceToggle");

    if (settingsToggle) {
      return settingsToggle.checked === true;
    }

    if (guidanceToggle) {
      return guidanceToggle.checked === true;
    }

    return false;
  }

  /*
    Normalize speech text.
  */
  function cleanText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
    Exact GNSS messages that are permitted.
  */
  const gnssPattern =
    /^GNSS signal (lost|restored)\.?$/i;

  /*
    Actual maneuver directions that are permitted.

    Status messages, arrival messages, and route
    messages are excluded.
  */
  const maneuverPattern =
    /\b(
      turn\s+(left|right)|
      continue\s+(straight|ahead)|
      go\s+straight|
      keep\s+(left|right)|
      bear\s+(left|right)|
      slight\s+(left|right)|
      sharp\s+(left|right)|
      make\s+a\s+(left|right)\s+turn|
      enter\s+(the\s+)?roundabout|
      take\s+the\s+(first|second|third|fourth)\s+exit|
      merge
    )\b/ix;

  /*
    Forbidden words and phrases.

    Any sentence containing these terms will
    be blocked from speech.
  */
  const blockedPattern =
    /\b(
      destination|
      coordinates?|
      latitude|
      longitude|
      calculate|
      calculating|
      route|
      navigation|
      navigating|
      not\s+navigating|
      ready|
      started|
      starting|
      stopped|
      recalculating|
      searching|
      dead\s+reckoning|
      current\s+location|
      pothole|
      bump|
      arrival|
      arrived|
      arrive|
      voice\s+guidance|
      voice\s+assistance|
      status|
      command|
      understood|
      enabled|
      disabled|
      system
    )\b/ix;

  /*
    Decide whether a message is permitted.
  */
  function isAllowedMessage(text) {
    const message = cleanText(text);

    if (!message) {
      return false;
    }

    if (!isVoiceEnabled()) {
      return false;
    }

    /*
      GNSS messages are allowed only when they
      match the exact permitted format.
    */
    if (gnssPattern.test(message)) {
      return true;
    }

    /*
      Block status and non-guidance messages.
    */
    if (blockedPattern.test(message)) {
      return false;
    }

    /*
      Only actual maneuver directions are allowed.
    */
    return maneuverPattern.test(message);
  }

  /*
    Stop any current speech.
  */
  function stopSpeech() {
    if (synth) {
      synth.cancel();
    }
  }

  /*
    Main safe speech function.
  */
  function speakAllowed(text) {
    const message = cleanText(text);

    if (!isAllowedMessage(message)) {
      return false;
    }

    if (!synth || typeof synth.speak !== "function") {
      return false;
    }

    stopSpeech();

    const languageElement = getElement("voiceLanguage");

    const utterance = new SpeechSynthesisUtterance(message);

    utterance.lang =
      languageElement && languageElement.value
        ? languageElement.value
        : "en-IN";

    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    synth.speak(utterance);

    return true;
  }

  /*
    Public speech functions.

    All spoken output must pass through the
    same allow-list.
  */
  window.vyomaSpeak = function(text) {
    return speakAllowed(text);
  };

  window.vyomaSpeakGuidance = function(text) {
    return speakAllowed(text);
  };

  window.vyomaSpeakManeuver = function(text) {
    return speakAllowed(text);
  };

  /*
    Use this function for GNSS state changes.

    Examples:
      window.vyomaSpeakGnss("lost");
      window.vyomaSpeakGnss("restored");
  */
  window.vyomaSpeakGnss = function(state) {
    if (state === "lost") {
      return speakAllowed("GNSS signal lost.");
    }

    if (state === "restored") {
      return speakAllowed("GNSS signal restored.");
    }

    return false;
  };

  /*
    Keep speech synthesis protected even if another
    part of the application calls speechSynthesis.speak()
    directly.
  */
  if (
    synth &&
    typeof synth.speak === "function" &&
    !window.__VYOMA_NATIVE_SPEAK_PROTECTED__
  ) {
    window.__VYOMA_NATIVE_SPEAK_PROTECTED__ = true;

    const nativeSpeak = synth.speak.bind(synth);

    synth.speak = function(utterance) {
      const message = cleanText(
        utterance && utterance.text
      );

      if (!isAllowedMessage(message)) {
        return;
      }

      return nativeSpeak(utterance);
    };
  }

  /*
    Turning voice OFF immediately stops speech.
  */
  function registerToggle(toggle) {
    if (!toggle) {
      return;
    }

    toggle.addEventListener("change", function() {
      if (!toggle.checked) {
        stopSpeech();
      }
    });
  }

  registerToggle(
    getElement("settingsVoiceToggle")
  );

  registerToggle(
    getElement("voiceGuidanceToggle")
  );

  /*
    Cancel speech when the page is hidden.
  */
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      stopSpeech();
    }
  });

  /*
    Public utility for stopping speech.
  */
  window.vyomaStopSpeech = stopSpeech;

  console.log(
    "VYOMA voice control installed: maneuver and GNSS messages only."
  );
})();
