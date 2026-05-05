import { ReviewRating } from "@memory-note/core";
import { describe, expect, it } from "vitest";

import { createMobileReviewPayload } from "./reviewPayload";

describe("createMobileReviewPayload", () => {
  it("uses MOBILE platform and a stable mobile client event prefix", () => {
    const payload = createMobileReviewPayload("42", ReviewRating.GOOD);

    expect(payload.rating).toBe("GOOD");
    expect(payload.platform).toBe("MOBILE");
    expect(payload.clientEventId).toMatch(/^mobile-42-GOOD-/);
  });
});
