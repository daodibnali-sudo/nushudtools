import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NushudContentJson } from "../types";

type DictionaryPanelProps = {
  supabase: SupabaseClient;
  adminEmail: string;
};

type DictionaryEntry = {
  word: string;
  baseWord?: string;
  meaning: string[];
  root?: string;
  wazn?: string;
  forms?: string;
  bab?: string;
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

export function DictionaryPanel({ supabase, adminEmail }: DictionaryPanelProps) {
  const [dictionary, setDictionary] = useState<Dictionary>({});
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [newWordsText, setNewWordsText] = useState("");
  const [suggestions, setSuggestions] = useState<DictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [status, setStatus] = useState("Ready.");

  const entries = useMemo(
    () =>
      Object.entries(dictionary).sort(([, first], [, second]) =>
        first.word.localeCompare(second.word, "ar"),
      ),
    [dictionary],
  );

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const normalizedNeedle = normalizeArabicWord(query);

    if (!needle && !normalizedNeedle) return entries;

    return entries.filter(([key, entry]) => {
      const haystack = [
        key,
        entry.word,
        entry.baseWord,
        entry.meaning.join(", "),
        entry.root,
        entry.wazn,
        entry.forms,
        entry.bab,
        entry.partOfSpeech,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle) || key.includes(normalizedNeedle);
    });
  }, [entries, query]);

  const selectedEntry = selectedKey ? dictionary[selectedKey] : null;

  useEffect(() => {
    void loadDictionary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeStatus = (message: string) => {
    setStatus(`[${new Date().toLocaleTimeString()}] ${message}`);
  };

  const loadDictionary = async () => {
    try {
      setIsLoading(true);
      const loadedDictionary = await downloadDictionary(supabase);
      const firstKey = Object.keys(loadedDictionary).sort()[0] ?? "";
      setDictionary(loadedDictionary);
      setSelectedKey(firstKey);
      setSuggestions([]);
      writeStatus(`Loaded ${Object.keys(loadedDictionary).length} entries from ${dictionaryPath}.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not load dictionary.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveDictionary = async () => {
    try {
      setIsSaving(true);
      await uploadDictionary(supabase, dictionary);
      writeStatus(`Saved ${Object.keys(dictionary).length} entries to ${dictionaryPath}.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not save dictionary.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSelectedEntry = (patch: Partial<DictionaryEntry>) => {
    if (!selectedEntry || !selectedKey) return;

    const nextEntry = { ...selectedEntry, ...patch };
    const nextKey = normalizeArabicWord(nextEntry.word);
    setDictionary((current) => {
      const next = { ...current };
      delete next[selectedKey];
      next[nextKey] = nextEntry;
      return next;
    });
    setSelectedKey(nextKey);
  };

  const deleteSelectedEntry = () => {
    if (!selectedKey) return;

    setDictionary((current) => {
      const next = { ...current };
      delete next[selectedKey];
      const nextKey = Object.keys(next).sort()[0] ?? "";
      setSelectedKey(nextKey);
      return next;
    });
    writeStatus("Entry removed from the local draft. Press Save dictionary to update Supabase.");
  };

  const addManualWords = () => {
    const words = parseArabicWords(newWordsText);
    if (words.length === 0) {
      writeStatus("Write Arabic words first.");
      return;
    }

    setDictionary((current) => {
      const next = { ...current };
      words.forEach((word) => {
        const key = normalizeArabicWord(word);
        next[key] = next[key] ?? createDraftEntry(word);
      });
      return next;
    });
    setSelectedKey(normalizeArabicWord(words[0]));
    setNewWordsText("");
    writeStatus(`Added ${words.length} draft word entries. Use AI fill or edit them by hand.`);
  };

  const fillManualWordsWithAi = async () => {
    const words = parseArabicWords(newWordsText);
    if (words.length === 0) {
      writeStatus("Write Arabic words first.");
      return;
    }

    await fillWordsWithAi(words.map((word) => ({ word, normalizedWord: normalizeArabicWord(word), lines: [] })));
  };

  const checkSelectedWithAi = async () => {
    if (!selectedEntry) {
      writeStatus("Choose a word first.");
      return;
    }

    await fillWordsWithAi([
      {
        word: selectedEntry.word,
        normalizedWord: normalizeArabicWord(selectedEntry.word),
        lines: [],
      },
    ]);
  };

  const checkVisibleWithAi = async () => {
    const visibleWords = filteredEntries.slice(0, 40).map(([, entry]) => entry.word);
    if (visibleWords.length === 0) {
      writeStatus("No visible words to check.");
      return;
    }

    await fillWordsWithAi(
      visibleWords.map((word) => ({ word, normalizedWord: normalizeArabicWord(word), lines: [] })),
    );
  };

  const fillWordsWithAi = async (words: WordContext[]) => {
    try {
      setIsFilling(true);
      const filledEntries = await requestAiDictionaryEntries(supabase, words);
      setSuggestions(filledEntries);
      writeStatus(`AI suggested ${filledEntries.length} entries. Review, then apply or skip.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "AI fill failed.");
    } finally {
      setIsFilling(false);
    }
  };

  const applySuggestion = (entry: DictionaryEntry) => {
    const key = normalizeArabicWord(entry.word);
    setDictionary((current) => ({ ...current, [key]: entry }));
    setSelectedKey(key);
    setSuggestions((current) => current.filter((suggestion) => normalizeArabicWord(suggestion.word) !== key));
    writeStatus(`${entry.word} applied locally. Press Save dictionary when you are happy.`);
  };

  const skipSuggestion = (entry: DictionaryEntry) => {
    const key = normalizeArabicWord(entry.word);
    setSuggestions((current) => current.filter((suggestion) => normalizeArabicWord(suggestion.word) !== key));
  };

  const importDictionaryJson = async (file: File | null) => {
    if (!file) return;

    try {
      const importedDictionary = normalizeDictionaryInput(JSON.parse(await file.text()));
      setDictionary((current) => ({ ...current, ...importedDictionary }));
      writeStatus(`Imported ${Object.keys(importedDictionary).length} entries into the local draft.`);
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not import dictionary JSON.");
    }
  };

  const findMissingFromLyricsJson = async (file: File | null) => {
    if (!file) return;

    try {
      const lyrics = JSON.parse(await file.text()) as NushudContentJson;
      if (!lyrics || !Array.isArray(lyrics.lines)) {
        throw new Error("Timed lyrics JSON needs a lines array.");
      }

      const missingContexts = buildMissingWordContexts(lyrics, dictionary);
      setDictionary((current) => {
        const next = { ...current };
        missingContexts.forEach((context) => {
          next[context.normalizedWord] = next[context.normalizedWord] ?? createDraftEntry(context.word);
        });
        return next;
      });

      if (missingContexts[0]) {
        setSelectedKey(missingContexts[0].normalizedWord);
      }

      writeStatus(
        missingContexts.length > 0
          ? `Found ${missingContexts.length} missing words from that JSON. You can fill them with AI now.`
          : "No missing words found in that JSON.",
      );

      if (missingContexts.length > 0) {
        await fillWordsWithAi(missingContexts);
      }
    } catch (error) {
      writeStatus(error instanceof Error ? error.message : "Could not check lyrics JSON.");
    }
  };

  return (
    <div className="dictionary-catalog">
      <section className="panel dictionary-panel">
        <div className="panel-heading">
          <div>
            <h2>Dictionary Catalog</h2>
            <p>{adminEmail}</p>
          </div>
          <span className="badge">{entries.length} words</span>
        </div>

        <div className="dictionary-toolbar">
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Arabic, meaning, root, wazn, bab..."
            />
          </label>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={loadDictionary} disabled={isLoading}>
              {isLoading ? "Loading..." : "Reload"}
            </button>
            <button type="button" className="primary-button" onClick={saveDictionary} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save dictionary"}
            </button>
          </div>
        </div>

        <div className="dictionary-layout">
          <div className="dictionary-list" aria-label="Dictionary words">
            {filteredEntries.map(([key, entry]) => (
              <button
                type="button"
                key={key}
                className={key === selectedKey ? "dictionary-list-item active" : "dictionary-list-item"}
                onClick={() => setSelectedKey(key)}
              >
                <strong>{entry.word}</strong>
                <span>{entry.meaning.slice(0, 2).join(", ") || "No meaning yet"}</span>
              </button>
            ))}
          </div>

          <div className="dictionary-editor">
            {selectedEntry ? (
              <>
                <div className="field-grid two-column">
                  <label>
                    Word
                    <input value={selectedEntry.word} onChange={(event) => updateSelectedEntry({ word: event.target.value })} />
                  </label>
                  <label>
                    Base word
                    <input
                      value={selectedEntry.baseWord ?? ""}
                      onChange={(event) => updateSelectedEntry({ baseWord: event.target.value })}
                    />
                  </label>
                  <label>
                    Meanings
                    <input
                      value={selectedEntry.meaning.join(", ")}
                      onChange={(event) =>
                        updateSelectedEntry({
                          meaning: event.target.value
                            .split(",")
                            .map((meaning) => meaning.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label>
                    Part of speech
                    <input
                      value={selectedEntry.partOfSpeech ?? ""}
                      onChange={(event) => updateSelectedEntry({ partOfSpeech: event.target.value })}
                    />
                  </label>
                  <label>
                    Root
                    <input value={selectedEntry.root ?? ""} onChange={(event) => updateSelectedEntry({ root: event.target.value })} />
                  </label>
                  <label>
                    Wazn
                    <input value={selectedEntry.wazn ?? ""} onChange={(event) => updateSelectedEntry({ wazn: event.target.value })} />
                  </label>
                  <label>
                    Forms
                    <input
                      value={selectedEntry.forms ?? ""}
                      onChange={(event) => updateSelectedEntry({ forms: event.target.value })}
                    />
                  </label>
                  <label>
                    Bab
                    <input value={selectedEntry.bab ?? ""} onChange={(event) => updateSelectedEntry({ bab: event.target.value })} />
                  </label>
                </div>
                <div className="button-row editor-actions">
                  <button type="button" className="ghost-button" onClick={checkSelectedWithAi} disabled={isFilling}>
                    Ask AI for this word
                  </button>
                  <button type="button" className="ghost-button" onClick={deleteSelectedEntry}>
                    Delete local draft
                  </button>
                </div>
              </>
            ) : (
              <div className="message warning">No dictionary entry selected.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel dictionary-tools-panel">
        <div className="panel-heading">
          <h2>Add And Check</h2>
          <p>AI suggestions stay in review until applied</p>
        </div>

        <div className="dictionary-tool-grid">
          <label>
            Arabic words only
            <textarea
              value={newWordsText}
              onChange={(event) => setNewWordsText(event.target.value)}
              placeholder="طال&#10;ليلي&#10;فوق"
            />
          </label>
          <div className="dictionary-imports">
            <label className="file-box compact-file-box">
              Import dictionary JSON
              <input type="file" accept="application/json,.json" onChange={(event) => importDictionaryJson(event.target.files?.[0] ?? null)} />
              <span>Merge another words JSON into this draft</span>
            </label>
            <label className="file-box compact-file-box">
              Check timed lyrics JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => findMissingFromLyricsJson(event.target.files?.[0] ?? null)}
              />
              <span>Find missing words, then ask AI with line context</span>
            </label>
          </div>
        </div>

        <div className="button-row editor-actions">
          <button type="button" className="ghost-button" onClick={addManualWords}>
            Add drafts
          </button>
          <button type="button" className="primary-button" onClick={fillManualWordsWithAi} disabled={isFilling}>
            {isFilling ? "Asking AI..." : "Fill written words with AI"}
          </button>
          <button type="button" className="ghost-button" onClick={checkVisibleWithAi} disabled={isFilling}>
            AI check visible list
          </button>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>AI Suggestions</h2>
            <p>Apply only what looks right</p>
          </div>
          <div className="suggestion-list">
            {suggestions.map((entry) => (
              <div className="suggestion-item" key={normalizeArabicWord(entry.word)}>
                <div>
                  <strong>{entry.word}</strong>
                  <span>{entry.meaning.join(", ")}</span>
                  <small>
                    {[entry.baseWord, entry.root, entry.wazn, entry.forms, entry.bab, entry.partOfSpeech]
                      .filter(Boolean)
                      .join(" | ")}
                  </small>
                </div>
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={() => applySuggestion(entry)}>
                    Apply
                  </button>
                  <button type="button" className="ghost-button" onClick={() => skipSuggestion(entry)}>
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h2>Status</h2>
        </div>
        <pre className="admin-log">{status}</pre>
      </section>
    </div>
  );
}

async function downloadDictionary(supabase: SupabaseClient): Promise<Dictionary> {
  const { data, error } = await supabase.storage.from(dictionaryBucket).download(dictionaryPath);

  if (error) {
    return {};
  }

  try {
    return normalizeDictionaryInput(JSON.parse(await data.text()));
  } catch {
    throw new Error(`${dictionaryPath} exists but is not valid JSON.`);
  }
}

async function uploadDictionary(supabase: SupabaseClient, dictionary: Dictionary): Promise<void> {
  const dictionaryFile = new File([JSON.stringify(dictionary, null, 2)], dictionaryPath, { type: "application/json" });
  const { error } = await supabase.storage.from(dictionaryBucket).upload(dictionaryPath, dictionaryFile, {
    cacheControl: "3600",
    contentType: "application/json",
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed for ${dictionaryBucket}/${dictionaryPath}: ${error.message}`);
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

function normalizeDictionaryInput(json: unknown): Dictionary {
  if (Array.isArray(json)) {
    return Object.fromEntries(
      json.map((item) => normalizeDictionaryEntry(item)).map((entry) => [normalizeArabicWord(entry.word), entry]),
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error("Dictionary JSON must be an array of word entries or an object keyed by Arabic word.");
  }

  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>).map(([key, value]) => {
      const entry = normalizeDictionaryEntry(value, key);
      return [normalizeArabicWord(entry.word || key), entry];
    }),
  );
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
      ? record.meaning
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  if (!word) {
    throw new Error("Each dictionary entry needs a word.");
  }

  return {
    ...record,
    word,
    baseWord: typeof record.baseWord === "string" ? record.baseWord : "",
    meaning,
    root: typeof record.root === "string" ? record.root : "",
    wazn: typeof record.wazn === "string" ? record.wazn : "",
    forms: typeof record.forms === "string" ? record.forms : "",
    bab: typeof record.bab === "string" ? record.bab : "",
    partOfSpeech: typeof record.partOfSpeech === "string" ? record.partOfSpeech : "",
  };
}

function createDraftEntry(word: string): DictionaryEntry {
  return {
    word,
    baseWord: "",
    meaning: [],
    root: "",
    wazn: "",
    forms: "",
    bab: "",
    partOfSpeech: "",
  };
}

function buildMissingWordContexts(lyrics: NushudContentJson, dictionary: Dictionary): WordContext[] {
  const contexts = new Map<string, WordContext>();

  lyrics.lines.forEach((line) => {
    tokenizeArabicLine(line.ar).forEach((word) => {
      const normalizedWord = normalizeArabicWord(word);
      if (!normalizedWord || dictionary[normalizedWord]) return;

      const context = contexts.get(normalizedWord) ?? { word: normalizedWord, normalizedWord, lines: [] };
      if (context.lines.length < 3) {
        context.lines.push({
          ar: line.ar,
          en: typeof line.en === "string" ? line.en : undefined,
        });
      }
      contexts.set(normalizedWord, context);
    });
  });

  return [...contexts.values()];
}

function parseArabicWords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  text
    .split(/[\s,،]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .forEach((word) => {
      const normalizedWord = normalizeArabicWord(word);
      if (!normalizedWord || seen.has(normalizedWord)) return;
      seen.add(normalizedWord);
      words.push(word);
    });

  return words;
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
