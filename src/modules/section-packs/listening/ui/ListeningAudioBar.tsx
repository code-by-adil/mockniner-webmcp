import type { FC } from "react";
import type { ListeningContentDocument } from "@/domain/objectiveContent";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import { BundledListeningAudioBar } from "./BundledListeningAudioBar";
import { KokoroListeningAudioBar } from "./KokoroListeningAudioBar";
import type { ListeningAudioBarProps } from "./listeningAudioTypes";

type Props = ListeningAudioBarProps & {
  document: ListeningContentDocument;
  audioSession: ListeningAudioSession;
};

export const ListeningAudioBar: FC<Props> = ({
  document,
  audioSession,
  ...props
}) => {
  if (document.audio.type === "bundled") {
    return (
      <BundledListeningAudioBar
        key={`bundled:${document.contentKey}`}
        {...props}
        audioAssetKey={document.audio.assetKey}
      />
    );
  }

  if (!audioSession.hydrated) {
    return (
      <span className="exam-subtle-text text-[10px] font-bold">
        Restoring saved listening audio…
      </span>
    );
  }

  return (
    <KokoroListeningAudioBar
      key={`kokoro:${document.contentKey}`}
      {...props}
      audioSession={audioSession}
    />
  );
};
