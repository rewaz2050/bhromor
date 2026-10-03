import { describe, expect, it } from "vitest";
import {
  FEEDBACK_TAGS, MAX_COMMENT, feedbackSummary, needsStaffAttention, parseFeedbackInput, tagLabel,
} from "../delivery-feedback";

describe("parseFeedbackInput", () => {
  it("keeps known tags once, trims and collapses the words", () => {
    const r = parseFeedbackInput({ tags: ["late", "late", "hacker", 5, "rude"], comment: "  came   very\nlate  " });
    expect(r).toEqual({ ok: true, input: { tags: ["late", "rude"], comment: "came very late" } });
  });
  it("accepts tags alone or words alone, but never nothing", () => {
    expect(parseFeedbackInput({ tags: ["fast"] }).ok).toBe(true);
    expect(parseFeedbackInput({ comment: "thanks" }).ok).toBe(true);
    expect(parseFeedbackInput({ tags: ["nope"], comment: "   " }).ok).toBe(false);
    expect(parseFeedbackInput(null).ok).toBe(false);
    expect(parseFeedbackInput({ tags: "late" }).ok).toBe(false);
  });
  it("cuts an over-long comment and caps tags at 5", () => {
    const r = parseFeedbackInput({ tags: [...FEEDBACK_TAGS], comment: "x".repeat(900) });
    expect(r.ok && r.input.comment.length).toBe(MAX_COMMENT);
    expect(r.ok && r.input.tags.length).toBe(5);
  });
});

describe("needsStaffAttention", () => {
  it("fires for 1–2 stars or any complaint tag; not for a happy 5★ with praise", () => {
    expect(needsStaffAttention(1, [])).toBe(true);
    expect(needsStaffAttention(2, ["polite"])).toBe(true);
    expect(needsStaffAttention(4, ["late"])).toBe(true);
    expect(needsStaffAttention(3, [])).toBe(false);
    expect(needsStaffAttention(5, ["fast", "polite"])).toBe(false);
  });
});

describe("labels and summaries", () => {
  it("labels in both languages; unknown tags stay as they are", () => {
    expect(tagLabel("late", "en")).toBe("Arrived late");
    expect(tagLabel("late", "bn")).toBe("দেরিতে এসেছে");
    expect(tagLabel("zzz")).toBe("zzz");
  });
  it("one line: reasons then the quoted words", () => {
    expect(feedbackSummary({ tags: ["late", "rude"], comment: "bad" })).toBe("Arrived late · Rude · “bad”");
    expect(feedbackSummary({ tags: [], comment: "" })).toBe("");
  });
});
