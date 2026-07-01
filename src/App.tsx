import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPanel } from "./components/AdminPanel";
import { AudioControls } from "./components/AudioControls";
import { ExportPanel } from "./components/ExportPanel";
import { Header } from "./components/Header";
import { MetadataPanel } from "./components/MetadataPanel";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { SyncPreview } from "./components/SyncPreview";
import { UploadPanel } from "./components/UploadPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import type { Metadata, UploadedTextFile, ValidationMessage } from "./types";
import { buildContentJson } from "./utils/exportJson";
import { parseTextLines } from "./utils/parseTextFile";

const commonLanguageCodes = ["en", "ru", "cs", "fr", "de", "tr", "id", "ur"];

function inferLanguageCode(fileName: string, fallbackIndex: number): string {
  const lowerName = fileName.toLowerCase();
  const match = commonLanguageCodes.find((code) => {
    return lowerName === `${code}.txt` || lowerName.includes(`.${code}.`) || lowerName.includes(`_${code}.`);
  });

  return match ?? commonLanguageCodes[fallbackIndex] ?? "";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentView, setCurrentView] = useState<"sync" | "admin">("sync");
  const [metadata, setMetadata] = useState<Metadata>({
    id: "",
    title: "",
    artist: "",
    difficulty: "beginner",
    tags: "",
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [arabicFileName, setArabicFileName] = useState("");
  const [arabicSourceText, setArabicSourceText] = useState("");
  const [arabicLines, setArabicLines] = useState<string[]>([]);
  const [translations, setTranslations] = useState<UploadedTextFile[]>([]);
  const [keepEmptyLines, setKeepEmptyLines] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);
  const [timestamps, setTimestamps] = useState<Array<number | null>>([]);
  const [firstLineStartMs, setFirstLineStartMs] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [runtimeWarnings, setRuntimeWarnings] = useState<ValidationMessage[]>([]);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl("");
      return;
    }

    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  const resetSync = useCallback((lineCount: number) => {
    setSyncStarted(false);
    setCurrentLine(0);
    setTimestamps(Array.from({ length: lineCount }, () => null));
    setFirstLineStartMs(null);
    setRuntimeWarnings([]);
  }, []);

  const loadArabicFile = useCallback(
    async (file: File | null) => {
      setArabicFileName(file?.name ?? "");
      if (!file) {
        setArabicSourceText("");
        setArabicLines([]);
        resetSync(0);
        return;
      }

      const text = await file.text();
      const lines = parseTextLines(text, keepEmptyLines);
      setArabicSourceText(text);
      setArabicLines(lines);
      resetSync(lines.length);
    },
    [keepEmptyLines, resetSync],
  );

  const loadArabicText = useCallback(
    (text: string) => {
      const lines = parseTextLines(text, keepEmptyLines);
      setArabicFileName(text.trim() ? "Pasted Arabic text" : "");
      setArabicSourceText(text);
      setArabicLines(lines);
      resetSync(lines.length);
    },
    [keepEmptyLines, resetSync],
  );

  const loadTranslationFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const fileArray = Array.from(files ?? []);
      const parsedFiles = await Promise.all(
        fileArray.map(async (file, index) => {
          const sourceText = await file.text();
          return {
            id: `file-${file.name}-${file.lastModified}-${index}`,
            fileName: file.name,
            languageCode: inferLanguageCode(file.name, index),
            sourceText,
            lines: parseTextLines(sourceText, keepEmptyLines),
          };
        }),
      );
      setTranslations((current) => [...current.filter((translation) => !translation.id.startsWith("file-")), ...parsedFiles]);
    },
    [keepEmptyLines],
  );

  const addPastedTranslation = useCallback(() => {
    const index = translations.length;
    setTranslations((current) => [
      ...current,
      {
        id: `pasted-${Date.now()}`,
        fileName: `Pasted translation ${index + 1}`,
        languageCode: commonLanguageCodes[index] ?? "",
        sourceText: "",
        lines: [],
      },
    ]);
  }, [translations.length]);

  const updateTranslationSourceText = useCallback(
    (id: string, sourceText: string) => {
      setTranslations((files) =>
        files.map((file) =>
          file.id === id ? { ...file, sourceText, lines: parseTextLines(sourceText, keepEmptyLines) } : file,
        ),
      );
    },
    [keepEmptyLines],
  );

  const changeKeepEmptyLines = useCallback(
    (nextKeepEmptyLines: boolean) => {
      setKeepEmptyLines(nextKeepEmptyLines);
      const nextArabicLines = parseTextLines(arabicSourceText, nextKeepEmptyLines);
      setArabicLines(nextArabicLines);
      resetSync(nextArabicLines.length);
      setTranslations((files) =>
        files.map((file) => ({ ...file, lines: parseTextLines(file.sourceText, nextKeepEmptyLines) })),
      );
    },
    [arabicSourceText, resetSync],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTimeMs(audio.currentTime * 1000);
    const updatePlaying = () => setIsPlaying(!audio.paused);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("seeked", updateTime);
    audio.addEventListener("play", updatePlaying);
    audio.addEventListener("pause", updatePlaying);
    audio.addEventListener("ended", updatePlaying);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("seeked", updateTime);
      audio.removeEventListener("play", updatePlaying);
      audio.removeEventListener("pause", updatePlaying);
      audio.removeEventListener("ended", updatePlaying);
    };
  }, [audioUrl]);

  const validationMessages = useMemo<ValidationMessage[]>(() => {
    const messages: ValidationMessage[] = [];
    const seenLanguageCodes = new Set<string>();

    if (!audioFile) {
      messages.push({ id: "audio-required", type: "error", text: "MP3 audio is required." });
    } else if (!audioFile.name.toLowerCase().endsWith(".mp3")) {
      messages.push({ id: "audio-type", type: "warning", text: "Selected audio file should be an MP3." });
    }

    if (!arabicFileName) {
      messages.push({ id: "arabic-required", type: "error", text: "Arabic .txt file is required." });
    } else if (arabicLines.length === 0) {
      messages.push({ id: "arabic-empty", type: "error", text: "Arabic line count must be greater than 0." });
    }

    translations.forEach((translation) => {
      const languageCode = translation.languageCode.trim().toLowerCase();
      const label = languageCode || translation.fileName;
      if (translation.lines.length !== arabicLines.length) {
        messages.push({
          id: `line-count-${translation.id}`,
          type: "warning",
          text: `Arabic has ${arabicLines.length} lines, ${label} has ${translation.lines.length} lines.`,
        });
      }
      if (!languageCode) {
        messages.push({
          id: `language-${translation.id}`,
          type: "warning",
          text: `${translation.fileName} needs a language code before export.`,
        });
      } else if (languageCode === "ar") {
        messages.push({
          id: `language-ar-${translation.id}`,
          type: "warning",
          text: `${translation.fileName} uses ar, which is reserved for the Arabic source file.`,
        });
      } else if (seenLanguageCodes.has(languageCode)) {
        messages.push({
          id: `language-duplicate-${translation.id}`,
          type: "warning",
          text: `More than one translation uses the ${languageCode} language code. Only one field can exist in JSON.`,
        });
      } else {
        seenLanguageCodes.add(languageCode);
      }
    });

    if (messages.length === 0) {
      messages.push({ id: "ready", type: "success", text: "Files are ready to sync." });
    }

    return messages;
  }, [arabicFileName, arabicLines.length, audioFile, translations]);

  const hasBlockingErrors = validationMessages.some((message) => message.type === "error");

  const seekAudio = useCallback((deltaMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + deltaMs / 1000);
    setCurrentTimeMs(audio.currentTime * 1000);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const addRuntimeWarning = useCallback((text: string) => {
    setRuntimeWarnings((warnings) => [
      { id: `${Date.now()}-${text}`, type: "warning", text },
      ...warnings.slice(0, 3),
    ]);
  }, []);

  const markFirstLineStart = useCallback(() => {
    const audio = audioRef.current;
    if (!syncStarted || !audio) return;
    setFirstLineStartMs(Math.round(audio.currentTime * 1000));
  }, [syncStarted]);

  const markLineEnd = useCallback(() => {
    const audio = audioRef.current;
    if (!syncStarted || !audio) return;
    if (currentLine >= arabicLines.length) {
      addRuntimeWarning("Enter was pressed after all lines are complete.");
      return;
    }

    const endMs = Math.round(audio.currentTime * 1000);
    const previousEndMs = currentLine === 0 ? firstLineStartMs ?? 0 : timestamps[currentLine - 1];
    if (previousEndMs !== null && endMs < previousEndMs) {
      addRuntimeWarning("Timestamp goes backwards. Seek forward or undo before continuing.");
      return;
    }

    setTimestamps((current) => {
      const next = [...current];
      next[currentLine] = endMs;
      return next;
    });
    setCurrentLine((line) => Math.min(line + 1, arabicLines.length));
  }, [addRuntimeWarning, arabicLines.length, currentLine, firstLineStartMs, syncStarted, timestamps]);

  const undoTimestamp = useCallback(() => {
    if (!syncStarted) return;
    setTimestamps((current) => {
      const next = [...current];
      let lastMarkedIndex = -1;
      next.forEach((timestamp, index) => {
        if (timestamp !== null) {
          lastMarkedIndex = index;
        }
      });
      if (lastMarkedIndex >= 0) {
        next[lastMarkedIndex] = null;
        setCurrentLine(lastMarkedIndex);
      }
      return next;
    });
  }, [syncStarted]);

  const restartSync = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setCurrentTimeMs(0);
    setIsPlaying(false);
    resetSync(arabicLines.length);
  }, [arabicLines.length, resetSync]);

  const startSync = useCallback(() => {
    if (hasBlockingErrors) {
      addRuntimeWarning("Cannot start sync until the required files are valid.");
      return;
    }

    setSyncStarted(true);
    setCurrentLine(timestamps.findIndex((timestamp) => timestamp === null) === -1 ? arabicLines.length : timestamps.findIndex((timestamp) => timestamp === null));
    void audioRef.current?.play();
  }, [addRuntimeWarning, arabicLines.length, hasBlockingErrors, timestamps]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!syncStarted || isTypingTarget(event.target)) return;

      if (event.key === "Enter") {
        event.preventDefault();
        markLineEnd();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        markFirstLineStart();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        undoTimestamp();
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekAudio(event.shiftKey ? -5000 : -1000);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekAudio(event.shiftKey ? 5000 : 1000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [markFirstLineStart, markLineEnd, seekAudio, syncStarted, togglePlay, undoTimestamp]);

  const exportWarnings = useMemo<ValidationMessage[]>(() => {
    const warnings = validationMessages.filter((message) => message.type === "warning");
    if (firstLineStartMs === null && arabicLines.length > 0) {
      warnings.push({
        id: "first-line-default",
        type: "warning",
        text: "First line start is not set. Export will use 0 for line 0 startMs.",
      });
    }
    if (timestamps.some((timestamp) => timestamp === null) && arabicLines.length > 0) {
      warnings.push({
        id: "incomplete-timestamps",
        type: "warning",
        text: "Some lines are missing endMs values. They will export as null.",
      });
    }
    translations.forEach((translation) => {
      if (translation.lines.length < arabicLines.length) {
        warnings.push({
          id: `missing-${translation.id}`,
          type: "warning",
          text: `${translation.languageCode || translation.fileName} has missing translation lines. Missing values export as empty strings.`,
        });
      }
    });
    return warnings;
  }, [arabicLines.length, firstLineStartMs, timestamps, translations, validationMessages]);

  const contentJson = useMemo(() => {
    if (!audioFile || arabicLines.length === 0) return null;

    return buildContentJson({
      metadata,
      audioFileName: audioFile.name,
      arabicLines,
      translations,
      timestamps,
      firstLineStartMs: firstLineStartMs ?? 0,
    });
  }, [arabicLines, audioFile, firstLineStartMs, metadata, timestamps, translations]);

  return (
    <main className="app-shell">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      {currentView === "sync" ? (
        <div className="layout-grid">
          <div className="main-column">
            <MetadataPanel metadata={metadata} onChange={setMetadata} />
            <UploadPanel
              audioFile={audioFile}
              arabicFileName={arabicFileName}
              arabicText={arabicSourceText}
              translations={translations}
              keepEmptyLines={keepEmptyLines}
              onAudioUpload={setAudioFile}
              onArabicUpload={loadArabicFile}
              onArabicTextChange={loadArabicText}
              onTranslationsUpload={loadTranslationFiles}
              onAddPastedTranslation={addPastedTranslation}
              onTranslationLanguageChange={(id, languageCode) =>
                setTranslations((files) =>
                  files.map((file) => (file.id === id ? { ...file, languageCode: languageCode.trim() } : file)),
                )
              }
              onTranslationTextChange={updateTranslationSourceText}
              onRemoveTranslation={(id) => {
                setTranslations((files) => files.filter((file) => file.id !== id));
              }}
              onKeepEmptyLinesChange={changeKeepEmptyLines}
            />
            <ValidationPanel messages={[...validationMessages, ...runtimeWarnings]} />
            <AudioControls
              audioRef={audioRef}
              audioUrl={audioUrl}
              currentTimeMs={currentTimeMs}
              isPlaying={isPlaying}
              currentLine={currentLine}
              totalLines={arabicLines.length}
              syncStarted={syncStarted}
              firstLineStartMs={firstLineStartMs}
              canStart={!hasBlockingErrors}
              onStartSync={startSync}
              onTogglePlay={togglePlay}
              onSeek={seekAudio}
              onMarkFirstLineStart={markFirstLineStart}
              onUndo={undoTimestamp}
              onRestart={restartSync}
            />
            <SyncPreview
              arabicLines={arabicLines}
              translations={translations}
              currentLine={currentLine}
              timestamps={timestamps}
            />
          </div>
          <aside className="side-column">
            <ShortcutHelp />
            <ExportPanel contentJson={contentJson} warnings={exportWarnings} />
          </aside>
        </div>
      ) : (
        <AdminPanel generatedContentJson={contentJson} generatedAudioFile={audioFile} />
      )}
    </main>
  );
}

export default App;
