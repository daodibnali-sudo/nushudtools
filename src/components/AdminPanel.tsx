import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NushudContentJson } from "../types";
import { makeDownloadName } from "../utils/exportJson";

type AdminPanelProps = {
  supabase: SupabaseClient;
  adminEmail: string;
  generatedContentJson: NushudContentJson;
  generatedAudioFile: File;
  onBack: () => void;
};

type LyricsMetadata = {
  slug: string;
  title: string;
  artistName: string;
  difficulty: NushudContentJson["difficulty"];
  tags: string[];
  audioFileName: string;
  durationMs: number;
  lineCount: number;
  languages: string[];
};

type DictionaryEntry = {
  word: string;
  meaning: string[];
  meaningRu?: string[];
  root?: string;
  plural?: string;
  imperative?: string;
  present?: string;
  wazn?: string;
  masculine?: string;
  feminine?: string;
  governs?: string;
  literalMeaning?: string;
  partOfSpeech?: string;
  translations?: unknown;
  similars?: unknown;
  similar?: unknown;
  [key: string]: unknown;
};

type Dictionary = Record<string, DictionaryEntry>;
type WordContext = {
  word: string;
  normalizedWord: string;
  lines: Array<{
    ar: string;
    en?: string;
  }>;
};

const dictionaryBucket = "dictionary";
const dictionaryPath = "words.json";
const typeFields: Record<string, Array<{ key: string; label: string }>> = {
  noun: [{ key: "root", label: "Root" }, { key: "plural", label: "Plural" }],
  verb: [{ key: "imperative", label: "Imperative" }, { key: "present", label: "Present" }, { key: "wazn", label: "Wazn" }],
  adjective: [{ key: "masculine", label: "Masculine" }, { key: "feminine", label: "Feminine" }, { key: "plural", label: "Plural" }],
  adverb: [],
  pronoun: [],
  particle: [],
  preposition: [{ key: "governs", label: "Governs" }],
  conjunction: [],
  expression: [{ key: "literalMeaning", label: "Literal meaning" }],
};

export function AdminPanel({
  supabase,
  adminEmail,
  generatedContentJson,
  generatedAudioFile,
  onBack,
}: AdminPanelProps) {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [newWordEntries, setNewWordEntries] = useState<DictionaryEntry[]>([]);
  const [isFillingWords, setIsFillingWords] = useState(false);
  const [publishState, setPublishState] = useState("Draft");
  const [log, setLog] = useState("Ready.");

  const lyricsMetadata = useMemo(() => getLyricsMetadata(generatedContentJson), [generatedContentJson]);
  const metadataPreview = useMemo(
    () =>
      [
        lyricsMetadata.title,
        `Slug: ${lyricsMetadata.slug}`,
        `Artist: ${lyricsMetadata.artistName}`,
        `Difficulty: ${lyricsMetadata.difficulty}`,
        lyricsMetadata.tags.length > 0 ? `Tags: ${lyricsMetadata.tags.join(", ")}` : "Tags: none",
        `Duration: ${lyricsMetadata.durationMs} ms`,
        `Lines: ${lyricsMetadata.lineCount}`,
        `Audio: ${generatedAudioFile.name}`,
        lyricsMetadata.languages.length > 0 ? `Languages: ${lyricsMetadata.languages.join(", ")}` : "",
      ].filter(Boolean),
    [generatedAudioFile.name, lyricsMetadata],
  );

  const writeLog = (message: string) => {
    setLog(`[${new Date().toLocaleTimeString()}] ${message}`);
  };

  const updateNewWordEntry = (index: number, patch: Partial<DictionaryEntry>) => {
    setNewWordEntries((entries) =>
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  };

  const findNewWords = async () => {
    try {
      const existingDictionary = await downloadDictionary(supabase);
      const missingWords = getMissingDictionaryWords(generatedContentJson, existingDictionary);

      setNewWordEntries((current) => {
        const currentByKey = new Map(current.map((entry) => [normalizeArabicWord(entry.word), entry]));
        return missingWords.map((word) => currentByKey.get(word) ?? createDraftEntry(word));
      });

      writeLog(
        missingWords.length > 0
          ? `Found ${missingWords.length} new words that need dictionary entries.`
          : "No new dictionary words found for this nasheed.",
      );
    } catch (error) {
      writeLog(error instanceof Error ? error.message : "Could not find new words.");
    }
  };

  const fillWordsWithAi = async () => {
    try {
      if (newWordEntries.length === 0) {
        throw new Error("Find new words first.");
      }

      setIsFillingWords(true);
      const filledEntries = await requestAiDictionaryEntries(
        supabase,
        buildWordContexts(generatedContentJson, newWordEntries.map((entry) => entry.word)),
      );

      const filledByKey = new Map(filledEntries.map((entry) => [normalizeArabicWord(entry.word), entry]));
      setNewWordEntries((current) =>
        current.map((entry) => filledByKey.get(normalizeArabicWord(entry.word)) ?? entry),
      );
      writeLog(`AI filled ${filledEntries.length} dictionary entries. Review them before publishing.`);
    } catch (error) {
      writeLog(error instanceof Error ? error.message : "AI fill failed.");
    } finally {
      setIsFillingWords(false);
    }
  };

  const validateFiles = async () => {
    try {
      validateLyricsJson(generatedContentJson);
      validateSelectedAudioFile(lyricsMetadata, generatedAudioFile);

      if (!coverFile) {
        throw new Error("Choose cover image first.");
      }

      const existingDictionary = await downloadDictionary(supabase);
      const newWords = dictionaryFromEntries(newWordEntries);
      const dictionary = mergeDictionaries(existingDictionary, newWords);
      const missingWords = getMissingDictionaryWords(generatedContentJson, dictionary);

      writeLog(
        missingWords.length > 0
          ? `Validation passed. Publishing is allowed with ${missingWords.length} dictionary words still missing: ${formatMissingWords(missingWords)}`
          : `Validation passed. ${Object.keys(newWords).length} new word entries will be merged into ${dictionaryPath}.`,
      );
    } catch (error) {
      writeLog(error instanceof Error ? error.message : "Validation failed.");
    }
  };

  const publishNasheed = async () => {
    try {
      validateLyricsJson(generatedContentJson);
      validateSelectedAudioFile(lyricsMetadata, generatedAudioFile);

      if (!coverFile) {
        throw new Error("Choose cover image first.");
      }

      const existingDictionary = await downloadDictionary(supabase);
      const newWords = dictionaryFromEntries(newWordEntries);
      const dictionary = mergeDictionaries(existingDictionary, newWords);
      const missingWords = getMissingDictionaryWords(generatedContentJson, dictionary);

      await uploadDictionary(supabase, dictionary);

      const lyricsUploadFile = jsonToFile(generatedContentJson, makeDownloadName(lyricsMetadata.title));
      const coverUrl = await uploadFile(
        supabase,
        "nasheed-covers",
        `${lyricsMetadata.slug}.${extension(coverFile.name)}`,
        coverFile,
      );
      const audioUrl = await uploadFile(
        supabase,
        "nasheed-audio",
        `${lyricsMetadata.slug}.${extension(generatedAudioFile.name)}`,
        generatedAudioFile,
      );
      const lyricsJsonUrl = await uploadFile(supabase, "nasheed-lyrics", `${lyricsMetadata.slug}.json`, lyricsUploadFile);
      const normalizedWords = getNormalizedWordsFromLyrics(generatedContentJson);

      const { error } = await supabase.from("nasheeds").insert({
        title: lyricsMetadata.title,
        artist_name: lyricsMetadata.artistName,
        cover_url: coverUrl,
        audio_url: audioUrl,
        lyrics_json_url: lyricsJsonUrl,
        duration_ms: lyricsMetadata.durationMs,
        difficulty: lyricsMetadata.difficulty,
        tags: lyricsMetadata.tags,
        total_words: normalizedWords.length,
        new_words_count: new Set(normalizedWords).size,
        is_published: true,
      });

      if (error) {
        throw new Error(`Publish failed: ${error.message}`);
      }

      setPublishState("Published");
      writeLog(
        missingWords.length > 0
          ? `Published with ${missingWords.length} dictionary words still missing. You can complete words.json later.`
          : "Published. NUSHUD can now load this nasheed from Supabase.",
      );
    } catch (error) {
      writeLog(error instanceof Error ? error.message : "Publish failed.");
    }
  };

  return (
    <div className="admin-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Publish Nasheed</h2>
            <p>{adminEmail}</p>
          </div>
          <span className="badge">{publishState}</span>
        </div>

        <div className="metadata-preview">
          {metadataPreview.map((line, index) =>
            index === 0 ? (
              <strong key={line}>{line}</strong>
            ) : (
              <span key={line}>{line}</span>
            ),
          )}
        </div>

        <div className="upload-grid admin-upload-grid">
          <label className="file-box drop-zone">
            Cover image
            <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
            <span>{coverFile?.name ?? "Required"}</span>
          </label>
        </div>

        <section className="dictionary-builder">
          <div className="panel-heading">
            <h2>New Words</h2>
            <p>Detected from Arabic lines</p>
          </div>
          <div className="button-row admin-actions">
            <button type="button" className="ghost-button" onClick={findNewWords}>
              Find new words
            </button>
            <button type="button" className="primary-button" onClick={fillWordsWithAi} disabled={isFillingWords}>
              {isFillingWords ? "Filling..." : "Fill with AI"}
            </button>
          </div>

          {newWordEntries.length > 0 && (
            <div className="word-editor-list">
              {newWordEntries.map((entry, index) => (
                <div className="word-editor-item" key={`${entry.word}-${index}`}>
                  <label>
                    Word
                    <input value={entry.word} onChange={(event) => updateNewWordEntry(index, { word: event.target.value })} />
                  </label>
                  <label>
                    Part of speech
                    <select value={entry.partOfSpeech ?? ""} onChange={(event) => updateNewWordEntry(index, { partOfSpeech: event.target.value })}>
                      <option value="">(unclassified)</option>
                      {Object.keys(typeFields).map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    Meanings (EN)
                    <input
                      value={entry.meaning.join(", ")}
                      onChange={(event) =>
                        updateNewWordEntry(index, {
                          meaning: event.target.value
                            .split(",")
                            .map((meaning) => meaning.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="night, nighttime"
                    />
                  </label>
                  <label>
                    Meanings (RU)
                    <input
                      value={(entry.meaningRu ?? []).join(", ")}
                      onChange={(event) => updateNewWordEntry(index, {
                        meaningRu: event.target.value.split(",").map((meaning) => meaning.trim()).filter(Boolean),
                      })}
                    />
                  </label>
                  {(typeFields[entry.partOfSpeech ?? ""] ?? []).map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        value={typeof entry[field.key] === "string" ? entry[field.key] as string : ""}
                        onChange={(event) => updateNewWordEntry(index, { [field.key]: event.target.value })}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="button-row admin-actions">
          <button type="button" className="ghost-button" onClick={onBack}>
            Back to JSON
          </button>
          <button type="button" className="ghost-button" onClick={validateFiles}>
            Validate files
          </button>
          <button type="button" className="primary-button" onClick={publishNasheed}>
            Upload and publish
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Status</h2>
        </div>
        <pre className="admin-log">{log}</pre>
      </section>
    </div>
  );
}

async function uploadFile(supabase: SupabaseClient, bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed for ${bucket}/${path}: ${error.message}`);
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function downloadDictionary(supabase: SupabaseClient): Promise<Dictionary> {
  const { data, error } = await supabase.storage.from(dictionaryBucket).download(dictionaryPath);

  if (error) {
    return {};
  }

  const json = parseDictionaryJson(await data.text());
  return normalizeDictionaryInput(json);
}

function parseDictionaryJson(text: string): unknown {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return {};

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const detail = error instanceof SyntaxError ? ` ${error.message}` : "";
    throw new Error(`${dictionaryPath} exists but is not valid JSON.${detail}`);
  }
}

async function uploadDictionary(supabase: SupabaseClient, dictionary: Dictionary): Promise<void> {
  const dictionaryFile = new File([JSON.stringify(dictionary, null, 2)], dictionaryPath, { type: "application/json" });
  await uploadFile(supabase, dictionaryBucket, dictionaryPath, dictionaryFile);
}

async function readJsonFile(file: File, label: string): Promise<unknown> {
  if (!file) {
    throw new Error(`Choose ${label} first.`);
  }

  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function requestAiDictionaryEntries(supabase: SupabaseClient, words: WordContext[]): Promise<DictionaryEntry[]> {
  const { data, error } = await supabase.functions.invoke("generate-dictionary-entries", {
    body: { words },
  });

  if (error) {
    throw new Error(`AI function failed: ${await getFunctionErrorMessage(error)}`);
  }

  const entries = (data as { entries?: unknown } | null)?.entries;

  if (!Array.isArray(entries)) {
    throw new Error("AI function response must contain an entries array.");
  }

  return entries.map((entry) => normalizeDictionaryEntry(entry));
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") {
    return "Unknown function error.";
  }

  const record = error as { message?: unknown; context?: unknown };
  const context = record.context;

  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body.error === "string") {
        return body.error;
      }
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Fall through to the generic message below.
      }
    }
  }

  return typeof record.message === "string" ? record.message : "Unknown function error.";
}

function validateLyricsJson(json: NushudContentJson) {
  if (!json || !Array.isArray(json.lines) || json.lines.length === 0) {
    throw new Error("Lyrics JSON must contain a non-empty lines array.");
  }

  json.lines.forEach((line, lineIndex) => {
    if (!isValidTiming(line.startMs, line.endMs)) {
      throw new Error(`Line ${lineIndex + 1} has invalid timing.`);
    }

    if (!line.ar || typeof line.ar !== "string") {
      throw new Error(`Line ${lineIndex + 1} needs ar.`);
    }
  });

  if (typeof json.lineCount === "number" && json.lineCount !== json.lines.length) {
    throw new Error(`lineCount says ${json.lineCount}, but lines has ${json.lines.length}.`);
  }

  const metadata = getLyricsMetadata(json);
  const missing = getMissingMetadata(metadata);
  if (missing.length > 0) {
    throw new Error(`Lyrics JSON missing metadata: ${missing.join(", ")}`);
  }
}

function getLyricsMetadata(json: NushudContentJson): LyricsMetadata {
  const record = json as unknown as Record<string, unknown>;
  const slug = String(record.id ?? record.slug ?? "").trim();
  const title = String(record.title ?? "").trim();
  const artistName = String(record.artist ?? record.artistName ?? record.author ?? record.authorName ?? "").trim();
  const difficulty = getDifficulty(record.difficulty);
  const tags = getTags(record.tags);
  const audioFileName = String(record.audioFileName ?? record.audio_file_name ?? "").trim();
  const durationMs = getDurationMs(json);

  return {
    slug,
    title,
    artistName,
    difficulty,
    tags,
    audioFileName,
    durationMs,
    lineCount: json.lines.length,
    languages: Array.isArray(json.languages) ? json.languages : [],
  };
}

function getMissingMetadata(metadata: LyricsMetadata): string[] {
  return [
    !metadata.slug && "id or slug",
    !metadata.title && "title",
    !metadata.artistName && "artist",
    !metadata.durationMs && "duration from durationMs or line endMs",
  ].filter((value): value is string => Boolean(value));
}

function getDurationMs(json: NushudContentJson): number {
  const record = json as unknown as Record<string, unknown>;
  const explicitDuration = Number(record.durationMs ?? record.duration_ms ?? record.duration);

  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.round(explicitDuration);
  }

  const maxEndMs = Math.max(...json.lines.map((line) => Number(line.endMs)));
  return Number.isFinite(maxEndMs) && maxEndMs > 0 ? Math.round(maxEndMs) : 0;
}

function getDifficulty(value: unknown): NushudContentJson["difficulty"] {
  return value === "intermediate" || value === "advanced" ? value : "beginner";
}

function getTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
}

function validateSelectedAudioFile(metadata: LyricsMetadata, file: File) {
  if (!metadata.audioFileName) return;

  if (file.name !== metadata.audioFileName) {
    throw new Error(`Audio file mismatch. JSON expects ${metadata.audioFileName}, but selected ${file.name}.`);
  }
}

function normalizeDictionaryInput(json: unknown): Dictionary {
  if (Array.isArray(json)) {
    return Object.fromEntries(
      json.map((item) => normalizeDictionaryEntry(item)).map((entry) => [normalizeArabicWord(entry.word), entry]),
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error("New words JSON must be an array of word entries or an object keyed by Arabic word.");
  }

  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>).map(([key, value]) => {
      const entry = normalizeDictionaryEntry(value, key);
      return [normalizeArabicWord(entry.word || key), entry];
    }),
  );
}

function dictionaryFromEntries(entries: DictionaryEntry[]): Dictionary {
  return Object.fromEntries(
    entries.map((item) => normalizeDictionaryEntry(item)).map((entry) => [normalizeArabicWord(entry.word), entry]),
  );
}

function createDraftEntry(word: string): DictionaryEntry {
  return {
    word,
    meaning: [],
    meaningRu: [],
    partOfSpeech: "",
  };
}

function normalizeDictionaryEntry(value: unknown, fallbackWord = ""): DictionaryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Each dictionary entry must be an object.");
  }

  const record = value as Record<string, unknown>;
  const word = String(record.word ?? fallbackWord).trim();
  const meaning = Array.isArray(record.meaning)
    ? record.meaning.map((item) => String(item).trim()).filter(Boolean)
    : typeof record.meaning === "string"
      ? [record.meaning.trim()].filter(Boolean)
      : [];
  const meaningRu = Array.isArray(record.meaningRu)
    ? record.meaningRu.map((item) => String(item).trim()).filter(Boolean)
    : typeof record.meaningRu === "string"
      ? [record.meaningRu.trim()].filter(Boolean)
      : [];

  if (!word) {
    throw new Error("Each dictionary entry needs a word.");
  }

  return {
    ...record,
    word,
    meaning,
    meaningRu,
    partOfSpeech: typeof record.partOfSpeech === "string" ? record.partOfSpeech : undefined,
  };
}

function mergeDictionaries(existingDictionary: Dictionary, newWords: Dictionary): Dictionary {
  const merged = { ...existingDictionary };

  Object.entries(newWords).forEach(([key, incoming]) => {
    const existing = merged[key];
    merged[key] = existing
      ? {
          ...existing,
          ...incoming,
          meaning: incoming.meaning.length > 0 ? incoming.meaning : existing.meaning,
          meaningRu: (incoming.meaningRu ?? []).length > 0 ? incoming.meaningRu : existing.meaningRu,
        }
      : incoming;
  });

  return merged;
}

function getMissingDictionaryWords(lyrics: NushudContentJson, dictionary: Dictionary): string[] {
  const missing = new Set<string>();

  getNormalizedWordsFromLyrics(lyrics).forEach((normalizedWord) => {
    if (!dictionary[normalizedWord]) {
      missing.add(normalizedWord);
    }
  });

  return [...missing];
}

function buildWordContexts(lyrics: NushudContentJson, words: string[]): WordContext[] {
  const contexts = new Map<string, WordContext>();

  words.forEach((word) => {
    const normalizedWord = normalizeArabicWord(word);
    contexts.set(normalizedWord, { word, normalizedWord, lines: [] });
  });

  lyrics.lines.forEach((line) => {
    const lineWords = new Set(tokenizeArabicLine(line.ar).map(normalizeArabicWord));
    contexts.forEach((context, normalizedWord) => {
      if (lineWords.has(normalizedWord) && context.lines.length < 3) {
        context.lines.push({
          ar: line.ar,
          en: typeof line.en === "string" ? line.en : undefined,
        });
      }
    });
  });

  return [...contexts.values()];
}

function formatMissingWords(words: string[]): string {
  const visibleWords = words.slice(0, 30).join(", ");
  const hiddenCount = words.length - 30;

  if (hiddenCount <= 0) {
    return visibleWords;
  }

  return `${visibleWords} ... and ${hiddenCount} more`;
}

function getNormalizedWordsFromLyrics(lyrics: NushudContentJson): string[] {
  return lyrics.lines.flatMap((line) => tokenizeArabicLine(line.ar).map(normalizeArabicWord).filter(Boolean));
}

function tokenizeArabicLine(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function normalizeArabicWord(text: string): string {
  const withoutMarks = text
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "");

  return withoutMarks
    .replace(/[\u0625\u0623\u0671\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\p{Script=Arabic}\p{Letter}\p{Number}]+/gu, "")
    .trim();
}
function isValidTiming(startMs: unknown, endMs: unknown): boolean {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && Number(startMs) >= 0 && Number(endMs) > Number(startMs);
}

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "bin";
}

function jsonToFile(json: NushudContentJson, fileName: string): File {
  return new File([JSON.stringify(json, null, 2)], fileName, { type: "application/json" });
}
