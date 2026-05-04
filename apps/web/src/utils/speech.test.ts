import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserSpeechDriver, detectSpeechLanguage } from "./speech";

class FakeSpeechSynthesisUtterance {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;

  constructor(text: string) {
    this.text = text;
  }
}

describe("speech", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "speechSynthesis");
    vi.unstubAllGlobals();
  });

  it("detects Korean and English speech languages", () => {
    expect(detectSpeechLanguage("공항")).toBe("ko-KR");
    expect(detectSpeechLanguage("airport")).toBe("en-US");
  });

  it("uses the browser speech API through the replaceable driver", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel }
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);

    const driver = createBrowserSpeechDriver();
    driver.speak("공항", { rate: 0.8 });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "공항", lang: "ko-KR", rate: 0.8 });
  });

  it("stays quiet when browser speech is unavailable", () => {
    const driver = createBrowserSpeechDriver();

    expect(driver.isAvailable()).toBe(false);
    expect(() => driver.speak("airport")).not.toThrow();
    expect(() => driver.stop()).not.toThrow();
  });
});
