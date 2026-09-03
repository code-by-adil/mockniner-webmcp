// Format facts checked against the linked exam-owner documentation on 2026-09-04.
// These describe structure, not calibrated difficulty or official scoring.
export const examProfiles = {
  listening: {
    exam: 'IELTS Listening', checkedOn: '2026-09-04',
    sources: ['https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening'],
    parts: [10, 10, 10, 10], questionCount: 40, approximateAudioMinutes: 30,
    authoring: [
      'A request such as "make me IELTS Listening practice" means one complete 40-question set unless the learner explicitly requests a shorter drill. This native runner requires all 40 questions.',
      'Part 1 is a two-speaker everyday transaction; Part 2 an everyday monologue; Part 3 an education or training discussion; Part 4 an academic monologue.',
      'Follow recording order for answers. Include paraphrase and plausible distractors, corrections in conversations, and a mix of completion, single choice, matching and multiple selection. Multiple-selection answer slots count toward 40.',
      'Write complete spoken material, not a list of answers. The example contains about 3,300 spoken words plus reading pauses. This is an authoring target, not an official word-count rule.',
      'Reuse the declared Kokoro voice IDs and segment format directly. The app owns speech generation; no Kokoro documentation, audio files or external speech service is needed.',
    ],
  },
  reading: {
    exam: 'IELTS Academic Reading', checkedOn: '2026-09-04',
    sources: ['https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading'],
    parts: [13, 13, 14], questionCount: 40, durationSeconds: 3600, passageWords: [2150, 2750],
    authoring: [
      'Use three substantial passages and 40 questions. The example distribution 13/13/14 is a design choice; the total of 40 is required.',
      'Use varied question types and passage-based answers. Distinguish a contradiction from information that is absent when writing True/False/Not Given items.',
      'This kit is Academic Reading. General Training needs different source text and task design; do not label Academic passages as a complete General Training test.',
    ],
  },
  writing: {
    exam: 'IELTS Academic Writing', checkedOn: '2026-09-04',
    sources: ['https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing'],
    taskCount: 2, durationSeconds: 3600, minimumWords: [150, 250],
    authoring: ['The native runner supports an Academic Task 1 bar chart and a Task 2 essay. Use the example for both. Other official Task 1 formats and General Training letters are not represented by this native contract.'],
  },
  'sat-style': {
    exam: 'Digital SAT style', checkedOn: '2026-09-04',
    sources: ['https://satsuite.collegeboard.org/sat/whats-on-the-test/structure', 'https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing', 'https://satsuite.collegeboard.org/sat/whats-on-the-test/math'],
    parts: [{ section: 'Reading and Writing', items: 27, seconds: 1920 }, { section: 'Reading and Writing', items: 27, seconds: 1920 }, { section: 'Math', items: 22, seconds: 2100 }, { section: 'Math', items: 22, seconds: 2100 }],
    authoring: [
      'For full SAT practice keep 98 questions and all four module timings. For an explicitly requested section or short drill, use only the requested scope and label it accordingly.',
      'Reading and Writing uses short passages or passage pairs with one four-option question each. Cover Information and Ideas, Craft and Structure, Expression of Ideas, and Standard English Conventions.',
      'Math covers Algebra, Advanced Math, Problem-Solving and Data Analysis, and Geometry and Trigonometry. Mix four-option questions and numeric entry. Declare a calculator and reference document only for Math.',
      'The official exam has a 10-minute break between sections and adaptive second modules. This runner uses a fixed sequence and has no scheduled break. State those differences; do not invent adaptation or a 400-1600 score.',
    ],
  },
  'gre-style': {
    exam: 'GRE General Test style', checkedOn: '2026-09-04',
    sources: ['https://www.ets.org/gre/test-takers/general-test/prepare/test-structure.html', 'https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html', 'https://www.ets.org/gre/test-takers/general-test/prepare/content/quantitative-reasoning.html'],
    parts: [{ section: 'Analytical Writing', items: 1, seconds: 1800 }, { section: 'Verbal Reasoning', items: 12, seconds: 1080 }, { section: 'Quantitative Reasoning', items: 12, seconds: 1260 }, { section: 'Verbal Reasoning', items: 15, seconds: 1380 }, { section: 'Quantitative Reasoning', items: 15, seconds: 1560 }],
    authoring: [
      'Full practice has one Analyze an Issue essay, 27 Verbal questions and 27 Quantitative questions. Writing comes first; Verbal and Quantitative may follow in either order. Use the supplied five-part order as a valid fixed practice sequence.',
      'Verbal mixes reading comprehension, one-to-three-blank Text Completion and Sentence Equivalence. One-blank completion has five options; multi-blank completion has three independent options per blank and all-or-nothing mapping scoring. Sentence Equivalence has six options and exactly two correct answers.',
      'Single-answer reading comprehension has five choices; multiple-answer reading comprehension has three choices and asks for all correct ones. Select-in-passage is unsupported; do not silently replace it when explicitly requested.',
      'Quantitative comparison uses the four standard relationship choices. Other quantitative items use five-option single choice, multiple selection, numeric entry and data interpretation. Declare a calculator in Quantitative parts; GRE does not supply the SAT-style formula reference.',
      'The example has a local advisory writing rubric. GRE scoring is holistic; this rubric is not the official scoring process. No official scaled score, percentile or adaptive routing is implemented.',
    ],
  },
} as const

export const authoringWorkflow = [
  'Use the supplied example and format facts for supported IELTS, SAT and GRE practice. Routine original practice does not need web research. Research when the requested exam or format is not covered, current external facts are necessary, or the learner asks for sources or verification.',
  'For a general request to practise, existing suitable library practice is the fastest route: get_practice_library, then open_practice. For an explicit request to make new questions, read the matching kit once and author original content.',
  'A complete example can be installed directly with a fresh ID if the learner wants the example itself. For new practice, replace the passages, scripts, questions, distractors and answers together; changing only names or numbers is not new question design.',
  'The application validates installation and returns repair paths. Submit the complete object directly; do not write a separate schema validator or inspect app source files.',
  'Installation opens practice by default. Set openAfterInstall:false only when the learner asks to save for later. Check opened in the result. If false, follow openAction and openingError before claiming completion.',
  'Listening opens with preparation visible and continues locally after the agent ends its turn. readyToPlay can be true while phase is generating. Playback starts automatically when the browser permits it; describe preparation honestly and leave answering and submission to the learner.',
]
