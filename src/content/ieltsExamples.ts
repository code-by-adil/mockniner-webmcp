import { readingSupplement } from './ieltsReadingSupplement'
import { listeningContentDocumentSchema } from '@/domain/objectiveContent'
import listeningExample from './ieltsListeningExample.json'
import type { ObjectiveContentBlock, ReadingContentDocument } from '@/domain/objectiveContent'
import type { WritingContentDocument } from '@/domain/writingContent'

// Original authoring-only examples, never registered as built-in practice.
// Do not import playable documents or bundled scripts: that exposes their keys.
// Original practice examples teach exam structure without claiming calibration.
type Notes = Array<[prompt: string, answer: string]>
function noteBlocks(title: string, start: number, notes: Notes): ObjectiveContentBlock[] {
  return [
    { type: 'group_header', title: `Questions ${start}–${start + notes.length - 1}`,
      instruction: 'Complete the notes. Write ONE WORD AND/OR A NUMBER for each answer.' },
    { type: 'completion_questions', completionType: 'note_completion', title, presentation: { layout: 'list' },
      items: notes.map(([prefix, answer], index) => ({ questionId: start + index, prefix, suffix: '', answer })) },
  ]
}

const readingPassages: Array<{ title: string; paragraphs: string[]; notes: Notes }> = [
  {
    title: 'Keeping a seed collection alive',
    paragraphs: [
      'The fictional Fenwick seed collection opened in 2008 in a converted bakery. Its founders wanted to preserve vegetables that local gardeners had grown for generations. The first donations arrived in envelopes, often with handwritten descriptions. Volunteers transferred the seeds into jars and gave each donation a code. They recorded the village where it had been grown, since a familiar name could describe different plants in different places.',
      'Before storage, workers dried the seeds using silica. A cupboard fitted with a thermometer allowed them to check the temperature without opening every container. Each spring they placed a sample on damp paper to measure germination. Seeds that failed this test were not immediately discarded: a second sample was tested to exclude a handling mistake. The database recorded both results rather than retaining only the better one.',
      'The collection also depended on living gardens. Members grew selected varieties in isolation to avoid unwanted cross-pollination. Bees were welcome elsewhere, but could carry pollen between closely related plants. At harvest, growers returned fresh seeds and a photograph of the mature crop. A newsletter shared observations about disease and unusual weather. Demand increased after a drought, when gardeners began looking for varieties that had survived dry summers. The organisers deliberately kept membership free; a donation box covered small expenses.',
    ],
    notes: [['Year the collection opened', '2008'], ['Previous use of the building', 'bakery'], ['Packaging used for initial donations', 'envelopes'],
      ['Containers used for storage', 'jars'], ['Identifier assigned to each donation', 'code'], ['Place of origin recorded', 'village'],
      ['Material used to dry seeds', 'silica'], ['Instrument used to check temperature', 'thermometer'], ['Season for germination checks', 'spring'],
      ['Material on which test seeds were placed', 'paper'], ['Insects that could carry unwanted pollen', 'Bees'],
      ['Image returned with fresh seeds', 'photograph'], ['Event that increased demand', 'drought']],
  },
  {
    title: 'Listening to a bridge',
    paragraphs: [
      'Engineers in the fictional town of Linton began monitoring a pedestrian bridge in 2016. Built from steel, the bridge crossed a canal between a station and a market. Routine inspections had relied on photographs. The new project added sensors underneath the deck to record vibration. A battery powered each device, avoiding the need to attach long cables to the structure.',
      'Measurements were transmitted every hour to a computer in the station. Researchers compared busy afternoons with quiet nights. They discovered that bicycles produced a recognisable pattern, while wind caused a slower movement. Temperature also mattered: the structure expanded on warm days. Ignoring that effect could make a healthy bridge appear damaged. The team therefore used a reference sensor sheltered from direct sunlight.',
      'An unusually large signal triggered an alert, not an automatic closure. An engineer first checked whether maintenance vehicles had crossed the bridge. If the signal remained unexplained, staff inspected the joints. The project did not replace visual checks because corrosion could develop without a dramatic change in vibration. Its main benefit was continuity: staff could notice changes between inspections. At the end of the trial, the council published a report explaining both the advantages and the limitations.',
    ],
    notes: [['Year monitoring began', '2016'], ['Main bridge material', 'steel'], ['Waterway beneath the bridge', 'canal'],
      ['Transport building at one end', 'station'], ['Earlier inspections relied on', 'photographs'], ['Sensors measured', 'vibration'],
      ['Power source for each sensor', 'battery'], ['Data transmission interval: every', 'hour'], ['Vehicles with a recognisable signal', 'bicycles'],
      ['Weather factor causing slower movement', 'wind'], ['Environmental measurement needed to explain expansion', 'Temperature'],
      ['Connections checked during unexplained alerts', 'joints'], ['Damage still requiring visual inspection', 'corrosion']],
  },
  {
    title: 'A lending collection for useful objects',
    paragraphs: [
      'In 2019 a residents association in fictional Mereford opened a lending collection inside a former pharmacy. The idea was to share objects that households used only occasionally. A drill was the first item donated. Later, members contributed a projector, a ladder and several sewing machines. Borrowers registered with proof of address, but no deposit was required. Loans normally lasted seven days.',
      'Every returned item went to a workbench for inspection. Volunteers attached a yellow label to anything awaiting repair, so it could not be borrowed accidentally. An electrician checked powered equipment. The association bought insurance and kept a reserve fund for replacement parts. Items were stored on numbered shelves, while photographs in the online catalogue helped borrowers distinguish similar models. Instructions were printed in large type.',
      'The busiest month was April, when many residents began home projects. To avoid queues, members reserved equipment through a calendar. Staff still accepted telephone bookings for people without internet access. A monthly workshop taught basic maintenance. The association measured success partly through interviews: borrowing figures alone could not show whether people had learned new skills. Its annual survey found that members valued confidence as well as savings. The organisers refused an offer to sell advertising space, preferring to keep the service independent.',
    ],
    notes: [['Year the collection opened', '2019'], ['Former use of its premises', 'pharmacy'], ['First donated object', 'drill'],
      ['Proof needed to register: proof of', 'address'], ['Normal loan length in days', 'seven'], ['Place where returns were inspected', 'workbench'],
      ['Colour of repair labels', 'yellow'], ['Person checking electrical equipment', 'electrician'], ['Protection purchased by the association', 'insurance'],
      ['Numbered storage furniture', 'shelves'], ['Images used in the catalogue', 'photographs'], ['Busiest month', 'April'],
      ['Booking tool used to avoid queues', 'calendar'], ['Monthly learning event', 'workshop']],
  },
]

function readingQuestions(index: number, passage: typeof readingPassages[number]): ObjectiveContentBlock[] {
  if (index === 0) return [
    ...noteBlocks(passage.title, 1, passage.notes.slice(0, 7)),
    { type: 'group_header', title: 'Questions 8-13', instruction: 'Do the statements agree with the passage? Choose TRUE, FALSE or NOT GIVEN.' },
    { type: 'true_false_not_given_questions', questions: [
      { questionId: 8, questionText: 'The collection retained only the better result when it repeated a germination test.', answer: 'FALSE' },
      { questionId: 9, questionText: 'The collection replaced local variety names with its own definitive labels.', answer: 'FALSE' },
      { questionId: 10, questionText: 'Every donor remembered the year in which the seeds had been harvested.', answer: 'FALSE' },
      { questionId: 11, questionText: 'Growing a variety in several gardens reduced the risk of losing its entire living stock.', answer: 'TRUE' },
      { questionId: 12, questionText: 'The workshops were held on the first Sunday of every month.', answer: 'NOT GIVEN' },
      { questionId: 13, questionText: 'The founders thought a currently unpopular characteristic might become useful under different conditions.', answer: 'TRUE' },
    ] },
  ]
  if (index === 1) return [
    ...noteBlocks(passage.title, 14, passage.notes.slice(0, 7)),
    { type: 'group_header', title: 'Questions 21-23', instruction: 'Choose the correct heading for each indicated paragraph. There are more headings than questions.' },
    { type: 'heading_matching_questions', options: ['Comparing readings under similar conditions', 'Choosing a practical sensor arrangement', 'Checking the instruments themselves', 'Replacing the bridge completely', 'The cost of a new railway'], questions: [
      { questionId: 21, paragraphIndex: 3, label: 'Paragraph 4', answer: 'Comparing readings under similar conditions' },
      { questionId: 22, paragraphIndex: 4, label: 'Paragraph 5', answer: 'Choosing a practical sensor arrangement' },
      { questionId: 23, paragraphIndex: 5, label: 'Paragraph 6', answer: 'Checking the instruments themselves' },
    ] },
    { type: 'group_header', title: 'Questions 24-26', instruction: 'Choose the correct letter, A, B, C or D.' },
    { type: 'mcq_questions', questions: [
      { questionId: 24, questionText: 'Why did the engineers keep visual inspections?', options: opts(['They distrusted every sensor reading.', 'Some physical damage may be visible before vibration changes.', 'The sensors worked only during daylight.', 'Visual inspections needed no trained staff.']), answer: 'B' },
      { questionId: 25, questionText: 'What was a concern about public communication?', options: opts(['Residents could interpret monitoring as a guarantee against failure.', 'Residents refused to use any monitored bridge.', 'Only researchers could read the published report.', 'The council had stopped responding to warnings.']), answer: 'A' },
      { questionId: 26, questionText: 'What did the council recommend after the trial?', options: opts(['Removing engineering oversight', 'Closing the bridge permanently', 'Using monitoring to complement other observations', 'Installing a sensor at every possible location']), answer: 'C' },
    ] },
  ]
  return [
    ...noteBlocks(passage.title, 27, passage.notes.slice(0, 7)),
    { type: 'group_header', title: 'Questions 34-37', instruction: "Do the statements agree with the writer's views? Choose YES, NO or NOT GIVEN." },
    { type: 'yes_no_not_given_questions', questions: [
      { questionId: 34, questionText: 'A usable donation should always be accepted regardless of storage and repair costs.', answer: 'NO' },
      { questionId: 35, questionText: 'Punishing every equipment failure could discourage borrowers from reporting damage.', answer: 'YES' },
      { questionId: 36, questionText: 'Every loan can safely be counted as one prevented purchase.', answer: 'NO' },
      { questionId: 37, questionText: 'The association should open a second branch in the next year.', answer: 'NOT GIVEN' },
    ] },
    { type: 'group_header', title: 'Questions 38-40', instruction: 'Choose the correct letter, A, B, C or D.' },
    { type: 'mcq_questions', questions: [
      { questionId: 38, questionText: 'Why did volunteers ask borrowers about their intended task?', options: opts(['To charge different prices for each project', 'To carry out the work themselves', 'To collect advertising information', 'To help borrowers choose appropriate equipment']), answer: 'D' },
      { questionId: 39, questionText: 'Why were environmental savings difficult to calculate exactly?', options: opts(['Transport used no resources.', 'Borrowers could not always know what they would otherwise have done.', 'No equipment needed repairs.', 'The association refused to gather information.']), answer: 'B' },
      { questionId: 40, questionText: 'What is the main point of the final paragraph?', options: opts(["Several kinds of evidence are needed to describe the project's results.", 'Loan counts are the only meaningful measure.', 'Financial accounts should be abandoned.', 'Only frequently borrowed equipment has value.']), answer: 'A' },
    ] },
  ]
}
function opts(labels: string[]) { return labels.map((label, i) => ({ value: String.fromCharCode(65 + i), label })) }

const reading: ReadingContentDocument = {
  schemaVersion: 1, section: 'reading', contentKey: 'example-ielts-reading', name: 'Seeds, bridges and lending, authoring example',
  parts: readingPassages.map((passage, index) => ({
    id: index + 1, label: `Passage ${index + 1}`, instructionText: 'Read the passage and answer the questions. Follow the instructions for each group.',
    blocks: [{ type: 'passage', title: passage.title, paragraphs: [...passage.paragraphs, ...readingSupplement[index]!] }, ...readingQuestions(index, passage)],
  })),
}

const listening = listeningContentDocumentSchema.parse(listeningExample)

const writing: WritingContentDocument = {
  schemaVersion: 1, section: 'writing', contentKey: 'example-ielts-writing', name: 'Travel and Shared Facilities — Authoring Example',
  tasks: [
    { id: 1, type: 'academic_task_1_bar_chart', title: 'Task 1', instruction: 'You should spend about 20 minutes on this task.',
      minimumWords: 150, lead: 'The chart compares commuting methods in a fictional town in 2010 and 2020.',
      prompt: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      chart: { title: 'Main commuting method', unit: 'Percentage of commuters', years: ['2010', '2020'],
        rows: [{ label: 'Bus', values: [25, 35] }, { label: 'Bicycle', values: [10, 20] }, { label: 'Car', values: [65, 45] }] } },
    { id: 2, type: 'academic_task_2_essay', title: 'Task 2', instruction: 'You should spend about 40 minutes on this task.', minimumWords: 250,
      lead: 'Write about the following topic:', prompt: 'Some people believe that schools should share their sports facilities with local residents outside school hours. Discuss the advantages and disadvantages of this proposal.',
      guidance: 'Give reasons for your answer and include relevant examples.' },
  ],
}

const examples = { listening, reading, writing }

export function getIeltsExample(section: keyof typeof examples) {
  return structuredClone(examples[section])
}
