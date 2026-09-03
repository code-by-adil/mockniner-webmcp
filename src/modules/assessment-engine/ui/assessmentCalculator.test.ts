import { describe, expect, it } from "vitest";
import { calculatorReducer, initialCalculatorState } from "./assessmentCalculator";

const enter = (...keys: string[]) => keys.reduce(calculatorReducer, initialCalculatorState);

describe("assessment calculator", () => {
  it("resolves pending arithmetic before continuing a chain", () => {
    expect(enter("2", "+", "3", "+", "4", "=").display).toBe("9");
    expect(enter("2", "+", "3", "×", "4", "=").display).toBe("20");
  });
  it("replaces an operator before the next operand is entered", () => {
    expect(enter("8", "+", "−", "3", "=").display).toBe("5");
    expect(enter("8", "+", "=", "3", "=").display).toBe("11");
  });
  it("starts decimal operands at zero and ignores duplicate decimal points", () => {
    expect(enter(".", "5", ".", "+", ".", "2", "5", "=").display).toBe("0.75");
    expect(enter("0", ".", "1", "+", "0", ".", "2", "=").display).toBe("0.3");
  });
  it("deletes digits only from the operand being entered", () => {
    expect(enter("1", "2", "Delete", "3").display).toBe("13");
    expect(enter("1", "Delete", "Delete").display).toBe("0");
    expect(enter("8", "+", "Delete", "3", "=").display).toBe("11");
  });
  it("clears division errors and starts a new calculation after a result", () => {
    expect(enter("2", "÷", "0", "=")).toMatchObject({ display: "Error", pending: null });
    expect(enter("2", "÷", "0", "=", "5", "+", "1", "=").display).toBe("6");
    expect(enter("2", "÷", "0", "=", "Delete")).toEqual(initialCalculatorState);
    expect(enter("2", "+", "3", "=", "7").display).toBe("7");
    expect(enter("2", "+", "3", "=", "Clear")).toEqual(initialCalculatorState);
  });
});
