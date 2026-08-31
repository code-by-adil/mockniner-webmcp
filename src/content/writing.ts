import type { WritingTask } from '../domain/types'

export const writingTasks = [
  {
    id: 1,
    title: 'Writing Task 1',
    instruction: 'You should spend about 20 minutes on this task.',
    lead: 'The bar chart below compares adult participation in seven major sports in one area in 1997 and 2017.',
    prompt: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    minimumWords: 150,
    chart: {
      title: 'Number of adults participating in major sports',
      years: ['1997', '2017'],
      unit: 'thousands of adults',
      rows: [
        { label: 'Tennis', values: [50, 54] },
        { label: 'Basketball', values: [10, 22] },
        { label: 'Cricket', values: [25, 8] },
        { label: 'Golf', values: [32, 34] },
        { label: 'Swimming', values: [35, 35] },
        { label: 'Football', values: [32, 48] },
        { label: 'Rugby', values: [33, 49] },
      ],
    },
  },
  {
    id: 2,
    title: 'Writing Task 2',
    instruction: 'You should spend about 40 minutes on this task.',
    lead: 'Write about the following topic:',
    prompt: 'In many countries, more people are choosing to live alone or in very small households. What are the reasons for this trend? Do you think it is a positive or negative development?',
    minimumWords: 250,
  },
] satisfies [WritingTask, WritingTask]
