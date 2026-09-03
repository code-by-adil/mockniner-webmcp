type Operator = "+" | "−" | "×" | "÷";
export type CalculatorState = {
  display: string;
  pending: { left: number; operator: Operator } | null;
  replaceDisplay: boolean;
};
export const initialCalculatorState: CalculatorState = { display: "0", pending: null, replaceDisplay: true };

function calculate(left: number, right: number, operator: Operator): number {
  if (operator === "+") return left + right;
  if (operator === "−") return left - right;
  if (operator === "×") return left * right;
  return right === 0 ? Number.NaN : left / right;
}

export function calculatorReducer(state: CalculatorState, key: string): CalculatorState {
  if (key === "Clear") return initialCalculatorState;
  if (key === "Delete") {
    if (state.display === "Error") return initialCalculatorState;
    if (state.replaceDisplay) return state;
    const shortened = state.display.slice(0, -1);
    return { ...state, display: shortened && shortened !== "−" && shortened !== "-" ? shortened : "0" };
  }
  if (key === "." || /^[0-9]$/.test(key)) {
    const current = state.replaceDisplay ? "0" : state.display;
    const display = key === "."
      ? current.includes(".") ? current : `${current}.`
      : current === "0" ? key : `${current}${key}`;
    return { ...state, display, replaceDisplay: false };
  }
  if (key !== "=" && key !== "+" && key !== "−" && key !== "×" && key !== "÷") return state;
  if (state.display === "Error") return state;
  if (key === "=" && (!state.pending || state.replaceDisplay)) return state;
  const resolving = state.replaceDisplay ? null : state.pending;
  const value = resolving
    ? calculate(resolving.left, Number(state.display), resolving.operator)
    : Number(state.display);
  if (!Number.isFinite(value)) return { display: "Error", pending: null, replaceDisplay: true };
  const display = resolving ? String(Number(value.toPrecision(12))) : state.display;
  return { display, pending: key === "=" ? null : { left: Number(display), operator: key }, replaceDisplay: true };
}
