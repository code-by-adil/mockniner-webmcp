import { describe, expect, it } from 'vitest';
import { canIncludeAuthoringExample } from './authoringAccess';
import { getIeltsExample } from '@/content/ieltsExamples';
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { initialSession, sessionReducer } from '@/domain/session';
import { initialAssessmentSession } from '@/domain/assessmentSession';
import type { PracticeWorkspace } from '@/application/practiceNavigation';

const workspace = (): PracticeWorkspace => ({ native: initialSession, assessment: initialAssessmentSession, assessments: [], content: { listening: listeningDocument, reading: readingDocument, writing: writingDocument }, listeningAudio: { contentKey: listeningDocument.contentKey, phase: 'ready', source: 'bundled', readyToPlay: true, completedChunks: 0, totalChunks: 0, error: null, canRetry: false } });
const start = (contentKey: string) => sessionReducer(initialSession, { type: 'START', section: 'listening', mode: 'section', attemptId: crypto.randomUUID(), startedAt: new Date().toISOString(), contentKeys: { listening: contentKey } });

describe('authoring example access', () => {
  it('keeps complete kits available with unrelated unfinished tests', async () => {
    const w = workspace(); w.native = start(listeningDocument.contentKey);
    for (const target of ['listening', 'reading', 'writing', 'sat-style', 'gre-style']) expect(await canIncludeAuthoringExample(w, target, async () => null)).toBe(true);
  });
  it('withholds a copied example from a parked draft even under a fresh content key', async () => {
    const example = getIeltsExample('listening');
    const copied = { ...example, contentKey: 'fresh-key', name: 'Renamed practice' };
    const w = workspace(); w.native = { ...initialSession, pausedDrafts: [start(copied.contentKey)] };
    expect(await canIncludeAuthoringExample(w, 'listening', async () => copied)).toBe(false);
    expect(await canIncludeAuthoringExample(w, 'reading', async () => copied)).toBe(true);
    expect(await canIncludeAuthoringExample(w, 'sat-style', async () => copied)).toBe(true);
    expect(await canIncludeAuthoringExample(w, 'listening', async () => null)).toBe(false);
  });
  it('protects the installed SAT example but leaves GRE and IELTS available', async () => {
    const w = workspace();
    const copied = { ...getAssessmentAuthoringKit('sat-style').examplePackage, packageId: 'copied-sat', source: 'agent' as const };
    w.assessment = { ...initialAssessmentSession, attemptId: crypto.randomUUID(), packageId: copied.packageId, packageSnapshot: copied };
    expect(await canIncludeAuthoringExample(w, 'sat-style', async () => null)).toBe(false);
    expect(await canIncludeAuthoringExample(w, 'gre-style', async () => null)).toBe(true);
    expect(await canIncludeAuthoringExample(w, 'listening', async () => null)).toBe(true);
  });
});
