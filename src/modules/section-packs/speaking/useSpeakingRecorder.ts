import { useCallback, useEffect, useRef } from "react";

type AudioContextConstructor = typeof AudioContext;

export type RecordedSpeakingResponse = {
  audio: Blob;
  durationMs: number;
};

function getAudioContextConstructor(): AudioContextConstructor | null {
  return (
    window.AudioContext ||
    (window as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext ||
    null
  );
}

export function useSpeakingRecorder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const responsePromiseRef = useRef<Promise<RecordedSpeakingResponse> | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);

  const start = useCallback(async () => {
    if (recorderRef.current?.state === "recording") return;
    if (startPromiseRef.current) return startPromiseRef.current;

    const startPromise = (async () => {
      streamRef.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = streamRef.current;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const startedAt = performance.now();
      recorderRef.current = recorder;

      const AudioContextClass = getAudioContextConstructor();
      if (!AudioContextClass) {
        recorderRef.current = null;
        throw new Error("AudioContext is not available in this browser.");
      }
      audioContextRef.current ??= new AudioContextClass();
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 64;
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      sourceNode.connect(analyser);
      sourceNodeRef.current = sourceNode;
      analyserRef.current = analyser;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      const drawVisualizer = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || recorder.state !== "recording") return;

        analyser.getByteFrequencyData(frequencyData);
        context.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / frequencyData.length) * 2.5;
        let x = 0;
        frequencyData.forEach((datum, index) => {
          const barHeight = datum / 2;
          const red = barHeight + 25 * (index / frequencyData.length);
          const green = 250 * (index / frequencyData.length);
          context.fillStyle = `rgb(${red},${green},50)`;
          context.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        });
        animationFrameRef.current = requestAnimationFrame(drawVisualizer);
      };

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      responsePromiseRef.current = new Promise((resolve) => {
        recorder.onstop = () => {
          if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          sourceNodeRef.current?.disconnect();
          analyserRef.current?.disconnect();
          sourceNodeRef.current = null;
          analyserRef.current = null;
          resolve({
            audio: new Blob(chunks, {
              type: recorder.mimeType || chunks[0]?.type || "audio/webm",
            }),
            durationMs: Math.max(0, performance.now() - startedAt),
          });
        };
      });

      recorder.start();
      drawVisualizer();
    })();

    startPromiseRef.current = startPromise;
    try {
      await startPromise;
    } finally {
      startPromiseRef.current = null;
    }
  }, []);

  const stop = useCallback(async (): Promise<RecordedSpeakingResponse | null> => {
    const recorder = recorderRef.current;
    const response = responsePromiseRef.current;
    if (!recorder || !response) return null;
    if (recorder.state !== "inactive") recorder.stop();
    const completed = await response;
    recorderRef.current = null;
    responsePromiseRef.current = null;
    return completed;
  }, []);

  useEffect(() => () => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    sourceNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
  }, []);

  return { canvasRef, start, stop };
}
