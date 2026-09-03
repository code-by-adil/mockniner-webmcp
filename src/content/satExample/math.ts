import { choice, numeric } from '../satFullLength/helpers'
import type { AssessmentItem } from '@/domain/assessment'

type ChoiceRow = [domain: string, question: string, options: [string, string, string, string], answer: 'a' | 'b' | 'c' | 'd']
type NumericRow = [domain: string, question: string, answer: number]
const module1: ChoiceRow[] = [
  ['Algebra', 'A parking service charges a fixed fee of $6 plus $3 per hour. Which expression gives the total cost, in dollars, for h hours?', ["9h", "3h + 6", "3(h + 6)", "6h + 3"], 'b'],
  ['Algebra', 'Which ordered pair satisfies both y = 2x + 1 and x + y = 10?', ["(4, 6)", "(5, 11)", "(3, 7)", "(2, 5)"], 'c'],
  ['Algebra', 'The function f is defined by f(x) = 5x - 8. What is f(4)?', ["12", "28", "9", "-3"], 'a'],
  ['Algebra', 'A tank initially contains 240 liters of water and drains at 8 liters per minute. In the equation V = 240 - 8t, what does 8 represent?', ["The number of liters removed each minute", "The volume after one minute", "The number of minutes until the tank is empty", "The initial volume in liters"], 'a'],
  ['Advanced Math', 'Which expression is equivalent to x² + 7x + 12?', ["(x + 1)(x + 12)", "(x + 2)(x + 6)", "(x - 3)(x - 4)", "(x + 3)(x + 4)"], 'd'],
  ['Advanced Math', 'A population is modeled by P(t) = 800(1.05)^t. What percentage increase does the model predict for each one-unit increase in t?', ["105%", "0.05%", "50%", "5%"], 'd'],
  ['Advanced Math', 'The equation x² = 49 has two real solutions. What is their sum?', ["-14", "0", "7", "14"], 'b'],
  ['Advanced Math', 'For x ≠ 0, which expression is equivalent to (12x³)/(3x)?', ["9x²", "4x³", "4x²", "4x"], 'c'],
  ['Problem-Solving and Data Analysis', 'A recipe uses 3 cups of flour for every 2 cups of milk. How many cups of flour are needed when 8 cups of milk are used at the same ratio?', ["10", "6", "12", "16"], 'c'],
  ['Problem-Solving and Data Analysis', 'The values in a data set are 4, 6, 8, 10, and 12. What is the mean?', ["12", "6", "10", "8"], 'd'],
  ['Problem-Solving and Data Analysis', 'A store reduces the price of a $60 jacket by 25%. What is the sale price?', ["$15", "$45", "$75", "$35"], 'b'],
  ['Problem-Solving and Data Analysis', 'A random sample of 100 residents contains 62 who support a proposal. Which population can this sample most directly help describe if the sample was drawn from all adult residents of the town?', ["All adult residents of the town", "Only the 62 supporters", "All children in the town", "All residents of the country"], 'a'],
  ['Geometry and Trigonometry', 'A right triangle has legs of lengths 6 and 8. What is the length of its hypotenuse?', ["12", "14", "48", "10"], 'd'],
  ['Geometry and Trigonometry', 'A circle has radius 5. What is its area?', ["50π", "5π", "25π", "10π"], 'c'],
  ['Geometry and Trigonometry', 'Two similar triangles have corresponding side lengths in a ratio of 2 to 3. What is the ratio of their areas?', ["2 to 3", "8 to 27", "4 to 9", "1 to 3"], 'c'],
  ['Algebra', 'For which value of k does the equation 4x + 7 = 4x + k have infinitely many solutions?', ["0", "7", "4", "-7"], 'b'],
]
const numeric1: NumericRow[] = [
  ['Algebra', 'If 7x - 9 = 40, what is x?', 7],
  ['Algebra', 'A line passes through (2, 3) and (6, 15). What is its slope?', 3],
  ['Advanced Math', 'The function g is defined by g(x) = x² - 6x + 11. What is the minimum value of g(x) for real x?', 2],
  ['Advanced Math', 'If 2^(x + 1) = 32, what is x?', 4],
  ['Problem-Solving and Data Analysis', 'A bag contains 3 red, 5 blue, and 2 green counters. What is the probability of choosing a blue counter at random? Enter a decimal or fraction.', 0.5],
  ['Geometry and Trigonometry', 'A rectangular prism has length 4, width 5, and height 9. What is its volume?', 180],
]
const module2: ChoiceRow[] = [
  ['Algebra', 'A line has equation 3x + 2y = 18. What is its y-intercept?', ["9", "18", "6", "3"], 'a'],
  ['Algebra', 'Which inequality is equivalent to -3x + 5 > 17?', ["x > -4", "x < 4", "x < -4", "x > 4"], 'c'],
  ['Algebra', 'A service charges $18 per visit plus a one-time membership fee. Five visits cost $135. What is the membership fee?', ["$45", "$90", "$27", "$36"], 'a'],
  ['Algebra', 'For which value of k does the system 2x + 3y = 12 and 4x + 6y = k have infinitely many solutions?', ["12", "18", "20", "24"], 'd'],
  ['Advanced Math', 'Which expression is equivalent to (x + 5)² - (x - 5)²?', ["100", "2x² + 50", "20x", "10x"], 'c'],
  ['Advanced Math', 'The graph of y = (x - 4)² + 7 has its vertex at which point?', ["(-4, 7)", "(4, 7)", "(4, -7)", "(-4, -7)"], 'b'],
  ['Advanced Math', 'If x is positive and √(x + 5) = x - 1, what is x?', ["5", "4", "1", "2"], 'b'],
  ['Advanced Math', 'The function h is defined by h(x) = 3(x - 2)(x + 6). What is the product of its zeros?', ["-18", "4", "-12", "12"], 'c'],
  ['Advanced Math', 'A substance has initial mass 160 grams and loses half its mass every 4 days. Which expression gives its mass after t days?', ["160(1/2)^(4t)", "80^t", "160 - 20t", "160(1/2)^(t/4)"], 'd'],
  ['Problem-Solving and Data Analysis', 'The median of 11 distinct numbers is 20. If the largest number increases by 50 while every other number stays the same, what happens to the median?', ["It increases by 50.", "It cannot be determined.", "It remains 20.", "It increases by 50/11."], 'c'],
  ['Problem-Solving and Data Analysis', 'A survey estimates that 48% of voters support a proposal, with a margin of error of 3 percentage points. Which value lies within the reported interval?', ["43%", "50%", "44%", "52%"], 'b'],
  ['Problem-Solving and Data Analysis', 'A car travels at a constant 72 kilometers per hour. What is this speed in meters per second?', ["18", "12", "20", "2"], 'c'],
  ['Geometry and Trigonometry', 'In a right triangle, the sine of angle A is 3/5. If A is acute, what is the cosine of A?', ["2/5", "5/3", "3/4", "4/5"], 'd'],
  ['Geometry and Trigonometry', 'A cylinder has radius 3 and height 10. What is its volume?', ["30π", "60π", "90π", "900π"], 'c'],
  ['Geometry and Trigonometry', 'A circle has circumference 18π. What is its diameter?', ["36", "81", "9", "18"], 'd'],
  ['Advanced Math', 'The polynomial x² + bx + 36 has a double real root at x = 6. What is b?', ["-12", "6", "12", "-6"], 'a'],
]
const numeric2: NumericRow[] = [
  ['Algebra', 'If 2x + y = 11 and x - y = 1, what is x?', 4],
  ['Algebra', 'A line perpendicular to y = (1/4)x + 3 has slope m. What is m?', -4],
  ['Advanced Math', 'For x ≠ 3, (x² - 9)/(x - 3) = 11. What is x?', 8],
  ['Advanced Math', 'The graph of f(x) = x² - 10x + c touches the x-axis at exactly one point. What is c?', 25],
  ['Problem-Solving and Data Analysis', 'An item increases in price from $80 to $92. What is the percentage increase?', 15],
  ['Geometry and Trigonometry', 'An arc subtends a central angle of 60 degrees in a circle of radius 12. If its length is kπ, what is k?', 4],
]
export function mathExample(module: 0 | 1): AssessmentItem[] {
  const rows = module === 0 ? module1 : module2
  const numerics = module === 0 ? numeric1 : numeric2
  return [
    ...rows.map(([domain, question, options, answer], index) => choice(`example-math-${module + 1}-${index + 1}`, domain, 'Problem solving', '', question, options, answer)),
    ...numerics.map(([domain, question, answer], index) => numeric(`example-math-${module + 1}-${index + 17}`, domain, 'Problem solving', question, answer)),
  ]
}
