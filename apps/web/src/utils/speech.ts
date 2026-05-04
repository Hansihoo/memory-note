export interface SpeakOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface SpeechDriver {
  isAvailable(): boolean;
  speak(text: string, options?: SpeakOptions): void | Promise<void>;
  stop(): void;
}

export function detectSpeechLanguage(text: string): string {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text) ? "ko-KR" : "en-US";
}

export function createBrowserSpeechDriver(): SpeechDriver {
  function getSynthesis(): SpeechSynthesis | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }
    return window.speechSynthesis;
  }

  function getUtterance(): typeof SpeechSynthesisUtterance | null {
    return typeof SpeechSynthesisUtterance === "undefined" ? null : SpeechSynthesisUtterance;
  }

  return {
    isAvailable() {
      return Boolean(getSynthesis() && getUtterance());
    },
    speak(text, options = {}) {
      const normalized = text.trim();
      const synthesis = getSynthesis();
      const Utterance = getUtterance();
      if (!normalized || !synthesis || !Utterance) {
        return;
      }

      synthesis.cancel();
      const utterance = new Utterance(normalized);
      utterance.lang = options.lang ?? detectSpeechLanguage(normalized);
      utterance.rate = options.rate ?? 0.95;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = options.volume ?? 1;
      synthesis.speak(utterance);
    },
    stop() {
      getSynthesis()?.cancel();
    }
  };
}
