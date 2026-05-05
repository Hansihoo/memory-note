import { describe, expect, it } from "vitest";

import { mobileCoreProbe } from "./coreProbe";

describe("mobileCoreProbe", () => {
  it("imports shared core study primitives", () => {
    expect(mobileCoreProbe()).toEqual({
      platform: "MOBILE",
      defaultRating: "GOOD",
      prompt: "hello"
    });
  });
});
