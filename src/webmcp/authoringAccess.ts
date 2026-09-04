import type { PracticeWorkspace } from '@/application/practiceNavigation';
import type { PracticeContentDocument } from '@/domain/contentDocument';
import { getIeltsDrafts } from '@/domain/session';
import { getIeltsExample } from '@/content/ieltsExamples';
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples';
import { ASSESSMENT_AUTHORING_TEMPLATE_IDS } from '@/domain/assessment';

// Compare question content, not mutable package IDs or question numbering. A
// copied example with a fresh ID must not reveal answers to an unfinished test.
function questionSignatures(value: unknown): Set<string> {
  const result = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if ('questionId' in record || ('interaction' in record && 'prompt' in record)) {
      const content = Object.fromEntries(Object.entries(record).filter(([key]) => !['id', 'questionId', 'answer', 'answers', 'correctAnswer', 'scoring', 'explanation'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
      result.add(JSON.stringify(content));
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return result;
}
export function sharesExampleQuestions(example: unknown, practice: unknown) {
  const questions = questionSignatures(example);
  return [...questionSignatures(practice)].some(question => questions.has(question));
}

export async function canIncludeAuthoringExample(workspace: PracticeWorkspace, target: string, loadContent: (key: string) => Promise<PracticeContentDocument | null>): Promise<boolean> {
  if (target === 'listening' || target === 'reading' || target === 'writing') {
    if (target === 'writing') return true; // Writing examples contain no answer keys.
    const keys = new Set(getIeltsDrafts(workspace.native).map(draft => draft.contentKeys?.[target] ?? (draft.mode === 'full' || draft.currentSection === target ? workspace.content[target].contentKey : null)).filter(key => key !== null && key !== undefined));
    const example = getIeltsExample(target);
    for (const key of keys) {
      const document = workspace.content[target].contentKey === key ? workspace.content[target] : await loadContent(key);
      if (!document || sharesExampleQuestions(example, document)) return false;
    }
    return true;
  }
  const template = ASSESSMENT_AUTHORING_TEMPLATE_IDS.find(id => id === target);
  if (!template) return false;
  const draft = workspace.assessment;
  if (!draft.attemptId) return true;
  const assessment = draft.packageSnapshot ?? workspace.assessments.find(item => item.packageId === draft.packageId);
  return Boolean(assessment && !sharesExampleQuestions(getAssessmentAuthoringKit(template).examplePackage, assessment));
}
