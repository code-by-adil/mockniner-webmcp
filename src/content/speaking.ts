import type { SpeakingPrompt } from '../domain/types'

export const SPEAKING_CONTENT_KEY = 'local-original-speaking-v1'

export const speakingPrompts: SpeakingPrompt[] = [
  { id: 1, part: 1, label: 'Home and neighbourhood', text: 'What kind of place do you live in?', preparationSeconds: 0, responseSeconds: 35 },
  { id: 2, part: 1, label: 'Home and neighbourhood', text: 'What do you like most about your neighbourhood?', preparationSeconds: 0, responseSeconds: 35 },
  { id: 3, part: 1, label: 'Home and neighbourhood', text: 'Has your neighbourhood changed since you first lived there?', preparationSeconds: 0, responseSeconds: 40 },
  { id: 4, part: 1, label: 'Daily routines', text: 'Which part of your daily routine do you enjoy?', preparationSeconds: 0, responseSeconds: 35 },
  { id: 5, part: 1, label: 'Daily routines', text: 'Do you prefer to plan your day or decide things as you go?', preparationSeconds: 0, responseSeconds: 40 },
  { id: 6, part: 1, label: 'Daily routines', text: 'Is there anything you would like to change about your routine?', preparationSeconds: 0, responseSeconds: 40 },
  {
    id: 7,
    part: 2,
    label: 'Individual long turn',
    text: 'Describe a public place where you enjoy spending time.',
    preparationSeconds: 60,
    responseSeconds: 120,
    cuePoints: ['where the place is', 'what it looks like', 'what you do there', 'and explain why you enjoy spending time there'],
  },
  { id: 8, part: 3, label: 'Public places', text: 'Why are public spaces important in towns and cities?', preparationSeconds: 0, responseSeconds: 55 },
  { id: 9, part: 3, label: 'Public places', text: 'Who should be responsible for maintaining public spaces?', preparationSeconds: 0, responseSeconds: 55 },
  { id: 10, part: 3, label: 'Public places', text: 'How can the design of a public place affect the way people behave?', preparationSeconds: 0, responseSeconds: 60 },
  { id: 11, part: 3, label: 'Changing cities', text: 'Do you think cities will need more or fewer shared spaces in the future?', preparationSeconds: 0, responseSeconds: 60 },
  { id: 12, part: 3, label: 'Changing cities', text: 'What difficulties can arise when an old public space is redesigned?', preparationSeconds: 0, responseSeconds: 60 },
]
