import { useMemo, useState } from "react";
import { MessageCircle, Mic } from "lucide-react";
import { ExamUiBoundary } from "@/app/layouts/UiLayerBoundary";
import { Header } from "@/modules/exam-engine/ui/Header";
import {
  StandardSpeakingMode,
  type SpeakingQuestion,
} from "@/modules/section-packs/speaking/ui/StandardSpeakingMode";
import { SPEAKING_CONTENT_KEY, speakingPrompts } from "@/content/speaking";
import type { CompleteSpeakingAttemptInput } from "@/application/attemptWriter";
import type { SpeakingSubmission } from "@/domain/types";
import { AgentSpeakingMode } from "@/modules/section-packs/speaking/ui/AgentSpeakingMode";

type Props = {
  onExit: () => void;
  onSubmit: (input: CompleteSpeakingAttemptInput) => Promise<SpeakingSubmission>;
};

export function LocalSpeakingExam({ onExit, onSubmit }: Props) {
  const [mode, setMode] = useState<"choose" | "standard" | "agent">("choose");
  const questions = useMemo<SpeakingQuestion[]>(
    () =>
      speakingPrompts.map((prompt) => ({
        id: prompt.id,
        part: `Part ${prompt.part}`,
        text: prompt.text,
        timeLimit: prompt.responseSeconds,
      })),
    [],
  );

  return (
    <ExamUiBoundary>
      <div className="exam-live-speaking-shell h-screen overflow-hidden font-sans flex flex-col">
        <Header
          testType="speaking"
          position="contained"
          onExit={onExit}
        />
        <div className="flex-1 relative flex flex-col pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-4 sm:pb-4 min-h-0 overflow-y-auto">
          {mode === "standard" ? (
            <StandardSpeakingMode
              contentKey={SPEAKING_CONTENT_KEY}
              onComplete={onSubmit}
              questions={questions}
            />
          ) : mode === "agent" ? (
            <AgentSpeakingMode onComplete={onSubmit} />
          ) : (
            <main className="mx-auto flex min-h-[calc(100vh-130px)] w-full max-w-4xl flex-col justify-center px-4 py-10 sm:px-6">
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--exam-accent)]">Speaking practice</div>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--exam-text)] sm:text-4xl">Choose how you want to practise.</h1>
                <p className="mx-auto mt-3 max-w-2xl leading-7 text-[var(--exam-text-muted)]">Both modes record answers locally. Agent interview adds an adaptive examiner voice and transcript-based feedback through WebMCP.</p>
              </div>
              <div className="mt-9 grid gap-5 md:grid-cols-2">
                <button type="button" onClick={() => setMode("agent")} className="rounded-xl border-2 border-[var(--exam-accent)] bg-[var(--exam-surface)] p-6 text-left shadow-sm transition-transform hover:-translate-y-0.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded bg-[var(--exam-accent)] text-white"><MessageCircle size={21} /></span>
                  <span className="mt-5 block text-xl font-bold">Agent interview</span>
                  <span className="mt-2 block leading-6 text-[var(--exam-text-muted)]">Your agent asks one question at a time. Kokoro speaks it, you record an answer, and the transcript goes back to the agent.</span>
                  <span className="mt-5 block text-sm font-bold text-[var(--exam-accent)]">Recommended</span>
                </button>
                <button type="button" onClick={() => setMode("standard")} className="rounded-xl border border-[var(--exam-border)] bg-[var(--exam-surface)] p-6 text-left shadow-sm transition-transform hover:-translate-y-0.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded bg-gray-900 text-white"><Mic size={21} /></span>
                  <span className="mt-5 block text-xl font-bold">Standard practice</span>
                  <span className="mt-2 block leading-6 text-[var(--exam-text-muted)]">Answer the fixed IELTS prompts on screen, then check each transcript before saving it.</span>
                </button>
              </div>
            </main>
          )}
        </div>
      </div>
    </ExamUiBoundary>
  );
}
