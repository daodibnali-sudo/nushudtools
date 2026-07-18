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

async function generateEntries(apiKey: string, model: string, words: WordContext[]): Promise<DictionaryEntry[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_schema", json_schema: entriesJsonSchema },
      messages: [
        {
          role: "system",
          content:
            "You are an Arabic morphology assistant for a Classical Arabic learning app. First decide the single grammatical type of each word, then return only the fields that type needs — the response schema already forbids any other field, so do not try to add extra ones. Use the provided Arabic/English line context to identify the intended sense, not a literal translation of the whole line.",
        },
        {
          role: "user",
          content: JSON.stringify({
            words,
            fieldsByType: typeFields,
            rules: [
              "meaning: 2 to 4 short English glosses for this specific word in this context, not a sentence translation.",
              "meaningRu: 2 to 4 short Russian glosses matching the same senses as meaning; empty array only if truly unsure.",
              "All Arabic values (word, root, plural, imperative, present, wazn, masculine, feminine) must include harakat/diacritics whenever known. Do not return unvocalized forms like فعل when the vocalized فَعَلَ is known.",
              "noun.root: root letters separated by spaces, e.g. ر ج ع. noun.plural: the plural noun form, or the singular form if the word itself is already the plural.",
              "verb.imperative: the imperative form. verb.present: the present/imperfect form. verb.wazn: the verb's pattern, e.g. فَعَلَ or أَفْعَلَ.",
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
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
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

  return parsed.entries.map(normalizeEntry);
}

function normalizeEntry(value: unknown): DictionaryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI returned an invalid dictionary entry.");
  }

  const record = value as Record<string, unknown>;
  const word = String(record.word ?? "").trim();
  const partOfSpeech = String(record.partOfSpeech ?? "") as PartOfSpeech;
  const meaning = asStringArray(record.meaning);
  const meaningRu = asStringArray(record.meaningRu);

  if (!word || !(partOfSpeech in typeFields) || meaning.length === 0) {
    throw new Error(`OpenAI returned an incomplete dictionary entry for ${word || "(unknown word)"}.`);
  }

  const entry: DictionaryEntry = { word, partOfSpeech, meaning: meaning.slice(0, 4), meaningRu: meaningRu.slice(0, 4) };

  for (const field of typeFields[partOfSpeech]) {
    const fieldValue = typeof record[field] === "string" ? (record[field] as string).trim() : "";
    (entry as Record<string, unknown>)[field] = fieldValue;
  }

  return entry;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
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

// Shared "sense" fields every part-of-speech variant carries.
const senseProperties = {
  word: { type: "string", description: "Arabic surface form from input, with harakat when appropriate." },
  meaning: { type: "array", items: { type: "string" }, description: "2 to 4 short English glosses." },
  meaningRu: { type: "array", items: { type: "string" }, description: "2 to 4 short Russian glosses." },
};

function posVariant(partOfSpeech: PartOfSpeech, extraProperties: Record<string, unknown> = {}) {
  const properties = {
    ...senseProperties,
    partOfSpeech: { type: "string", enum: [partOfSpeech] },
    ...extraProperties,
  };

  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const arabicField = { type: "string", description: "Arabic with harakat when known, or empty string if not applicable." };

const entriesJsonSchema = {
  name: "dictionary_entries",
  strict: true,
  schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          anyOf: [
            posVariant("noun", { root: arabicField, plural: arabicField }),
            posVariant("verb", { imperative: arabicField, present: arabicField, wazn: arabicField }),
            posVariant("adjective", { masculine: arabicField, feminine: arabicField, plural: arabicField }),
            posVariant("adverb"),
            posVariant("pronoun"),
            posVariant("particle"),
            posVariant("preposition", { governs: { type: "string", description: "Short label, e.g. genitive." } }),
            posVariant("conjunction"),
            posVariant("expression", { literalMeaning: { type: "string", description: "Literal word-for-word English rendering." } }),
          ],
        },
      },
    },
    required: ["entries"],
    additionalProperties: false,
  },
};
