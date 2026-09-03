import type { AssessmentItem } from '@/domain/assessment'
const optionList = (labels: string[]) => labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label }))
const relationships = ['Quantity A is greater.', 'Quantity B is greater.', 'The two quantities are equal.', 'The relationship cannot be determined from the information given.']
type Comparison = [information: string, a: string, b: string, answer: string]
const comparisons: Comparison[] = [
  ['x > 0', 'x + 1', 'x', 'a'],
  ['x² = 16', 'x', '0', 'd'],
  ['A rectangle has sides 4 and 7.', 'Its perimeter', '22', 'c'],
  ['0 < p < 1', 'p²', 'p', 'b'],
  ['The mean of five numbers is 12.', 'Their sum', '60', 'c'],
  ['n is an integer greater than 2.', 'n²', '2n', 'a'],
  ['a and b are positive and a + b = 10.', 'ab', '25', 'd'],
  ['A fair six-sided die is rolled once.', 'Probability of rolling an even number', 'Probability of rolling a number less than 5', 'b'],
]
type Single = [question: string, choices: string[], answer: string]
const singles: Single[] = [
  ['A machine fills 150 bottles in 6 minutes at a constant rate. How many bottles does it fill in 14 minutes?', ['250', '300', '325', '350', '400'], 'd'],
  ['If 3(2x - 5) = 27, what is x?', ['4', '5', '6', '7', '9'], 'd'],
  ['A price decreases by 20% and then increases by 25%. The final price is what percent of the original price?', ['80%', '95%', '100%', '105%', '125%'], 'c'],
  ['The median of the numbers 3, 8, 11, 15, and k is 11. Which of the following could be k?', ['1', '4', '7', '9', '13'], 'e'],
  ['A circular garden has radius 6 meters. What is its circumference in meters?', ['6π', '12π', '18π', '24π', '36π'], 'b'],
  ['If f(x) = x² - 3x, what is f(-2)?', ['-10', '-2', '2', '4', '10'], 'e'],
  ['A box contains 4 red and 6 blue balls. Two balls are drawn without replacement. What is the probability that both are red?', ['2/15', '4/25', '1/5', '4/15', '2/5'], 'a'],
  ['A train travels 90 kilometers at 60 km/h and another 90 kilometers at 90 km/h. What is its average speed over the whole journey?', ['65 km/h', '70 km/h', '72 km/h', '75 km/h', '80 km/h'], 'c'],
  ['Which expression is equal to 8^4 divided by 4^3?', ['2^3', '2^4', '2^5', '2^6', '2^7'], 'd'],
  ['A company has 40 employees. If 30% work remotely and one quarter of the remaining employees work part-time, how many employees work part-time and do not work remotely?', ['3', '7', '10', '12', '28'], 'b'],
]
type Multiple = [question: string, choices: string[], answers: string[]]
const multiples: Multiple[] = [
  ['Which of the following are factors of 36? Select all that apply.', ['4', '5', '6', '8', '9'], ['a', 'c', 'e']],
  ['For which values of x is x² - 5x + 6 = 0? Select all that apply.', ['-3', '-2', '0', '2', '3'], ['d', 'e']],
  ['Which expressions are odd for every integer n? Select all that apply.', ['2n + 1', 'n²', '4n - 3', 'n(n + 1)', '6n + 5'], ['a', 'c', 'e']],
  ['Which lengths can be the third side of a triangle whose other sides have lengths 5 and 8? Select all that apply.', ['3', '4', '8', '12', '13'], ['b', 'c', 'd']],
]
type Numeric = [question: string, answer: number]
const numerics: Numeric[] = [
  ['The sum of three consecutive integers is 72. What is the largest integer?', 25],
  ['A mixture contains 12 liters of water and 3 liters of concentrate. What percent of the mixture is concentrate?', 20],
  ['If 5^x = 125 and 2^y = 16, what is x + y?', 7],
  ['The standard deviation of a data set is 4. If every value is multiplied by 3, what is the standard deviation of the new data set?', 12],
  ['A rectangle has area 96 and length 12. What is its perimeter?', 40],
]
export function quantitativeExample(module: 0 | 1): AssessmentItem[] {
  const comparisonItems = comparisons.slice(module * 4, module * 4 + 4).map(([information, a, b, answer], i): AssessmentItem => ({
    id: `gre-q${module + 1}-compare-${i + 1}`, domain: 'Quantitative Reasoning', skill: 'Quantitative comparison',
    stimulus: [{ type: 'math', expression: `${information}\nQuantity A: ${a}\nQuantity B: ${b}` }], prompt: [{ type: 'text', text: 'Compare Quantity A and Quantity B.' }],
    interaction: { type: 'single_choice', options: optionList(relationships) }, scoring: { type: 'exact', answer },
  }))
  const singleItems = singles.slice(module === 0 ? 0 : 4, module === 0 ? 4 : 10).map(([question, choices, answer], i): AssessmentItem => ({
    id: `gre-q${module + 1}-choice-${i + 1}`, domain: 'Quantitative Reasoning', skill: 'Problem solving', stimulus: [], prompt: [{ type: 'text', text: question }],
    interaction: { type: 'single_choice', options: optionList(choices) }, scoring: { type: 'exact', answer },
  }))
  const multipleItems = multiples.slice(module * 2, module * 2 + 2).map(([question, choices, answers], i): AssessmentItem => ({
    id: `gre-q${module + 1}-multiple-${i + 1}`, domain: 'Quantitative Reasoning', skill: 'Multiple-answer problem solving', stimulus: [], prompt: [{ type: 'text', text: question }],
    interaction: { type: 'multiple_choice', minimumSelections: 1, maximumSelections: choices.length, options: optionList(choices) }, scoring: { type: 'set', answers },
  }))
  const numericItems = numerics.slice(module === 0 ? 0 : 2, module === 0 ? 2 : 5).map(([question, answer], i): AssessmentItem => ({
    id: `gre-q${module + 1}-numeric-${i + 1}`, domain: 'Quantitative Reasoning', skill: 'Numeric entry', stimulus: [], prompt: [{ type: 'text', text: question }],
    interaction: { type: 'numeric_entry' }, scoring: { type: 'numeric', answer },
  }))
  if (module === 1) singleItems[5] = {
    id: 'gre-q2-choice-6', domain: 'Quantitative Reasoning', skill: 'Data interpretation',
    stimulus: [{ type: 'table', caption: 'Shipments in thousands of units', columns: ['Warehouse', 'Year 1', 'Year 2'], rows: [['North', '40', '48'], ['Central', '50', '65'], ['South', '80', '96']] }],
    prompt: [{ type: 'text', text: 'Which warehouse had the greatest percentage increase in shipments from Year 1 to Year 2?' }],
    interaction: { type: 'single_choice', options: optionList(['North', 'Central', 'South', 'North and South were tied for greatest.', 'All three had the same percentage increase.']) },
    scoring: { type: 'exact', answer: 'b' }, presentation: { layout: 'split', stimulusLabel: 'Data' },
  }
  return [...comparisonItems, ...singleItems, ...multipleItems, ...numericItems]
}
