import { describe, expect, it } from "vitest";
import { extractChildAge } from "../src/extract";

describe("extractChildAge", () => {
  it("цифры с разными формами слова", () => {
    expect(extractChildAge("Малышу 2 годика")).toBe(2);
    expect(extractChildAge("нам 3 года, хотим на экскурсию")).toBe(3);
    expect(extractChildAge("Ребёнку 5 лет")).toBe(5);
    expect(extractChildAge("4 год")).toBe(4);
  });

  it("дробный возраст округляется вниз", () => {
    expect(extractChildAge("Дочке 2,5 года")).toBe(2);
    expect(extractChildAge("нам 3.5 года")).toBe(3);
  });

  it("возраст словами", () => {
    expect(extractChildAge("ему два годика")).toBe(2);
    expect(extractChildAge("дочке три года")).toBe(3);
    expect(extractChildAge("сыну пять лет")).toBe(5);
  });

  it("«нам годик» — это один год", () => {
    expect(extractChildAge("нам годик всего")).toBe(1);
  });

  it("не путает года-даты и взрослый возраст", () => {
    expect(extractChildAge("мы записались в 2019 году")).toBeUndefined();
    expect(extractChildAge("мне 35 лет")).toBeUndefined();
    expect(extractChildAge("10 лет")).toBeUndefined();
  });

  it("без возраста — undefined", () => {
    expect(extractChildAge("Здравствуйте, сколько стоит?")).toBeUndefined();
    expect(extractChildAge(undefined)).toBeUndefined();
    expect(extractChildAge("")).toBeUndefined();
  });
});
