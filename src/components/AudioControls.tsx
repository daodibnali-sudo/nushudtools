import type { RefObject } from "react";
import { formatTime } from "../utils/formatTime";

type AudioControlsProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  audioUrl: string;
  currentTimeMs: number;
  isPlaying: boolean;
  currentLine: number;
  totalLines: number;
  syncStarted: boolean;
  firstLineStartMs: number | null;
  canStart: boolean;
  onStartSync: () => void;
  onTogglePlay: () => void;
  onSeek: (deltaMs: number) => void;
  onMarkFirstLineStart: () => void;
  onUndo: () => void;
};

export function AudioControls({
  audioRef,
  audioUrl,
  currentTimeMs,
  isPlaying,
  currentLine,
  totalLines,
  syncStarted,
  firstLineStartMs,
  canStart,
  onStartSync,
  onTogglePlay,
  onSeek,
  onMarkFirstLineStart,
  onUndo,
}: AudioControlsProps) {
  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <h2>Audio Controls</h2>
        <p>{totalLines > 0 ? `Line ${Math.min(currentLine + 1, totalLines)} / ${totalLines}` : "No lines loaded"}</p>
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      <div className="time-display">{formatTime(currentTimeMs)}</div>
      <div className="button-row">
        <button type="button" className="primary-button" disabled={!canStart} onClick={onStartSync}>
          Start Sync
        </button>
        <button type="button" onClick={onTogglePlay} disabled={!audioUrl}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => onSeek(-1000)} disabled={!audioUrl}>
          -1s
        </button>
        <button type="button" onClick={() => onSeek(1000)} disabled={!audioUrl}>
          +1s
        </button>
        <button type="button" onClick={() => onSeek(-5000)} disabled={!audioUrl}>
          -5s
        </button>
        <button type="button" onClick={() => onSeek(5000)} disabled={!audioUrl}>
          +5s
        </button>
        <button type="button" onClick={onUndo} disabled={!syncStarted}>
          Undo
        </button>
        <button type="button" onClick={onMarkFirstLineStart} disabled={!syncStarted}>
          Mark First Line Start
        </button>
      </div>
      <div className={firstLineStartMs === null ? "status-text warning-text" : "status-text success-text"}>
        {firstLineStartMs === null
          ? "First line start not set. Export will default it to 0."
          : `First line starts at ${formatTime(firstLineStartMs)}`}
      </div>
    </section>
  );
}
