export type ContentLine = {
  lineIndex: number;
  startMs: number;
  endMs: number | null;
  ar: string;
  [languageCode: string]: string | number | null;
};

export type UploadedTextFile = {
  id: string;
  fileName: string;
  languageCode: string;
  sourceText: string;
  lines: string[];
};

export type Metadata = {
  id: string;
  title: string;
  artist: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string;
};

export type NushudContentJson = {
  id: string;
  title: string;
  artist: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  audioFileName: string;
  durationMs?: number;
  lineCount: number;
  languages: string[];
  lines: ContentLine[];
};

export type ValidationMessage = {
  id: string;
  type: "error" | "warning" | "success";
  text: string;
};
