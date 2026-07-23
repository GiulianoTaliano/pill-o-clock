/**
 * Tests for the delta-encoded NDC database decoder (F2). The bundled asset is
 * mocked with a tiny stream built the same way build-ndc-db.mjs encodes it.
 */
import { lookupNdc9 } from "../src/services/ndcDb";

// Hoisted above the import by babel-jest; the factory is self-contained.
jest.mock("../assets/ndc-db.json", () => {
  const entries: [number, number][] = [
    [123456789, 0],
    [123456800, 1],
    [500000000, 0],
  ];
  let prev = 0;
  const ndc9 = entries
    .map(([n, i]) => {
      const token = `${(n - prev).toString(36)}:${i.toString(36)}`;
      prev = n;
      return token;
    })
    .join(";");
  return { sxdgs: [500, 600], ndc9 };
});

describe("ndcDb decoding", () => {
  it("decodes the delta-encoded stream into working lookups", () => {
    expect(lookupNdc9("123456789")).toBe("500");
    expect(lookupNdc9("123456800")).toBe("600");
    expect(lookupNdc9("500000000")).toBe("500");
  });

  it("misses cleanly", () => {
    expect(lookupNdc9("999999999")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(lookupNdc9("12345")).toBeNull();
    expect(lookupNdc9("abcdefghi")).toBeNull();
  });
});
