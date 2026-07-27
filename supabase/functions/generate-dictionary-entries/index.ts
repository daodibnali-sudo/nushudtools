/// <reference path="../types.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "particle"
  | "preposition"
  | "conjunction"
  | "expression";

type DictionaryEntry = {
  word: string;
  partOfSpeech: PartOfSpeech;
  meaning: string[];
  meaningRu: string[];
  root?: string;
  plural?: string;
  imperative?: string;
  present?: string;
  wazn?: string;
  masculine?: string;
  feminine?: string;
  governs?: string;
  literalMeaning?: string;
};

type WordContext = {
  word: string;
  normalizedWord?: string;
  lines?: Array<{
    ar?: string;
    en?: string;
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fields required for every part of speech, beyond the shared word/partOfSpeech/meaning/meaningRu.
const typeFields: Record<PartOfSpeech, string[]> = {
  noun: ["root", "plural"],
  verb: ["imperative", "present", "wazn"],
  adjective: ["masculine", "feminine", "plural"],
  adverb: [],
  pronoun: [],
  particle: [],
  preposition: ["governs"],
  conjunction: [],
  expression: ["literalMeaning"],
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const openAiApiKey = requireEnv("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const authorization = request.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ error: "Missing Authorization header." }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: adminResult, error: adminError } = await supabase.rpc("is_admin");

    if (adminError || adminResult !== true) {
      return jsonResponse({ error: "Admin access required." }, 403);
    }

    const body = (await request.json()) as { words?: unknown };
    const words = parseWords(body.words);

    if (words.length === 0) {
      return jsonResponse({ entries: [] });
    }

    const entries = await generateEntries(openAiApiKey, openAiModel, words);
    return jsonResponse({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return jsonResponse({ error: message }, 500);
  }
});

// All morphology fields across every part of speech. The OpenAI Structured Outputs "strict"
// mode requires every property to be listed in `required`, so optionality is expressed by
// making each of these nullable (`["string", "null"]`) instead of omitting it — the model
// must then explicitly write `null` for fields that don't apply, rather than being able to
// just leave a field out (which is what let it silently skip required fields before).
const allMorphologyFields = Array.from(new Set(Object.values(typeFields).flat()));

const dictionaryEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["word", "partOfSpeech", "meaning", "meaningRu", ...allMorphologyFields],
  properties: {
    word: { type: "string" },
    partOfSpeech: { type: "string", enum: Object.keys(typeFields) },
    meaning: { type: "array", items: { type: "string" } },
    meaningRu: { type: "array", items: { type: "string" } },
    ...Object.fromEntries(allMorphologyFields.map((field) => [field, { type: ["string", "null"] }])),
  },
};

const dictionaryResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: { type: "array", items: dictionaryEntrySchema },
  },
};

const MAX_RETRIES_PER_WORD = 2;

async function generateEntries(apiKey: string, model: string, words: WordContext[]): Promise<DictionaryEntry[]> {
  const initial = await callOpenAiForWords(apiKey, model, words);
  const incompleteIndexes = initial
    .map((entry, index) => (isEntryComplete(entry) ? -1 : index))
    .filter((index) => index >= 0);

  if (incompleteIndexes.length === 0) {
    return initial;
  }

  // Structured Outputs guarantees the model returns every field with the right type, but it
  // can't force the *content* to be non-empty — a lazy model can still write "" or null for a
  // required field. Retry those specific words on their own (smaller prompt, less to juggle)
  // instead of silently accepting a blank, which is what caused regenerate-all to look
  // successful while leaving most morphology fields empty.
  const results = [...initial];

  for (const index of incompleteIndexes) {
    const context = words[index];
    let attempt = 0;
    let bestEntry = initial[index];

    while (attempt < MAX_RETRIES_PER_WORD && !isEntryComplete(bestEntry)) {
      attempt += 1;

      try {
        const [retried] = await callOpenAiForWords(apiKey, model, [context]);
        if (retried) {
          bestEntry = retried;
        }
      } catch {
        // Keep the previous best attempt; a network/API hiccup on retry shouldn't lose progress
        // already made on this word.
      }
    }

    results[index] = bestEntry;
  }

  return results;
}

function isFilledValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && !["-", "—", "n/a", "unknown", "?"].includes(trimmed);
}

function isEntryComplete(entry: DictionaryEntry): boolean {
  const requiredFields = typeFields[entry.partOfSpeech] ?? [];
  return (
    entry.meaning.length > 0
    && entry.meaningRu.length > 0
    && requiredFields.every((field) => isFilledValue((entry as Record<string, unknown>)[field]))
  );
}

async function callOpenAiForWords(apiKey: string, model: string, words: WordContext[]): Promise<DictionaryEntry[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_schema",
        json_schema: { name: "dictionary_entries", strict: true, schema: dictionaryResponseSchema },
      },
      messages: [
        {
          role: "system",
          content:
            "You are an Arabic morphology assistant for a Classical Arabic learning app. First decide the single grammatical type of each word. A conjugated finite verb, imperative, participial verb used verbally, or verb with attached particles must still be classified as verb and analyzed from its underlying lemma. Use the provided Arabic/English line context to identify the intended sense, not a literal translation of the whole line.",
        },
        {
          role: "user",
          content: JSON.stringify({
            words,
            fieldsByType: typeFields,
            responseShape:
              "Return a JSON object with an entries array, one entry per input word in the same order. Every entry must include every field in the schema. Set a field to null when it does not apply to that word's partOfSpeech (per fieldsByType); never null for a field that fieldsByType requires for the chosen partOfSpeech.",
            rules: [
              "meaning: 2 to 4 short English glosses for this specific word in this context, not a sentence translation.",
              "meaningRu: 2 to 4 non-empty short Russian glosses matching the same senses as meaning.",
              "Every field required for the selected part of speech MUST be filled with a real value. Never use an empty string, dash, question mark, 'unknown', or 'N/A' for a required field — use null only for fields that don't apply to this partOfSpeech at all. Choose the best standard dictionary value when context is limited.",
              "All Arabic values (word, root, plural, imperative, present, wazn, masculine, feminine) must include harakat/diacritics whenever known. Do not return unvocalized forms like فعل when the vocalized فَعَلَ is known.",
              "noun.root: root letters separated by spaces, e.g. ر ج ع. noun.plural: the plural noun form, or the singular form if the word itself is already the plural.",
              "For every verb, imperative, present, and wazn MUST contain real vocalized Arabic and must never be blank, a dash, or 'not applicable'. Derive them from the underlying dictionary verb even when word is a past, present, imperative, plural, feminine, passive, or has an attached particle.",
              "verb.imperative: second-person masculine singular command, e.g. اُكْتُبْ. verb.present: third-person masculine singular present/imperfect, e.g. يَكْتُبُ. verb.wazn: the vocalized morphological pattern/form, e.g. فَعَلَ or أَفْعَلَ.",
              "adjective.masculine and adjective.feminine: the two gender forms. adjective.plural: the plural form.",
              "preposition.governs: a short label for what case/object it governs, e.g. \"genitive\" or \"object pronoun\".",
              "expression.literalMeaning: a short literal, word-for-word English rendering of the phrase, distinct from its idiomatic meaning.",
              "If a word has an attached و, ف, ب, ل, ك, or ال, analyze the meaningful base word but keep the original surface form in word.",
              "expression is only for multi-word fixed phrases, not single words with an idiomatic sense.",
            ],
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI request failed: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 800)}` : ""}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI response did not include content.");
  }

  const parsed = JSON.parse(content) as { entries?: unknown };

  if (!Array.isArray(parsed.entries)) {
    throw new Error("OpenAI response must contain an entries array.");
  }

  const entriesByNormalizedWord = new Map<string, unknown>();
  parsed.entries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const word = String((entry as Record<string, unknown>).word ?? "").trim();
    if (word) entriesByNormalizedWord.set(normalizeArabicWord(word), entry);
  });

  return words.map((context, index) => {
    const entry = entriesByNormalizedWord.get(normalizeArabicWord(context.word)) ?? parsed.entries?.[index];
    return normalizeEntry(entry, context.word);
  });
}

function normalizeEntry(value: unknown, fallbackWord = ""): DictionaryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDraftEntry(fallbackWord);
  }

  const record = value as Record<string, unknown>;
  const word = String(record.word ?? fallbackWord).trim() || fallbackWord;
  const rawPartOfSpeech = String(record.partOfSpeech ?? "").trim();
  const partOfSpeech = (rawPartOfSpeech in typeFields ? rawPartOfSpeech : "noun") as PartOfSpeech;
  const meaning = asStringArray(record.meaning);
  const meaningRu = asStringArray(record.meaningRu);

  const entry: DictionaryEntry = { word, partOfSpeech, meaning: meaning.slice(0, 4), meaningRu: meaningRu.slice(0, 4) };

  for (const field of typeFields[partOfSpeech]) {
    const fieldValue = typeof record[field] === "string" ? (record[field] as string).trim() : "";
    (entry as Record<string, unknown>)[field] = fieldValue;
  }

  return entry;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function createDraftEntry(word: string): DictionaryEntry {
  return {
    word,
    partOfSpeech: "noun",
    meaning: [],
    meaningRu: [],
    root: "",
    plural: "",
  };
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

function parseWords(value: unknown): WordContext[] {
  if (!Array.isArray(value)) {
    throw new Error("words must be an array.");
  }

  const contexts = value.map((item): WordContext => {
    if (typeof item === "string") {
      return { word: item.trim() };
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { word: "" };
    }

    const record = item as Record<string, unknown>;
    const lines = Array.isArray(record.lines)
      ? record.lines
          .filter((line): line is Record<string, unknown> => !!line && typeof line === "object" && !Array.isArray(line))
          .slice(0, 3)
          .map((line) => ({
            ar: typeof line.ar === "string" ? line.ar : undefined,
            en: typeof line.en === "string" ? line.en : undefined,
          }))
      : [];

    return {
      word: String(record.word ?? "").trim(),
      normalizedWord: typeof record.normalizedWord === "string" ? record.normalizedWord : undefined,
      lines,
    };
  });

  const seen = new Set<string>();
  return contexts
    .filter((context) => {
      if (!context.word || seen.has(context.word)) return false;
      seen.add(context.word);
      return true;
    })
    .slice(0, 100);
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

