import { describe, expect, it } from "vitest";

import { detectExtensionSpeechLanguage } from "./speech";

describe("extension speech", () => {
  it("detects Korean and English speech languages", () => {
    expect(detectExtensionSpeechLanguage("여권")).toBe("ko-KR");
    expect(detectExtensionSpeechLanguage("passport")).toBe("en-US");
  });
});
