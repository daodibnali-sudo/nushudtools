import type { ContentLine, Metadata, NushudContentJson, UploadedTextFile } from "../types";

type BuildExportArgs = {
  metadata: Metadata;
  audioFileName: string;
  arabicLines: string[];
  translations: UploadedTextFile[];
  timestamps: Array<number | null>;
  firstLineStartMs: number;
};

export function buildContentJson({
  metadata,
  audioFileName,
  arabicLines,
  translations,
  timestamps,
  firstLineStartMs,
}: BuildExportArgs): NushudContentJson {
  const exportableTranslations: UploadedTextFile[] = [];
  const seenLanguageCodes = new Set(["ar"]);

  translations.forEach((translation) => {
    const languageCode = translation.languageCode.trim().toLowerCase();
    if (!languageCode || seenLanguageCodes.has(languageCode)) {
      return;
    }

    seenLanguageCodes.add(languageCode);
    exportableTranslations.push({ ...translation, languageCode });
  });

  const languages = ["ar", ...exportableTranslations.map((file) => file.languageCode)];

  const lines: ContentLine[] = arabicLines.map((arabicLine, index) => {
    const line: ContentLine = {
      lineIndex: index,
      startMs: index === 0 ? firstLineStartMs : timestamps[index - 1] ?? 0,
      endMs: timestamps[index] ?? null,
      ar: arabicLine,
    };

    exportableTranslations.forEach((translation) => {
      line[translation.languageCode] = translation.lines[index] ?? "";
    });

    return line;
  });

  return {
    id: metadata.id.trim(),
    title: metadata.title.trim(),
    artist: metadata.artist.trim(),
    audioFileName,
    lineCount: arabicLines.length,
    languages,
    lines,
  };
}

export function makeDownloadName(title: string): string {
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeTitle ? `${safeTitle}.json` : "nushud-content.json";
}
