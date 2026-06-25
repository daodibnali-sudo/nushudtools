import type { UploadedTextFile } from "../types";
import { getTextDirection } from "../utils/direction";

type SyncPreviewProps = {
  arabicLines: string[];
  translations: UploadedTextFile[];
  currentLine: number;
  timestamps: Array<number | null>;
};

export function SyncPreview({ arabicLines, translations, currentLine, timestamps }: SyncPreviewProps) {
  const previous = currentLine > 0 ? arabicLines[currentLine - 1] : "";
  const current = arabicLines[currentLine] ?? "";
  const next = arabicLines[currentLine + 1] ?? "";

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <h2>Sync Preview</h2>
        <p>{timestamps.filter((timestamp) => timestamp !== null).length} marked</p>
      </div>
      <div className="context-lines">
        <div>
          <span>Previous</span>
          <p dir="rtl">{previous || "..."}</p>
        </div>
        <div className="current-preview">
          <span>Current Arabic</span>
          <p dir="rtl">{current || "All lines complete"}</p>
        </div>
        <div>
          <span>Next</span>
          <p dir="rtl">{next || "..."}</p>
        </div>
      </div>
      {translations.length > 0 && current && (
        <div className="translation-preview">
          {translations.map((translation) => (
            <div key={translation.id}>
              <span>{translation.languageCode}</span>
              <p dir={getTextDirection(translation.languageCode)}>
                {translation.lines[currentLine] ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
