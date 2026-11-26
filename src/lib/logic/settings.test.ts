import { describe, expect, it } from "vitest";
import { lookupError, rateError } from "./settings";
import type { Lookup } from "../types";

const lookups: Lookup[] = [
  { kind: "destination", value: "MSFZ", sort: 1 },
  { kind: "port", value: "B2", sort: 1 },
];

describe("lookupError", () => {
  it("ค่าว่างไม่ได้", () => {
    expect(lookupError(lookups, "destination", "  ")).toBe("กรอกค่า");
  });
  it("ซ้ำในหมวดเดียวกันไม่ได้ (ไม่สนช่องว่างหน้าหลัง)", () => {
    expect(lookupError(lookups, "destination", " MSFZ ")).toBe("มี MSFZ อยู่แล้ว");
  });
  it("ซ้ำข้ามหมวดได้ และแก้ชื่อเป็นค่าเดิมของตัวเองได้", () => {
    expect(lookupError(lookups, "port", "MSFZ")).toBeNull();
    expect(lookupError(lookups, "destination", "MSFZ", "MSFZ")).toBeNull();
  });
});

describe("rateError", () => {
  it("ต้องมีปลายทางและราคาเป็นบวก", () => {
    expect(rateError({ destination: "", price: 100, max_tons: null })).toBe("กรอกปลายทาง");
    expect(rateError({ destination: "MSFZ", price: 0, max_tons: null })).toBe("ราคาต้องมากกว่า 0");
    expect(rateError({ destination: "MSFZ", price: Number.NaN, max_tons: null })).toBe("ราคาต้องมากกว่า 0");
  });
  it("น้ำหนักสูงสุดต้องเป็นบวกถ้ากรอก", () => {
    expect(rateError({ destination: "MSFZ", price: 16000, max_tons: -1 })).toBe("น้ำหนักสูงสุดต้องมากกว่า 0");
    expect(rateError({ destination: "MSFZ", price: 16000, max_tons: null })).toBeNull();
    expect(rateError({ destination: "MSFZ", price: 16000, max_tons: 20 })).toBeNull();
  });
});
