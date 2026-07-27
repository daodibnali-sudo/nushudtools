import type { DragEvent } from "react";
import type { UploadedTextFile } from "../types";

type UploadPanelProps = {
  audioFile: File | null;
  arabicFileName: string;
  arabicText: string;
  translations: UploadedTextFile[];
  keepEmptyLines: boolean;
  hasImportedJson: boolean;
  onAudioUpload: (file: File | null) => void;
  onArabicUpload: (file: File | null) => void;
  onArabicTextChange: (text: string) => void;
  onTranslationsUpload: (files: FileList | null) => void;
  onAddPastedTranslation: () => void;
  onTranslationLanguageChange: (id: string, languageCode: string) => void;
  onTranslationTextChange: (id: string, text: string) => void;
  onRemoveTranslation: (id: string) => void;
  onKeepEmptyLinesChange: (keepEmptyLines: boolean) => void;
};

export function UploadPanel({
  audioFile,
  arabicFileName,
  arabicText,
  translations,
  keepEmptyLines,
  hasImportedJson,
  onAudioUpload,
  onArabicUpload,
  onArabicTextChange,
  onTranslationsUpload,
  onAddPastedTranslation,
  onTranslationLanguageChange,
  onTranslationTextChange,
  onRemoveTranslation,
  onKeepEmptyLinesChange,
}: UploadPanelProps) {
  const handleAudioDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFile = Array.from(event.dataTransfer.files).find(
      (file) => file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"),
    );
    if (droppedFile) {
      onAudioUpload(droppedFile);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Uploads</h2>
        <p>{hasImportedJson ? "Text loaded from JSON — only add the MP3" : "Drag MP3, upload files, or paste text"}</p>
      </div>
      <div className="upload-grid">
        <label
          className="file-box drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleAudioDrop}
        >
          <strong>MP3 audio</strong>
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={(event) => onAudioUpload(event.target.files?.[0] ?? null)}
          />
          <span>{audioFile?.name ?? "Drop MP3 here or choose file"}</span>
        </label>
        <label className="file-box">
          <strong>{hasImportedJson ? "Arabic loaded from JSON" : "Arabic lyrics .txt"}</strong>
          <input
            type="file"
            accept="text/plain,.txt"
            onChange={(event) => onArabicUpload(event.target.files?.[0] ?? null)}
          />
          <span>{hasImportedJson ? "Already loaded · choose TXT only to replace it" : arabicFileName || "No Arabic text selected"}</span>
        </label>
        <label className="file-box">
          <strong>{hasImportedJson ? "Translations loaded from JSON" : "Translation .txt files"}</strong>
          <input
            type="file"
            accept="text/plain,.txt"
            multiple
            onChange={(event) => onTranslationsUpload(event.target.files)}
          />
          <span>{hasImportedJson ? `${translations.length} language(s) loaded · TXT is optional` : translations.length ? `${translations.length} translation file(s)` : "Optional"}</span>
        </label>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={keepEmptyLines}
          onChange={(event) => onKeepEmptyLinesChange(event.target.checked)}
        />
        Keep empty lines
      </label>
      <div className="paste-grid">
        <label>
          Paste Arabic lyrics
          <textarea
            className="paste-textarea arabic-input"
            dir="rtl"
            value={arabicText}
            onChange={(event) => onArabicTextChange(event.target.value)}
            placeholder="الصق كلمات النشيد هنا..."
          />
        </label>
        <div className="paste-actions">
          <button type="button" onClick={onAddPastedTranslation}>
            Add pasted translation
          </button>
        </div>
      </div>
      {translations.length > 0 && (
        <div className="translation-list">
          {translations.map((translation) => (
            <div className="translation-item" key={translation.id}>
              <div>
                <strong>{translation.fileName}</strong>
                <span>{translation.lines.length} lines</span>
              </div>
              <input
                value={translation.languageCode}
                onChange={(event) => onTranslationLanguageChange(translation.id, event.target.value)}
                aria-label={`Language code for ${translation.fileName}`}
                placeholder="en"
              />
              <button type="button" className="ghost-button" onClick={() => onRemoveTranslation(translation.id)}>
                Remove
              </button>
              <textarea
                className="translation-textarea"
                value={translation.sourceText}
                onChange={(event) => onTranslationTextChange(translation.id, event.target.value)}
                aria-label={`Text for ${translation.fileName}`}
                placeholder="Paste translation lines here."
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
