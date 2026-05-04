export interface ExtensionSpeechDriver {
  isAvailable(): boolean;
  speak(text: string): void;
  stop(): void;
}

export function detectExtensionSpeechLanguage(text: string): string {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text) ? "ko-KR" : "en-US";
}

export function createExtensionSpeechDriver(): ExtensionSpeechDriver {
  function getSynthesis(): SpeechSynthesis | null {
    return typeof speechSynthesis === "undefined" ? null : speechSynthesis;
  }

  function getUtterance(): typeof SpeechSynthesisUtterance | null {
    return typeof SpeechSynthesisUtterance === "undefined"
      ? null
      : SpeechSynthesisUtterance;
  }

  return {
    isAvailable() {
      return Boolean(getSynthesis() && getUtterance());
    },
    speak(text) {
      const normalized = text.trim();
      const synthesis = getSynthesis();
      const Utterance = getUtterance();

      if (!normalized || !synthesis || !Utterance) {
        return;
      }

      synthesis.cancel();
      const utterance = new Utterance(normalized);
      utterance.lang = detectExtensionSpeechLanguage(normalized);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      synthesis.speak(utterance);
    },
    stop() {
      getSynthesis()?.cancel();
    },
  };
}
