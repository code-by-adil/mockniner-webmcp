import { useMemo, useState } from "react";
import { ExamUiBoundary } from "@/app/layouts/UiLayerBoundary";
import { Header } from "@/modules/exam-engine/ui/Header";
import {
  StandardSpeakingMode,
  type SpeakingQuestion,
} from "@/modules/section-packs/speaking/ui/StandardSpeakingMode";
import { GlobalMultiStepThinkingLoader } from "@/shared/ui/global/GlobalMultiStepThinkingLoader";
import { SPEAKING_CONTENT_KEY, speakingPrompts } from "@/content/speaking";
import type { CompleteSpeakingAttemptInput } from "@/application/attemptWriter";

type Props = {
  onExit: () => void;
  onSubmit: (input: CompleteSpeakingAttemptInput) => Promise<unknown>;
};

export function LocalSpeakingExam({ onExit, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
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
        <GlobalMultiStepThinkingLoader
          visible={loading}
          badgeLabel="Saving Speaking"
          title="Finalizing speaking responses"
          steps={[
            {
              text: "Preparing speaking evidence",
              detail: "Consolidating the locally recorded responses.",
            },
            {
              text: "Saving your attempt",
              detail: "Making the attempt available for agent evaluation.",
            },
          ]}
          note="Your agent can evaluate the saved attempt through the application tools."
        />

        <div className="flex-1 relative flex flex-col pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-4 sm:pb-4 min-h-0 overflow-y-auto">
          <StandardSpeakingMode
            contentKey={SPEAKING_CONTENT_KEY}
            onComplete={onSubmit}
            setLoading={setLoading}
            questions={questions}
          />
        </div>
      </div>
    </ExamUiBoundary>
  );
}
