import { describe, expect, it } from "vitest";
import {
  arraysEqual,
  changedKeys,
  newIdempotencyKey,
  omitUndefined,
  sortedCopy,
} from "../src/util";

describe("util", () => {
  it("arraysEqual", () => {
    expect(arraysEqual(undefined, undefined)).toBe(true);
    expect(arraysEqual(["a"], ["a"])).toBe(true);
    expect(arraysEqual(["a"], ["b"])).toBe(false);
    expect(arraysEqual(["a"], ["a", "b"])).toBe(false);
    expect(arraysEqual(null, [])).toBe(true);
  });

  it("sortedCopy", () => {
    expect(sortedCopy(["b", "a"])).toEqual(["a", "b"]);
    expect(sortedCopy(undefined)).toEqual([]);
  });

  it("changedKeys", () => {
    expect(changedKeys({ a: 1, b: ["x"] }, { a: 2, b: ["x"] }, ["a", "b"])).toEqual(["a"]);
    expect(changedKeys({ b: ["x"] }, { b: ["y"] }, ["b"])).toEqual(["b"]);
    expect(changedKeys({ a: 1 }, { a: 1 }, ["a"])).toEqual([]);
  });

  it("omitUndefined", () => {
    expect(omitUndefined({ a: 1, b: undefined, c: "" })).toEqual({ a: 1, c: "" });
  });

  it("newIdempotencyKey", () => {
    const k = newIdempotencyKey("scenario");
    expect(k.startsWith("scenario-")).toBe(true);
    expect(k.length).toBeGreaterThan(12);
  });
});
