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

export function AdminPanel({
  supabase,
  adminEmail,
  generatedContentJson,
  generatedAudioFile,
  onBack,
}: AdminPanelProps) {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [dictionaryFile, setDictionaryFile] = useState<File | null>(null);
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

  const validateFiles = async () => {
    try {
      validateLyricsJson(generatedContentJson);
      validateSelectedAudioFile(lyricsMetadata, generatedAudioFile);

      if (!coverFile) {
        throw new Error("Choose cover image first.");
      }

      if (!dictionaryFile) {
        throw new Error("Choose words.json first.");
      }

      const dictionary = await readJsonFile(dictionaryFile, "words.json");
      validateDictionaryJson(dictionary);
      const missingWords = getMissingDictionaryWords(generatedContentJson, dictionary);

      if (missingWords.length > 0) {
        writeLog(`Validation passed with dictionary warnings. Missing words: ${formatMissingWords(missingWords)}`);
        return;
      }

      writeLog("Validation passed.");
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

      if (!dictionaryFile) {
        throw new Error("Choose words.json first.");
      }

      const dictionary = await readJsonFile(dictionaryFile, "words.json");
      validateDictionaryJson(dictionary);
      const missingWords = getMissingDictionaryWords(generatedContentJson, dictionary);

      if (missingWords.length > 0) {
        writeLog(`Publishing with missing dictionary entries: ${formatMissingWords(missingWords)}`);
      }

      await uploadFile(supabase, "dictionary", "words.json", dictionaryFile);

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
      writeLog("Published. NUSHUD can now load this nasheed from Supabase.");
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
          <label className="file-box drop-zone">
            Global words.json
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setDictionaryFile(event.target.files?.[0] ?? null)}
            />
            <span>{dictionaryFile?.name ?? "Required"}</span>
          </label>
        </div>

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

  getLyricsMetadata(json);
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

  const missing = [
    !slug && "id or slug",
    !title && "title",
    !artistName && "artist",
    !durationMs && "duration from durationMs or line endMs",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Lyrics JSON missing metadata: ${missing.join(", ")}`);
  }

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

function validateDictionaryJson(json: unknown) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("words.json must be an object keyed by normalized word.");
  }
}

function getMissingDictionaryWords(lyrics: NushudContentJson, dictionary: unknown): string[] {
  const missing = new Set<string>();
  const dictionaryRecord = dictionary as Record<string, unknown>;

  getNormalizedWordsFromLyrics(lyrics).forEach((normalizedWord) => {
    if (!dictionaryRecord[normalizedWord]) {
      missing.add(normalizedWord);
    }
  });

  return [...missing];
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
  return text
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأٱآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
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
