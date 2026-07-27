import type { DragEvent } from "react";
import type { NushudContentJson } from "../types";

type ExistingJsonPanelProps = {
  existingJsonFileName: string;
  existingJson: NushudContentJson | null;
  onJsonUpload: (file: File | null) => void;
  onClear: () => void;
};

export function ExistingJsonPanel({ existingJsonFileName, existingJson, onJsonUpload, onClear }: ExistingJsonPanelProps) {
  const handleJsonDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFile = Array.from(event.dataTransfer.files).find((file) => file.name.toLowerCase().endsWith(".json"));
    if (droppedFile) {
      onJsonUpload(droppedFile);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Already Have JSON?</h2>
        <p>Load its text, translations, and any existing timing</p>
      </div>
      <label className="file-box drop-zone compact-file-box" onDragOver={(event) => event.preventDefault()} onDrop={handleJsonDrop}>
        Lyrics JSON (timestamps optional)
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => onJsonUpload(event.target.files?.[0] ?? null)}
        />
        <span>{existingJsonFileName || "Choose a lyrics JSON. TXT files are not needed."}</span>
      </label>
      {existingJson && (
        <div className="metadata-preview existing-json-preview">
          <strong>{existingJson.title || "Title not set"}</strong>
          <span>Slug: {existingJson.id || "not set"}</span>
          <span>Artist: {existingJson.artist || "not set"}</span>
          <span>Audio: {existingJson.audioFileName || "not set"}</span>
          <span>Lines: {existingJson.lines.length}</span>
          <span>Languages: {Array.isArray(existingJson.languages) ? existingJson.languages.join(", ") : "detected from lines"}</span>
        </div>
      )}
      {existingJson && (
        <div className="button-row admin-actions">
          <button type="button" className="ghost-button" onClick={onClear}>
            Clear imported JSON
          </button>
        </div>
      )}
    </section>
  );
}
