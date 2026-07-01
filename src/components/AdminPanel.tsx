import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NushudContentJson } from "../types";
import { makeDownloadName } from "../utils/exportJson";

type AdminPanelProps = {
  generatedContentJson: NushudContentJson | null;
  generatedAudioFile: File | null;
};

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type LyricsMetadata = {
  slug: string;
  title: string;
  artistName: string;
  audioFileName: string;
  durationMs: number;
  lineCount: number;
  languages: string[];
};

const configStorageKey = "nushudAdminConfig";

export function AdminPanel({ generatedContentJson, generatedAudioFile }: AdminPanelProps) {
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [difficulty, setDifficulty] = useState("beginner");
  const [tags, setTags] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [dictionaryFile, setDictionaryFile] = useState<File | null>(null);
  const [lyricsMetadata, setLyricsMetadata] = useState<LyricsMetadata | null>(null);
  const [publishState, setPublishState] = useState("Draft");
  const [log, setLog] = useState("Ready.");

  const activeAudioFile = audioFile ?? generatedAudioFile;
  const hasGeneratedJson = generatedContentJson !== null;

  const writeLog = useCallback((message: string) => {
    setLog(`[${new Date().toLocaleTimeString()}] ${message}`);
  }, []);

  const refreshAdminState = useCallback(
    async (client: SupabaseClient) => {
      const { data } = await client.auth.getUser();

      if (!data.user) {
        setAdminEmail("");
        setIsAdmin(false);
        return;
      }

      const { data: adminResult, error } = await client.rpc("is_admin");
      const allowed = !error && adminResult === true;
      setAdminEmail(data.user.email ?? "");
      setIsAdmin(allowed);
      writeLog(allowed ? "Logged in as admin." : "Logged in, but this user is not in public.admin_users.");
    },
    [writeLog],
  );

  useEffect(() => {
    const config = readConfig();
    if (!config) return;

    setSupabaseUrl(config.url);
    setSupabaseAnonKey(config.anonKey);
    const client = createClient(config.url, config.anonKey);
    setSupabase(client);
    void refreshAdminState(client);
  }, [refreshAdminState]);

  useEffect(() => {
    if (!generatedContentJson || lyricsFile) return;

    try {
      validateLyricsJson(generatedContentJson);
      setLyricsMetadata(getLyricsMetadata(generatedContentJson));
    } catch (error) {
      setLyricsMetadata(null);
      writeLog(error instanceof Error ? error.message : "Generated JSON is not publishable yet.");
    }
  }, [generatedContentJson, lyricsFile, writeLog]);

  const metadataPreview = useMemo(() => {
    if (!lyricsMetadata) {
      return "Choose timed lyrics JSON to detect slug, title, artist, audio filename, line count, and duration.";
    }

    return [
      lyricsMetadata.title,
      `Slug: ${lyricsMetadata.slug}`,
      `Artist: ${lyricsMetadata.artistName}`,
      `Duration: ${lyricsMetadata.durationMs} ms`,
      `Lines: ${lyricsMetadata.lineCount}`,
      lyricsMetadata.audioFileName ? `Expected audio: ${lyricsMetadata.audioFileName}` : "",
      lyricsMetadata.languages.length > 0 ? `Languages: ${lyricsMetadata.languages.join(", ")}` : "",
    ].filter(Boolean);
  }, [lyricsMetadata]);

  const saveConfig = () => {
    const url = supabaseUrl.trim();
    const anonKey = supabaseAnonKey.trim();

    if (!url || !anonKey) {
      writeLog("Add Supabase URL and anon key first.");
      return;
    }

    localStorage.setItem(configStorageKey, JSON.stringify({ url, anonKey }));
    const client = createClient(url, anonKey);
    setSupabase(client);
    writeLog("Connection saved.");
    void refreshAdminState(client);
  };

  const login = async () => {
    if (!supabase) {
      writeLog("Save Supabase connection first.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      writeLog(`Login failed: ${error.message}`);
      return;
    }

    await refreshAdminState(supabase);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAdminEmail("");
    setIsAdmin(false);
    writeLog("Signed out.");
  };

  const previewUploadedLyrics = async (file: File | null) => {
    setLyricsFile(file);
    if (!file) {
      setLyricsMetadata(generatedContentJson ? getLyricsMetadata(generatedContentJson) : null);
      return;
    }

    try {
      const lyrics = await readJsonFile(file, "timed lyrics JSON");
      validateLyricsJson(lyrics);
      setLyricsMetadata(getLyricsMetadata(lyrics));
    } catch (error) {
      setLyricsMetadata(null);
      writeLog(error instanceof Error ? error.message : "Could not read lyrics JSON.");
    }
  };

  const validateFiles = async () => {
    try {
      const lyrics = await getActiveLyrics(generatedContentJson, lyricsFile);
      validateLyricsJson(lyrics);
      const metadata = getLyricsMetadata(lyrics);
      setLyricsMetadata(metadata);

      if (dictionaryFile) {
        const dictionary = await readJsonFile(dictionaryFile, "words.json");
        validateDictionaryJson(dictionary);
        const missingWords = getMissingDictionaryWords(lyrics, dictionary);

        if (missingWords.length > 0) {
          writeLog(`Validation passed with dictionary warnings. Missing words: ${formatMissingWords(missingWords)}`);
          return;
        }
      }

      writeLog("Validation passed.");
    } catch (error) {
      writeLog(error instanceof Error ? error.message : "Validation failed.");
    }
  };

  const publishNasheed = async () => {
    try {
      if (!supabase || !isAdmin) {
        throw new Error("Login as an admin first.");
      }

      if (!coverFile) {
        throw new Error("Missing: coverFile");
      }

      if (!activeAudioFile) {
        throw new Error("Missing: audioFile");
      }

      const lyrics = await getActiveLyrics(generatedContentJson, lyricsFile);
      validateLyricsJson(lyrics);
      const metadata = getLyricsMetadata(lyrics);
      setLyricsMetadata(metadata);
      validateSelectedAudioFile(metadata, activeAudioFile);

      if (dictionaryFile) {
        const dictionary = await readJsonFile(dictionaryFile, "words.json");
        validateDictionaryJson(dictionary);
        const missingWords = getMissingDictionaryWords(lyrics, dictionary);

        if (missingWords.length > 0) {
          writeLog(`Publishing with missing dictionary entries: ${formatMissingWords(missingWords)}`);
        }

        await uploadFile(supabase, "dictionary", "words.json", dictionaryFile);
      }

      const lyricsUploadFile = lyricsFile ?? jsonToFile(lyrics, makeDownloadName(metadata.title));
      const coverUrl = await uploadFile(supabase, "nasheed-covers", `${metadata.slug}.${extension(coverFile.name)}`, coverFile);
      const audioUrl = await uploadFile(
        supabase,
        "nasheed-audio",
        `${metadata.slug}.${extension(activeAudioFile.name)}`,
        activeAudioFile,
      );
      const lyricsJsonUrl = await uploadFile(supabase, "nasheed-lyrics", `${metadata.slug}.json`, lyricsUploadFile);
      const normalizedWords = getNormalizedWordsFromLyrics(lyrics);

      const { error } = await supabase.from("nasheeds").insert({
        title: metadata.title,
        artist_name: metadata.artistName,
        cover_url: coverUrl,
        audio_url: audioUrl,
        lyrics_json_url: lyricsJsonUrl,
        duration_ms: metadata.durationMs,
        difficulty,
        tags: tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
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
          <h2>Connect Supabase</h2>
          <p>Stored in this browser only</p>
        </div>
        <div className="field-grid two-column">
          <label>
            Supabase URL
            <input
              type="url"
              value={supabaseUrl}
              onChange={(event) => setSupabaseUrl(event.target.value)}
              placeholder="https://your-project.supabase.co"
            />
          </label>
          <label>
            Supabase anon key
            <input
              type="password"
              value={supabaseAnonKey}
              onChange={(event) => setSupabaseAnonKey(event.target.value)}
              placeholder="ey..."
            />
          </label>
        </div>
        <div className="button-row admin-actions">
          <button type="button" onClick={saveConfig}>
            Save connection
          </button>
          {adminEmail && (
            <button type="button" className="ghost-button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </section>

      {!isAdmin && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Login</h2>
            <p>User must be in admin_users</p>
          </div>
          <div className="field-grid two-column">
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>
          <div className="button-row admin-actions">
            <button type="button" className="primary-button" onClick={login} disabled={!supabase}>
              Login
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Publish Nasheed</h2>
            <p>{adminEmail || "Connect and login before publishing."}</p>
          </div>
          <span className="badge">{publishState}</span>
        </div>

        <div className="metadata-preview">
          {Array.isArray(metadataPreview) ? (
            metadataPreview.map((line, index) =>
              index === 0 ? (
                <strong key={line}>{line}</strong>
              ) : (
                <span key={line}>{line}</span>
              ),
            )
          ) : (
            <span>{metadataPreview}</span>
          )}
        </div>

        <div className="field-grid two-column">
          <label>
            Difficulty
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="beginner">beginner</option>
              <option value="intermediate">intermediate</option>
              <option value="advanced">advanced</option>
            </select>
          </label>
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="warrior, romantic, slow" />
          </label>
        </div>

        <div className="upload-grid admin-upload-grid">
          <label className="file-box drop-zone">
            Cover image
            <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
            <span>{coverFile?.name ?? "Required"}</span>
          </label>
          <label className="file-box drop-zone">
            Audio file
            <input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} />
            <span>{activeAudioFile?.name ?? "Required unless selected in the sync tool"}</span>
          </label>
          <label className="file-box drop-zone">
            Timed lyrics JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void previewUploadedLyrics(event.target.files?.[0] ?? null)}
            />
            <span>{lyricsFile?.name ?? (hasGeneratedJson ? "Using generated JSON from the sync tool" : "Required")}</span>
          </label>
          <label className="file-box drop-zone">
            Global words.json
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setDictionaryFile(event.target.files?.[0] ?? null)}
            />
            <span>{dictionaryFile?.name ?? "Optional"}</span>
          </label>
        </div>

        <div className="button-row admin-actions">
          <button type="button" className="ghost-button" onClick={validateFiles}>
            Validate files
          </button>
          <button type="button" className="primary-button" onClick={publishNasheed} disabled={!isAdmin}>
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

async function getActiveLyrics(contentJson: NushudContentJson | null, lyricsFile: File | null): Promise<NushudContentJson> {
  if (lyricsFile) {
    return readJsonFile(lyricsFile, "timed lyrics JSON");
  }

  if (contentJson) {
    return contentJson;
  }

  throw new Error("Choose timed lyrics JSON first.");
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

async function readJsonFile(file: File, label: string): Promise<NushudContentJson> {
  if (!file) {
    throw new Error(`Choose ${label} first.`);
  }

  try {
    return JSON.parse(await file.text()) as NushudContentJson;
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

function readConfig(): SupabaseConfig | null {
  const raw = localStorage.getItem(configStorageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SupabaseConfig;
  } catch {
    return null;
  }
}
