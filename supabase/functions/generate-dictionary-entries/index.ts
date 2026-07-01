/// <reference path="../types.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type DictionaryEntry = {
  word: string;
  baseWord: string;
  meaning: string[];
  root: string;
  wazn: string;
  forms: string;
  bab: string;
  partOfSpeech: string;
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
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an Arabic morphology assistant for a Classical Arabic learning app. Return only valid JSON with an entries array. Use the provided Arabic/English line context to identify the intended sense. Be precise and do not confuse morphology fields.",
        },
        {
          role: "user",
          content: JSON.stringify({
            words,
            entryShape: {
              word: "same Arabic word from input, with harakat when appropriate",
              baseWord: "base Arabic lemma without attached particles/pronouns, with harakat when appropriate",
              meaning: ["2 to 4 short English meanings or glosses"],
              root: "Arabic root letters separated by spaces, preferably with harakat when useful, or empty string",
              wazn:
                "Arabic pattern pair for verbs such as \u0641\u064E\u0639\u064E\u0644\u064E\u060C \u064A\u064E\u0641\u0652\u0639\u064F\u0644\u064F or \u0641\u064E\u0639\u0651\u064E\u0644\u064E\u060C \u064A\u064F\u0641\u064E\u0639\u0651\u0650\u0644\u064F; Arabic noun pattern such as \u0641\u064E\u0627\u0639\u0650\u0644 or \u0645\u064E\u0641\u0652\u0639\u064F\u0648\u0644; empty string if not applicable",
              forms:
                "actual Arabic word forms for learners, such as \u0637\u064E\u0627\u0644\u064E\u060C \u064A\u064E\u0637\u064F\u0648\u0644\u064F for a verb; singular/plural or common form for nouns; empty string if not applicable",
              bab: "Arabic form/category label such as \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u0623\u0648\u0644: \u0641\u064E\u0639\u064E\u0644\u064E, \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u062B\u0627\u0646\u064A: \u0641\u064E\u0639\u0651\u064E\u0644\u064E, \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u062B\u0627\u0644\u062B: \u0641\u064E\u0627\u0639\u064E\u0644\u064E, or empty string if not applicable",
              partOfSpeech: "one grammar type only: verb, noun, adjective, particle, pronoun, preposition, adverb, conjunction, or phrase",
            },
            rules: [
              "Use the Arabic and English line context to determine the intended sense.",
              "Do not translate the whole line as the word meaning.",
              "All Arabic in word, wazn, forms, and bab must include harakat/diacritics whenever applicable.",
              "Root letters may be separated by spaces and should use harakat only if that helps learning; do not add fake case endings to isolated root letters.",
              "Do not return unvocalized Arabic patterns like فعل or يطول when vocalized forms like فَعَلَ or يَطُولُ are known.",
              "meaning must contain 2, 3, or 4 useful short meanings. Do not return only one meaning unless the word is a particle with no other natural gloss.",
              "For verbs, wazn must be Arabic and include both perfect and imperfect patterns when known, for example \u0641\u064E\u0639\u064E\u0644\u064E\u060C \u064A\u064E\u0641\u0652\u0639\u064F\u0644\u064F; \u0641\u064E\u0639\u0650\u0644\u064E\u060C \u064A\u064E\u0641\u0652\u0639\u064E\u0644\u064F; \u0641\u064E\u0639\u0651\u064E\u0644\u064E\u060C \u064A\u064F\u0641\u064E\u0639\u0651\u0650\u0644\u064F; \u0641\u064E\u0627\u0639\u064E\u0644\u064E\u060C \u064A\u064F\u0641\u064E\u0627\u0639\u0650\u0644\u064F; \u0623\u064E\u0641\u0652\u0639\u064E\u0644\u064E\u060C \u064A\u064F\u0641\u0652\u0639\u0650\u0644\u064F.",
              "For verbs, forms must show the actual word using the same perfect/imperfect pattern, for example for \u0637\u0627\u0644 return \u0637\u064E\u0627\u0644\u064E\u060C \u064A\u064E\u0637\u064F\u0648\u0644\u064F while wazn is \u0641\u064E\u0639\u064E\u0644\u064E\u060C \u064A\u064E\u0641\u0652\u0639\u064F\u0644\u064F.",
              "For nouns, forms must show noun forms only, such as singular/plural or possessed/base forms. Example: \u0644\u064E\u064A\u0652\u0644\u064C\u060C \u0644\u064E\u064A\u064E\u0627\u0644\u064D. Do not give verb forms for nouns.",
              "For verbs, bab must be Arabic and include the form/category and Arabic pattern, for example \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u0623\u0648\u0644: \u0641\u064E\u0639\u064E\u0644\u064E, \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u062B\u0627\u0646\u064A: \u0641\u064E\u0639\u0651\u064E\u0644\u064E, \u0627\u0644\u0628\u0627\u0628 \u0627\u0644\u062B\u0627\u0644\u062B: \u0641\u064E\u0627\u0639\u064E\u0644\u064E.",
              "bab must be Arabic if not empty. Never return English labels like Form I, noun, verb, active participle, or passive participle in bab.",
              "Do not put only Form I, Form II, etc. in wazn.",
              "Do not put verb, noun, particle, etc. in bab. Put it in partOfSpeech.",
              "For nouns, wazn should be an Arabic noun pattern when known, for example \u0641\u064E\u0627\u0639\u0650\u0644, \u0645\u064E\u0641\u0652\u0639\u064F\u0648\u0644, \u0641\u064E\u0639\u0650\u064A\u0644, or empty string.",
              "For nouns, bab should be an Arabic category such as \u0627\u0633\u0645 \u0641\u0627\u0639\u0644, \u0627\u0633\u0645 \u0645\u0641\u0639\u0648\u0644, \u0645\u0635\u062F\u0631, \u0627\u0633\u0645 \u0645\u0643\u0627\u0646, or empty string.",
              "For particles, prepositions, pronouns, and conjunctions, root, wazn, and bab should usually be empty strings.",
              "If a word has attached \u0648, \u0641, \u0628, \u0644, \u0643, or \u0627\u0644, analyze the meaningful base word, but keep the original input in word.",
              "Use baseWord for the stripped lexical word. Example: word \u0648\u064E\u0627\u0644\u0644\u064E\u064A\u064E\u0627\u0644\u0650\u064A, baseWord \u0644\u064E\u064A\u0652\u0644.",
              "Use concise English meanings, not full sentence translations.",
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
  const meaning = Array.isArray(record.meaning)
    ? record.meaning.map((item) => String(item).trim()).filter(Boolean)
    : typeof record.meaning === "string"
      ? [record.meaning.trim()].filter(Boolean)
      : [];

  if (!word || meaning.length === 0) {
    throw new Error("OpenAI returned an incomplete dictionary entry.");
  }

  const wazn = typeof record.wazn === "string" ? record.wazn : "";
  const forms = typeof record.forms === "string" ? record.forms : "";
  const bab = typeof record.bab === "string" ? record.bab : "";

  if (bab && /form|verb|noun|active|passive/i.test(bab)) {
    throw new Error(`OpenAI returned English text in bab for ${word}.`);
  }

  return {
    word,
    baseWord: typeof record.baseWord === "string" ? record.baseWord : "",
    meaning: meaning.slice(0, 4),
    root: typeof record.root === "string" ? record.root : "",
    wazn,
    forms,
    bab,
    partOfSpeech: typeof record.partOfSpeech === "string" ? record.partOfSpeech : "",
  };
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
