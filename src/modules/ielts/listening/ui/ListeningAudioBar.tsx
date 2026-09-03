import { useEffect, type FC } from "react";
import type { ListeningContentDocument } from "@/domain/objectiveContent";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import { BundledListeningAudioBar } from "./BundledListeningAudioBar";
import { KokoroListeningAudioBar } from "./KokoroListeningAudioBar";
import type { ListeningAudioBarProps } from "./listeningAudioTypes";
import { ListeningAudioActions } from "./ListeningAudioControls";

type Props = ListeningAudioBarProps & {
  document: ListeningContentDocument;
  audioSession: ListeningAudioSession;
};

export const ListeningAudioBar: FC<Props> = ({
  document,
  audioSession,
  ...props
}) => {
  const { onUiStatus } = props;
  useEffect(() => {
    if (document.audio.type !== "kokoro" || audioSession.hydrated) return;
    onUiStatus?.({
      state: audioSession.error ? "error" : "loading",
      audioPart: null,
      isInSilence: false,
      silenceEndSec: null,
    });
  }, [document.audio.type, audioSession.hydrated, audioSession.error, onUiStatus]);

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
    if (audioSession.error) {
      return (
        <ListeningAudioActions placement={props.placement ?? "inline"}>
          <div role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-600">
            <span>{audioSession.error}</span>
            <button type="button" onClick={audioSession.retry} className="exam-control-button rounded border px-2 py-1">
              Retry
            </button>
          </div>
        </ListeningAudioActions>
      );
    }
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
