import { useState, type RefObject } from "react";
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
  onRestart: () => void;
  onDurationChange: (durationMs: number) => void;
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
  onRestart,
  onDurationChange,
}: AudioControlsProps) {
  const [playbackRate, setPlaybackRate] = useState(1);

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <h2>Audio Controls</h2>
        <p>{totalLines > 0 ? `Line ${Math.min(currentLine + 1, totalLines)} / ${totalLines}` : "No lines loaded"}</p>
      </div>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            event.currentTarget.playbackRate = playbackRate;
            const durationMs = Math.round(event.currentTarget.duration * 1000);
            if (Number.isFinite(durationMs) && durationMs > 0) onDurationChange(durationMs);
          }}
        />
      )}
      <div className="time-display">{formatTime(currentTimeMs)}</div>
      <div className="publish-speed-row">
        <span>Playback speed</span>
        <div className="playback-rate-controls" aria-label="Playback speed">
          {[1, 1.5, 2, 2.5, 3, 4].map((rate) => (
            <button
              type="button"
              key={rate}
              className={playbackRate === rate ? "active" : ""}
              disabled={!audioUrl}
              onClick={() => changePlaybackRate(rate)}
            >
              {rate}×
            </button>
          ))}
        </div>
      </div>
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
        <button type="button" onClick={onRestart} disabled={totalLines === 0 && !audioUrl}>
          Restart
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
