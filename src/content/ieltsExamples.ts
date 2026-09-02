import type { ListeningContentDocument, ObjectiveContentBlock, ReadingContentDocument } from '@/domain/objectiveContent'
import type { WritingContentDocument } from '@/domain/writingContent'

// Original authoring-only examples, never registered as built-in practice.
// Do not import playable documents or bundled scripts: that exposes their keys.
// These compact examples teach the complete contract, not full exam difficulty.
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

const reading: ReadingContentDocument = {
  schemaVersion: 1, section: 'reading', contentKey: 'example-ielts-reading', name: 'Seeds, Bridges and Lending — Authoring Example',
  parts: readingPassages.map((passage, index) => ({
    id: index + 1, label: `Passage ${index + 1}`, instructionText: 'Read the passage and complete the notes.',
    blocks: [{ type: 'passage', title: passage.title, paragraphs: passage.paragraphs }, ...noteBlocks(passage.title, index * 13 + 1, passage.notes)],
  })),
}

const listeningParts: Array<{ title: string; turns: Array<[speakerId: string, text: string]>; notes: Notes }> = [
  {
    title: 'Booking a pottery class',
    turns: [
      ['adviser', 'Good afternoon, Meadow Arts. Which class would you like to book?'],
      ['customer', 'The pottery class, please. My surname is Nolan. I would prefer Saturday.'],
      ['adviser', 'That class starts at eleven. It costs twenty-four pounds and takes place in the annex. Please bring an apron.'],
      ['customer', 'Is clay included? I would like to make a bowl, and I have never tried pottery before.'],
      ['adviser', 'Yes, clay is included. I will book you into the beginner group. Your tutor is Rosa. Please pay by card when you arrive.'],
      ['customer', 'Thank you. I will bring my apron and arrive before the class begins.'],
    ],
    notes: [['Class subject', 'pottery'], ['Customer surname', 'Nolan'], ['Day chosen', 'Saturday'], ['Starting hour', '11'], ['Fee in pounds', '24'],
      ['Location', 'annex'], ['Item to bring', 'apron'], ['Material included', 'clay'], ['Tutor name', 'Rosa'], ['Payment method', 'card']],
  },
  {
    title: 'Visiting a community observatory',
    turns: [['adviser', 'Welcome to the hilltop observatory. Our public evenings run on Fridays. The main gate opens at eight, and visitors gather in the foyer. The talk lasts twenty minutes. After that, a volunteer takes you to the telescope. Please use the red torches provided; white light makes it harder to see faint objects. The roof is reached by stairs, so tell us if you need step-free access to the ground-floor viewing station. Warm blankets are available at reception. We cancel roof visits during thunderstorms, but indoor activities continue. Children must remain with an adult. Before leaving, please return your visitor badge to the box beside the exit.']],
    notes: [['Day of public evenings', 'Fridays'], ['Gate opening hour', '8'], ['Initial meeting area', 'foyer'], ['Talk length in minutes', '20'],
      ['Instrument used for viewing', 'telescope'], ['Colour of provided torches', 'red'], ['Route to the roof', 'stairs'], ['Warm items available', 'blankets'],
      ['Weather that cancels roof visits', 'thunderstorms'], ['Item returned on leaving', 'badge']],
  },
  {
    title: 'Planning a student field study',
    turns: [
      ['customer', 'For our geography project, I suggest studying erosion along the cliff path. We could work in October, before the winter storms.'],
      ['adviser', 'Good idea. We need permission from the council, and we should mark our measurement sites on a map. A tape will be more useful than estimating distances.'],
      ['customer', 'Let us visit weekly. We can record rainfall as well, since water may explain changes in the path.'],
      ['adviser', 'For safety we must stay behind the fence. The college can lend us helmets for the supervised visit to the lower beach.'],
      ['customer', 'We can present the results as a graph. Shall we send our proposal to the tutor on Monday?'],
      ['adviser', 'Yes. We should also explain what we will do if the path is closed.'],
    ],
    notes: [['Process being studied', 'erosion'], ['Month proposed', 'October'], ['Organisation granting permission', 'council'], ['Document showing sites', 'map'],
      ['Instrument for distance measurements', 'tape'], ['Visit frequency', 'weekly'], ['Weather measurement to record', 'rainfall'],
      ['Barrier students must stay behind', 'fence'], ['Protective equipment supplied by college', 'helmets'], ['Format for presenting results', 'graph']],
  },
  {
    title: 'How desert animals manage heat',
    turns: [['customer', 'Today we will discuss adaptations to desert heat. Many small mammals are nocturnal, avoiding the hottest hours. During daylight they shelter in burrows. Large ears can help some species lose heat, because blood flows close to the surface. Pale fur reflects more sunlight than dark fur. Water is another challenge. Some animals obtain much of their moisture from seeds. Their kidneys produce concentrated urine, limiting water loss. Reptiles often seek shade rather than maintaining a constant body temperature. Researchers attach tiny sensors to track these movements. Such studies show that behaviour is as important as anatomy. Conservation plans must protect shelter, not merely count the animals.']],
    notes: [['Activity pattern of many small mammals', 'nocturnal'], ['Daytime shelters', 'burrows'], ['Body parts that can release heat', 'ears'],
      ['Light-coloured covering that reflects sunlight', 'fur'], ['Food supplying moisture', 'seeds'], ['Organs limiting water loss', 'kidneys'],
      ['Cooler locations sought by reptiles', 'shade'], ['Devices researchers attach', 'sensors'], ['Factor as important as anatomy', 'behaviour'],
      ['Habitat feature conservation must protect', 'shelter']],
  },
]

const listening: ListeningContentDocument = {
  schemaVersion: 1, section: 'listening', contentKey: 'example-ielts-listening', name: 'Classes, Stars and Fieldwork — Authoring Example',
  parts: listeningParts.map((part, index) => ({ id: index + 1, label: `Part ${index + 1}`,
    instructionText: 'Listen and complete the notes.', blocks: noteBlocks(part.title, index * 10 + 1, part.notes) })),
  audio: { type: 'kokoro', speakers: [{ id: 'adviser', voice: 'bf_emma' }, { id: 'customer', voice: 'bm_george' }],
    parts: listeningParts.map((part, index) => ({ partId: index + 1, segments: [
      { type: 'silence', durationMs: 30_000, purpose: 'question_time' },
      ...part.turns.map(([speakerId, text]) => ({ type: 'speech' as const, speakerId, text })),
      { type: 'silence', durationMs: 20_000, purpose: 'part_transition' },
    ] })),
  },
}

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
