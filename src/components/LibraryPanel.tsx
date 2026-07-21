import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NushudContentJson } from "../types";

type NasheedRecord = {
  id: string;
  title: string;
  artist_name: string;
  cover_url: string;
  audio_url: string;
  lyrics_json_url: string;
  difficulty: string;
  tags: string[];
  duration_ms?: number;
  is_published: boolean;
  created_at?: string;
};

type LibraryPanelProps = {
  supabase: SupabaseClient;
  adminEmail: string;
};

const structuralKeys = new Set(["lineIndex", "startMs", "endMs", "ar"]);

export function LibraryPanel({ supabase, adminEmail }: LibraryPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [items, setItems] = useState<NasheedRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lyrics, setLyrics] = useState<NushudContentJson | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("en");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [status, setStatus] = useState("Ready.");
  const [busy, setBusy] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const languages = useMemo(() => {
    if (!lyrics) return [];
    const declared = Array.isArray(lyrics.languages) ? lyrics.languages : [];
    const found = lyrics.lines.flatMap((line) => Object.keys(line).filter((key) => !structuralKeys.has(key)));
    return Array.from(new Set([...declared, ...found])).filter((code) => code !== "ar");
  }, [lyrics]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) =>
      !needle || `${item.title} ${item.artist_name} ${item.difficulty}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  useEffect(() => {
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCoverFile(null);
    setAudioFile(null);
    if (!selected) {
      setLyrics(null);
      return;
    }
    void loadLyrics(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const coverPreviewUrl = useMemo(
    () => coverFile ? URL.createObjectURL(coverFile) : selected?.cover_url ?? "",
    [coverFile, selected?.cover_url],
  );

  useEffect(() => {
    if (!coverFile || !coverPreviewUrl) return;
    return () => URL.revokeObjectURL(coverPreviewUrl);
  }, [coverFile, coverPreviewUrl]);

  const audioPreviewUrl = useMemo(
    () => audioFile ? URL.createObjectURL(audioFile) : selected?.audio_url ?? "",
    [audioFile, selected?.audio_url],
  );

  useEffect(() => {
    if (!audioFile || !audioPreviewUrl) return;
    return () => URL.revokeObjectURL(audioPreviewUrl);
  }, [audioFile, audioPreviewUrl]);

  const writeStatus = (message: string) => setStatus(`[${new Date().toLocaleTimeString()}] ${message}`);

  const loadLibrary = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase
        .from("nasheeds")
        .select("id,title,artist_name,cover_url,audio_url,lyrics_json_url,difficulty,tags,duration_ms,is_published,created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const loaded = (data ?? []) as NasheedRecord[];
      setItems(loaded);
      setSelectedId((current) => loaded.some((item) => item.id === current) ? current : loaded[0]?.id ?? "");
      writeStatus(`Loaded ${loaded.length} nasheeds.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not load library.");
    } finally {
      setBusy(false);
    }
  };

  const loadLyrics = async (item: NasheedRecord) => {
    try {
      setBusy(true);
      const response = await fetch(item.lyrics_json_url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not open lyrics (${response.status}).`);
      const json = (await response.json()) as NushudContentJson;
      if (!Array.isArray(json.lines)) throw new Error("Lyrics JSON has no lines array.");
      setLyrics(json);
      setLanguage((current) => inferLanguages(json).includes(current) ? current : inferLanguages(json)[0] ?? "en");
      writeStatus(`Opened ${item.title}.`);
    } catch (error) {
      setLyrics(null);
      writeStatus(error instanceof Error ? error.message : "Could not load lyrics.");
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (index: number, key: string, value: string) => {
    setLyrics((current) => current ? {
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line),
    } : current);
  };

  const updateTiming = (index: number, key: "startMs" | "endMs", value: number | null) => {
    setLyrics((current) => current ? {
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line),
    } : current);
  };

  const seekToLine = (index: number) => {
    const audio = audioRef.current;
    const line = lyrics?.lines[index];
    if (!audio || !line) return;
    audio.currentTime = line.startMs / 1000;
    void audio.play();
  };

  const updateSelectedMetadata = (patch: Partial<NasheedRecord>) => {
    if (!selected) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  };

  const updateLyricsMetadata = (patch: Partial<NushudContentJson>) => {
    setLyrics((current) => current ? { ...current, ...patch } : current);
  };

  const addLanguage = () => {
    const code = window.prompt("Language code (for example: cs, de, tr)")?.trim().toLowerCase();
    if (!code) return;
    if (!/^[a-z][a-z0-9-]{1,9}$/.test(code)) {
      writeStatus("Use a short language code such as en, cs, de, or pt-br.");
      return;
    }
    if (languages.includes(code)) {
      setLanguage(code);
      writeStatus(`${code} already exists.`);
      return;
    }
    setLyrics((current) => current ? {
      ...current,
      languages: Array.from(new Set([...(current.languages ?? []), code, "ar"])),
      lines: current.lines.map((line) => ({ ...line, [code]: "" })),
    } : current);
    setLanguage(code);
    writeStatus(`Added ${code}. Fill the translations, then save changes.`);
  };

  const removeLanguage = () => {
    if (!lyrics || !language || !window.confirm(`Remove all ${language} translations from this nasheed?`)) return;
    const nextLines = lyrics.lines.map((line) => {
      const next = { ...line };
      delete next[language];
      return next;
    });
    setLyrics({ ...lyrics, languages: (lyrics.languages ?? []).filter((code) => code !== language), lines: nextLines });
    const remaining = languages.filter((code) => code !== language);
    setLanguage(remaining[0] ?? "en");
    writeStatus(`${language} removed locally. Save changes to update the library.`);
  };

  const saveLyrics = async () => {
    if (!selected || !lyrics) return;
    try {
      setBusy(true);
      const path = storagePath(selected.lyrics_json_url) ?? `${lyrics.id || selected.id}.json`;
      const normalized = { ...lyrics, lineCount: lyrics.lines.length, languages: ["ar", ...languages] };
      const file = new Blob([JSON.stringify(normalized, null, 2)], { type: "application/json" });
      const { error } = await supabase.storage.from("nasheed-lyrics").upload(path, file, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "0",
      });
      if (error) throw new Error(error.message);
      if (coverFile) {
        const coverPath = storagePath(selected.cover_url);
        if (!coverPath) throw new Error("Could not determine the existing cover image path.");
        const { error: coverError } = await supabase.storage.from("nasheed-covers").upload(coverPath, coverFile, {
          upsert: true,
          contentType: coverFile.type || undefined,
          cacheControl: "0",
        });
        if (coverError) throw new Error(`Lyrics saved, but cover could not be replaced: ${coverError.message}`);
      }
      if (audioFile) {
        const audioPath = storagePath(selected.audio_url);
        if (!audioPath) throw new Error("Could not determine the existing MP3 path.");
        const { error: audioError } = await supabase.storage.from("nasheed-audio").upload(audioPath, audioFile, {
          upsert: true,
          contentType: audioFile.type || "audio/mpeg",
          cacheControl: "0",
        });
        if (audioError) throw new Error(`Other changes saved, but MP3 could not be replaced: ${audioError.message}`);
      }
      const { error: rowError } = await supabase.from("nasheeds").update({
        title: selected.title.trim(),
        artist_name: selected.artist_name.trim(),
        difficulty: selected.difficulty,
        tags: selected.tags ?? [],
      }).eq("id", selected.id);
      if (rowError) throw new Error(`Lyrics saved, but metadata could not be saved: ${rowError.message}`);
      setLyrics(normalized);
      setCoverFile(null);
      setAudioFile(null);
      writeStatus(`Saved metadata${coverFile ? ", cover image" : ""}${audioFile ? ", MP3" : ""}, Arabic, timestamps, and ${languages.length} translation language${languages.length === 1 ? "" : "s"}.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not save lyrics.");
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (item: NasheedRecord) => {
    try {
      setBusy(true);
      const nextValue = !item.is_published;
      const { error } = await supabase.from("nasheeds").update({ is_published: nextValue }).eq("id", item.id);
      if (error) throw new Error(error.message);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_published: nextValue } : entry));
      writeStatus(nextValue ? `${item.title} is visible.` : `${item.title} is hidden.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not change visibility.");
    } finally {
      setBusy(false);
    }
  };

  const deleteNasheed = async (item: NasheedRecord) => {
    if (!window.confirm(`Permanently delete “${item.title}”? Its lyrics, audio, cover, and database row will be removed.`)) return;
    try {
      setBusy(true);
      const assets: Array<[string, string]> = [
        ["nasheed-lyrics", item.lyrics_json_url],
        ["nasheed-audio", item.audio_url],
        ["nasheed-covers", item.cover_url],
      ];
      for (const [bucket, url] of assets) {
        const path = storagePath(url);
        if (path) {
          const { error } = await supabase.storage.from(bucket).remove([path]);
          if (error) throw new Error(`Could not delete ${bucket}: ${error.message}`);
        }
      }
      const { error } = await supabase.from("nasheeds").delete().eq("id", item.id);
      if (error) throw new Error(error.message);
      const remaining = items.filter((entry) => entry.id !== item.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      writeStatus(`${item.title} was permanently deleted.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not delete nasheed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library-panel">
      <section className="panel library-sidebar">
        <div className="panel-heading">
          <div><h2>Manage Library</h2><p>{adminEmail}</p></div>
          <span className="badge">{items.length}</span>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or artist…" />
        <div className="library-list">
          {filteredItems.map((item) => (
            <button key={item.id} type="button" className={`library-list-item ${item.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(item.id)}>
              <span className={`visibility-dot ${item.is_published ? "published" : "hidden"}`} />
              <span><strong>{item.title}</strong><small>{item.artist_name || "Unknown artist"}</small></span>
            </button>
          ))}
          {!busy && filteredItems.length === 0 && <p className="empty-state">No nasheeds found.</p>}
        </div>
      </section>

      <section className="panel library-editor">
        {selected && lyrics ? (
          <>
            <div className="panel-heading library-title">
              <div><h2>{selected.title}</h2><p>{selected.artist_name} · {lyrics.lines.length} lines</p></div>
              <span className={`badge ${selected.is_published ? "success-badge" : ""}`}>{selected.is_published ? "Visible" : "Hidden"}</span>
            </div>
            <div className="button-row library-actions">
              <button type="button" className="ghost-button" disabled={busy} onClick={() => togglePublished(selected)}>{selected.is_published ? "Hide nasheed" : "Make visible"}</button>
              <button type="button" className="ghost-button" onClick={addLanguage}>Add language</button>
              {languages.length > 0 && <button type="button" className="ghost-button" onClick={removeLanguage}>Remove {language}</button>}
              <button type="button" disabled={busy} onClick={saveLyrics}>Save changes</button>
              <button type="button" className="danger-button" disabled={busy} onClick={() => deleteNasheed(selected)}>Delete</button>
            </div>
            <div className="library-metadata-grid">
              <div className="library-cover-editor">
                <img src={coverPreviewUrl} alt={`Cover for ${selected.title}`} />
                <label>
                  Cover image
                  <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
                  <span>{coverFile ? `${coverFile.name} — saves with other changes` : "Choose an image to replace the current cover"}</span>
                </label>
              </div>
              <div className="library-file-editor">
                <label>
                  MP3 audio
                  <input type="file" accept="audio/mpeg,.mp3" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} />
                  <span>{audioFile ? `${audioFile.name} — loaded below and saves with other changes` : "Choose an MP3 to replace the current audio"}</span>
                </label>
              </div>
              <label>
                Title
                <input
                  value={selected.title}
                  onChange={(event) => {
                    updateSelectedMetadata({ title: event.target.value });
                    updateLyricsMetadata({ title: event.target.value });
                  }}
                />
              </label>
              <label>
                Author / artist
                <input
                  value={selected.artist_name}
                  onChange={(event) => {
                    updateSelectedMetadata({ artist_name: event.target.value });
                    updateLyricsMetadata({ artist: event.target.value });
                  }}
                />
              </label>
              <label>
                Content ID / slug
                <input value={lyrics.id ?? ""} onChange={(event) => updateLyricsMetadata({ id: slugify(event.target.value) })} />
              </label>
              <label>
                Difficulty
                <select
                  value={selected.difficulty}
                  onChange={(event) => {
                    const difficulty = event.target.value as NushudContentJson["difficulty"];
                    updateSelectedMetadata({ difficulty });
                    updateLyricsMetadata({ difficulty });
                  }}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label className="metadata-tags-field">
                Tags <span>comma separated</span>
                <input
                  value={(selected.tags ?? []).join(", ")}
                  onChange={(event) => {
                    const tags = event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean);
                    updateSelectedMetadata({ tags });
                    updateLyricsMetadata({ tags });
                  }}
                  placeholder="spiritual, easy, chorus"
                />
              </label>
              <label>
                Database ID <span>read-only</span>
                <input value={selected.id} readOnly />
              </label>
            </div>
            <div className="library-audio-sync">
              <div>
                <strong>Redo timestamps</strong>
                <span>Play the audio, then capture the playhead for each line.</span>
              </div>
              <audio
                ref={audioRef}
                src={audioPreviewUrl}
                controls
                preload="metadata"
                onTimeUpdate={(event) => setPlayheadMs(Math.round(event.currentTarget.currentTime * 1000))}
                onSeeked={(event) => setPlayheadMs(Math.round(event.currentTarget.currentTime * 1000))}
              />
              <output>{playheadMs.toLocaleString()} ms</output>
            </div>
            <div className="language-tabs" aria-label="Translation language">
              {languages.map((code) => <button type="button" key={code} className={language === code ? "active" : ""} onClick={() => setLanguage(code)}>{code.toUpperCase()}</button>)}
              {languages.length === 0 && <span>No translations yet — add a language to begin.</span>}
            </div>
            <div className="lyrics-editor-list">
              {lyrics.lines.map((line, index) => (
                <article className="lyrics-edit-row" key={line.lineIndex ?? index}>
                  <span className="line-number">{index + 1}</span>
                  <label>Arabic<textarea dir="rtl" lang="ar" value={String(line.ar ?? "")} onChange={(event) => updateLine(index, "ar", event.target.value)} /></label>
                  <label>{language ? `${language.toUpperCase()} translation` : "Translation"}<textarea value={language ? String(line[language] ?? "") : ""} disabled={!language || languages.length === 0} onChange={(event) => updateLine(index, language, event.target.value)} /></label>
                  <div className="timestamp-editor">
                    <label>Start ms<input type="number" min="0" value={line.startMs} onChange={(event) => updateTiming(index, "startMs", Math.max(0, Number(event.target.value)))} /></label>
                    <button type="button" className="ghost-button" onClick={() => updateTiming(index, "startMs", playheadMs)}>Set start</button>
                    <label>End ms<input type="number" min="0" value={line.endMs ?? ""} placeholder="No end" onChange={(event) => updateTiming(index, "endMs", event.target.value === "" ? null : Math.max(0, Number(event.target.value)))} /></label>
                    <button type="button" className="ghost-button" onClick={() => updateTiming(index, "endMs", playheadMs)}>Set end</button>
                    <button type="button" className="ghost-button" onClick={() => seekToLine(index)}>Play line</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : <div className="library-placeholder"><h2>{busy ? "Loading…" : "Choose a nasheed"}</h2><p>Select a library item to edit its Arabic text and translations.</p></div>}
        <p className="status-text">{status}</p>
      </section>
    </div>
  );
}

function inferLanguages(json: NushudContentJson): string[] {
  const declared = Array.isArray(json.languages) ? json.languages : [];
  const found = json.lines.flatMap((line) => Object.keys(line).filter((key) => !structuralKeys.has(key)));
  return Array.from(new Set([...declared, ...found])).filter((code) => code !== "ar");
}

function storagePath(url: string): string | null {
  if (!url) return null;
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const marker = "/object/public/";
    const index = pathname.indexOf(marker);
    if (index < 0) return null;
    const afterMarker = pathname.slice(index + marker.length);
    const slash = afterMarker.indexOf("/");
    return slash >= 0 ? afterMarker.slice(slash + 1) : null;
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
