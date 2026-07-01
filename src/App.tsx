import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AdminPanel } from "./components/AdminPanel";
import { AudioControls } from "./components/AudioControls";
import { DictionaryPanel } from "./components/DictionaryPanel";
import { ExistingJsonPanel } from "./components/ExistingJsonPanel";
import { ExportPanel } from "./components/ExportPanel";
import { Header } from "./components/Header";
import { MetadataPanel } from "./components/MetadataPanel";
import { SetupPanel } from "./components/SetupPanel";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { SyncPreview } from "./components/SyncPreview";
import { UploadPanel } from "./components/UploadPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import type { Metadata, NushudContentJson, UploadedTextFile, ValidationMessage } from "./types";
import { buildContentJson } from "./utils/exportJson";
import { parseTextLines } from "./utils/parseTextFile";

const commonLanguageCodes = ["en", "ru", "cs", "fr", "de", "tr", "id", "ur"];
const configStorageKey = "nushudAdminConfig";

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
  const [workflowStep, setWorkflowStep] = useState<"checking" | "setup" | "sync" | "publish" | "dictionary">("checking");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
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
  const [existingJsonFileName, setExistingJsonFileName] = useState("");
  const [existingContentJson, setExistingContentJson] = useState<NushudContentJson | null>(null);
  const [existingJsonError, setExistingJsonError] = useState("");
  const [continueMessage, setContinueMessage] = useState("");

  useEffect(() => {
    const restoreSession = async () => {
      const config = readConfig();

      if (!config) {
        setWorkflowStep("setup");
        return;
      }

      const client = createClient(config.url, config.anonKey);
      const { data } = await client.auth.getUser();

      if (!data.user) {
        setWorkflowStep("setup");
        return;
      }

      const { data: adminResult, error } = await client.rpc("is_admin");

      if (error || adminResult !== true) {
        setWorkflowStep("setup");
        return;
      }

      setSupabase(client);
      setAdminEmail(data.user.email ?? "");
      setWorkflowStep("sync");
    };

    void restoreSession();
  }, []);

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

  const loadExistingJson = useCallback(async (file: File | null) => {
    setExistingJsonFileName(file?.name ?? "");
    setExistingJsonError("");
    setContinueMessage("");

    if (!file) {
      setExistingContentJson(null);
      return;
    }

    try {
      const json = JSON.parse(await file.text()) as NushudContentJson;
      validateExistingContentJson(json);
      setExistingContentJson(json);
    } catch (error) {
      setExistingContentJson(null);
      setExistingJsonError(error instanceof Error ? error.message : "Existing JSON is not valid.");
    }
  }, []);

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
    if (existingContentJson) return existingContentJson;
    if (!audioFile || arabicLines.length === 0) return null;

    return buildContentJson({
      metadata,
      audioFileName: audioFile.name,
      arabicLines,
      translations,
      timestamps,
      firstLineStartMs: firstLineStartMs ?? 0,
    });
  }, [arabicLines, audioFile, existingContentJson, firstLineStartMs, metadata, timestamps, translations]);

  const contentJsonSource = existingContentJson ? "imported" : "generated";

  const continueToPublish = useCallback(() => {
    setContinueMessage("");

    if (!contentJson) {
      setContinueMessage("Create or import a timed lyrics JSON first.");
      return;
    }

    if (!audioFile) {
      setContinueMessage("Select the audio file before continuing. The JSON is ready, but the app still needs the MP3 to upload.");
      return;
    }

    if (contentJson.audioFileName && audioFile.name !== contentJson.audioFileName) {
      setContinueMessage(`Selected audio does not match JSON. JSON expects ${contentJson.audioFileName}, selected ${audioFile.name}.`);
      return;
    }

    setWorkflowStep("publish");
  }, [audioFile, contentJson]);

  return (
    <main className="app-shell">
      <Header
        currentView={
          workflowStep === "sync" || workflowStep === "publish" || workflowStep === "dictionary"
            ? workflowStep
            : undefined
        }
        onNavigate={
          supabase
            ? (view) => {
                setContinueMessage("");
                setWorkflowStep(view);
              }
            : undefined
        }
      />
      {workflowStep === "checking" && (
        <section className="panel setup-panel">
          <div className="panel-heading">
            <h2>Opening NUSHUD Tool</h2>
            <p>Checking this browser session</p>
          </div>
          <p className="status-text">Loading saved login.</p>
        </section>
      )}
      {workflowStep === "setup" && (
        <SetupPanel
          onReady={(client, email) => {
            setSupabase(client);
            setAdminEmail(email);
            setWorkflowStep("sync");
          }}
        />
      )}
      {workflowStep === "sync" && (
        <div className="layout-grid">
          <div className="main-column">
            <ExistingJsonPanel
              existingJsonFileName={existingJsonFileName}
              existingJson={existingContentJson}
              onJsonUpload={loadExistingJson}
              onClear={() => {
                setExistingJsonFileName("");
                setExistingContentJson(null);
                setExistingJsonError("");
              }}
            />
            {existingJsonError && (
              <section className="panel">
                <div className="message error">{existingJsonError}</div>
              </section>
            )}
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
            <ExportPanel
              contentJson={contentJson}
              warnings={exportWarnings}
              contentJsonSource={contentJsonSource}
              continueMessage={continueMessage}
              onContinue={continueToPublish}
            />
          </aside>
        </div>
      )}
      {workflowStep === "publish" && supabase && contentJson && audioFile && (
        <AdminPanel
          supabase={supabase}
          adminEmail={adminEmail}
          generatedContentJson={contentJson}
          generatedAudioFile={audioFile}
          onBack={() => setWorkflowStep("sync")}
        />
      )}
      {workflowStep === "dictionary" && supabase && <DictionaryPanel supabase={supabase} adminEmail={adminEmail} />}
    </main>
  );
}

function readConfig(): { url: string; anonKey: string } | null {
  const raw = localStorage.getItem(configStorageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { url: string; anonKey: string };
  } catch {
    return null;
  }
}

function validateExistingContentJson(json: NushudContentJson) {
  if (!json || typeof json !== "object") {
    throw new Error("JSON file must contain an object.");
  }

  if (!json.id || !json.title || !json.artist) {
    throw new Error("JSON needs id, title, and artist.");
  }

  if (!Array.isArray(json.lines) || json.lines.length === 0) {
    throw new Error("JSON needs a non-empty lines array.");
  }

  json.lines.forEach((line, index) => {
    if (typeof line.ar !== "string" || !line.ar.trim()) {
      throw new Error(`Line ${index + 1} needs ar.`);
    }

    if (!Number.isFinite(line.startMs) || line.endMs !== null && !Number.isFinite(line.endMs)) {
      throw new Error(`Line ${index + 1} has invalid timing.`);
    }
  });
}

export default App;
