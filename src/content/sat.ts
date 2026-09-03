import { parseAssessmentPackage } from "@/domain/assessment";

export const satPracticeAssessment = parseAssessmentPackage({
  schemaVersion: 4,
  packageId: "local-sat-foundations-v1",
  revision: 1,
  title: "SAT-Style Foundations Diagnostic",
  description:
    "A short diagnostic covering Reading and Writing and Math, with two modules per section.",
  source: "built-in",
  metadata: {
    subject: "College readiness",
    difficulty: "mixed",
    locale: "en-US",
    shortLabel: "SAT-style",
    disclaimer:
      "Independent SAT-style practice. SAT is a registered trademark of College Board, which is not affiliated with or endorsing this application.",
  },
  presentation: { accent: "red", density: "comfortable" },
  resources: [
    {
      id: "math-formulas",
      type: "document",
      title: "Math formulas",
      description: "Common geometry formulas supplied for this practice assessment.",
      content: [
        { type: "text", variant: "subtitle", text: "Circles" },
        { type: "math", expression: "A = πr²    C = 2πr" },
        { type: "text", variant: "subtitle", text: "Rectangular solids" },
        { type: "math", expression: "V = lwh" },
        { type: "text", variant: "subtitle", text: "Right triangles" },
        { type: "math", expression: "a² + b² = c²" },
      ],
    },
  ],
  review: { mode: "answers" },
  parts: [
    {
      id: "rw-module-1",
      groupTitle: "Reading and Writing",
      title: "Module 1",
      description: "Short passages testing comprehension, rhetoric, and language conventions.",
      durationSeconds: 8 * 60,
      navigation: "free",
      defaultLayout: "split",
      tools: [{ type: "mark_for_review" }, { type: "option_eliminator" }],
      items: [
            {
              id: "rw-1",
              domain: "Information and Ideas",
              skill: "Central Ideas and Details",
              stimulus: [
                {
                  type: "passage",
                  paragraphs: [
                    "Researchers studying rooftop gardens found that plots containing several flowering species attracted more pollinating insects than plots planted with only one species. The mixed plots also produced fruit more consistently during unusually hot weeks.",
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "Which choice best states the main idea of the passage?" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "Rooftop gardens are difficult to maintain during hot weather." },
                  { id: "b", label: "Greater plant variety can improve pollinator activity and crop reliability." },
                  { id: "c", label: "Pollinating insects prefer fruit plants to flowering plants." },
                  { id: "d", label: "Single-species gardens produce the most consistent harvests." },
                ],
              },
              scoring: { type: "exact", answer: "b" },
            },
            {
              id: "rw-2",
              domain: "Craft and Structure",
              skill: "Words in Context",
              stimulus: [
                {
                  type: "passage",
                  paragraphs: [
                    "The engineer described the first prototype as rudimentary: it could collect useful measurements, but it lacked the durability and precision required for fieldwork.",
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "As used in the passage, “rudimentary” most nearly means" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "basic" },
                  { id: "b", label: "expensive" },
                  { id: "c", label: "unnecessary" },
                  { id: "d", label: "portable" },
                ],
              },
              scoring: { type: "exact", answer: "a" },
            },
            {
              id: "rw-3",
              domain: "Standard English Conventions",
              skill: "Boundaries",
              stimulus: [],
              presentation: { layout: "single" },
              prompt: [
                {
                  type: "text",
                  text: "The library extended its weekend hours ____ attendance during the new hours increased by nearly forty percent.",
                },
                { type: "text", text: "Which choice completes the text so that it conforms to Standard English conventions?", variant: "muted" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: ", attendance" },
                  { id: "b", label: "; attendance" },
                  { id: "c", label: " attendance" },
                  { id: "d", label: ": and attendance" },
                ],
              },
              scoring: { type: "exact", answer: "b" },
            },
      ],
    },
    {
      id: "rw-module-2",
      groupTitle: "Reading and Writing",
      title: "Module 2",
      description: "Short passages testing comprehension, rhetoric, and language conventions.",
      durationSeconds: 8 * 60,
      navigation: "free",
      defaultLayout: "split",
      tools: [{ type: "mark_for_review" }, { type: "option_eliminator" }],
      items: [
            {
              id: "rw-4",
              domain: "Information and Ideas",
              skill: "Command of Evidence",
              stimulus: [
                {
                  type: "table",
                  caption: "Average weekly bicycle trips after new protected lanes opened",
                  columns: ["Neighborhood", "Before", "After"],
                  rows: [
                    ["Harbor", "1,240", "1,910"],
                    ["Central", "2,180", "2,760"],
                    ["North", "980", "1,020"],
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "Which claim is best supported by the table?" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "Every neighborhood gained more than 500 weekly trips." },
                  { id: "b", label: "Central had the largest percentage increase." },
                  { id: "c", label: "Harbor showed the largest percentage increase." },
                  { id: "d", label: "North had fewer weekly trips after the lanes opened." },
                ],
              },
              scoring: { type: "exact", answer: "c" },
            },
            {
              id: "rw-5",
              domain: "Expression of Ideas",
              skill: "Transitions",
              stimulus: [
                {
                  type: "passage",
                  paragraphs: [
                    "The ceramic coating is extremely thin. ____, it protects the underlying metal from moisture for several years.",
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "Which choice completes the text with the most logical transition?" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "For example," },
                  { id: "b", label: "Nevertheless," },
                  { id: "c", label: "Similarly," },
                  { id: "d", label: "Therefore," },
                ],
              },
              scoring: { type: "exact", answer: "b" },
            },
            {
              id: "rw-6",
              domain: "Craft and Structure",
              skill: "Text Structure and Purpose",
              stimulus: [
                {
                  type: "passage",
                  paragraphs: [
                    "Biographer Lena Ortiz begins her account of the composer with a description of an unfinished childhood melody. She returns to the melody in the final chapter, showing how its rhythm reappeared in the composer's last major work.",
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "The passage indicates that Ortiz discusses the melody primarily to" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "argue that the composer's later work lacked originality" },
                  { id: "b", label: "frame the biography with a connection across the composer's life" },
                  { id: "c", label: "identify the composer's most popular childhood performance" },
                  { id: "d", label: "explain why the final composition remained unfinished" },
                ],
              },
              scoring: { type: "exact", answer: "b" },
            },
      ],
    },
    {
      id: "math-module-1",
      groupTitle: "Math",
      title: "Module 1",
      description: "Algebra, advanced math, data analysis, and geometry practice.",
      durationSeconds: 8 * 60,
      navigation: "free",
      defaultLayout: "split",
      tools: [
        { type: "mark_for_review" },
        { type: "option_eliminator" },
        { type: "reference_document", resourceId: "math-formulas" },
        { type: "calculator" },
      ],
      items: [
            {
              id: "math-1",
              domain: "Algebra",
              skill: "Linear equations in one variable",
              stimulus: [{ type: "math", expression: "3x + 7 = 25", accessibleLabel: "three x plus seven equals twenty-five" }],
              prompt: [{ type: "text", text: "What is the value of x?" }],
              interaction: { type: "numeric_entry", placeholder: "Enter a number" },
              scoring: { type: "numeric", answer: 6 },
            },
            {
              id: "math-2",
              domain: "Problem-Solving and Data Analysis",
              skill: "Percentages",
              stimulus: [],
              presentation: { layout: "single" },
              prompt: [
                { type: "text", text: "A jacket originally costs $80. Its price is reduced by 15%. What is the sale price, in dollars?" },
              ],
              interaction: { type: "numeric_entry", placeholder: "Enter a number" },
              scoring: { type: "numeric", answer: 68 },
            },
            {
              id: "math-3",
              domain: "Geometry and Trigonometry",
              skill: "Area and volume",
              stimulus: [{ type: "math", expression: "A = πr²" }],
              prompt: [
                { type: "text", text: "A circle has radius 4. Which expression gives its area?" },
              ],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "4π" },
                  { id: "b", label: "8π" },
                  { id: "c", label: "16π" },
                  { id: "d", label: "32π" },
                ],
              },
              scoring: { type: "exact", answer: "c" },
            },
      ],
    },
    {
      id: "math-module-2",
      groupTitle: "Math",
      title: "Module 2",
      description: "Algebra, advanced math, data analysis, and geometry practice.",
      durationSeconds: 8 * 60,
      navigation: "free",
      defaultLayout: "split",
      tools: [
        { type: "mark_for_review" },
        { type: "option_eliminator" },
        { type: "reference_document", resourceId: "math-formulas" },
        { type: "calculator" },
      ],
      items: [
            {
              id: "math-4",
              domain: "Advanced Math",
              skill: "Nonlinear equations",
              stimulus: [{ type: "math", expression: "x² − 5x + 6 = 0" }],
              prompt: [{ type: "text", text: "Which pair gives all solutions to the equation?" }],
              interaction: {
                type: "single_choice",
                options: [
                  { id: "a", label: "−3 and −2" },
                  { id: "b", label: "−2 and 3" },
                  { id: "c", label: "2 and 3" },
                  { id: "d", label: "1 and 6" },
                ],
              },
              scoring: { type: "exact", answer: "c" },
            },
            {
              id: "math-5",
              domain: "Algebra",
              skill: "Systems of equations",
              stimulus: [
                { type: "math", expression: "x + y = 11\nx − y = 3" },
              ],
              prompt: [{ type: "text", text: "What is the value of x?" }],
              interaction: { type: "numeric_entry", placeholder: "Enter a number" },
              scoring: { type: "numeric", answer: 7 },
            },
            {
              id: "math-6",
              domain: "Problem-Solving and Data Analysis",
              skill: "Rates",
              stimulus: [
                {
                  type: "bar_chart",
                  title: "Pages read during one week",
                  unit: "pages",
                  bars: [
                    { label: "Amina", value: 84 },
                    { label: "Bao", value: 70 },
                    { label: "Carla", value: 98 },
                  ],
                },
              ],
              prompt: [
                { type: "text", text: "Carla read an equal number of pages on each of 7 days. How many pages did she read per day?" },
              ],
              interaction: { type: "numeric_entry", placeholder: "Enter a number" },
              scoring: { type: "numeric", answer: 14 },
            },
      ],
    },
  ],
});
