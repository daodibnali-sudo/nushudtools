import type { NushudContentJson, ValidationMessage } from "../types";
import { makeDownloadName } from "../utils/exportJson";

type ExportPanelProps = {
  contentJson: NushudContentJson | null;
  warnings: ValidationMessage[];
  contentJsonSource: "generated" | "imported";
  continueMessage: string;
  onContinue: () => void;
};

export function ExportPanel({ contentJson, warnings, contentJsonSource, continueMessage, onContinue }: ExportPanelProps) {
  const jsonText = contentJson ? JSON.stringify(contentJson, null, 2) : "";

  const copyJson = async () => {
    if (jsonText) {
      await navigator.clipboard.writeText(jsonText);
    }
  };

  const downloadJson = () => {
    if (!contentJson) return;
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = makeDownloadName(contentJson.title);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel export-panel">
      <div className="panel-heading">
        <h2>Export</h2>
        <p>{contentJsonSource === "imported" ? "Imported timed JSON" : "One clean JSON file"}</p>
      </div>
      {warnings.length > 0 && (
        <div className="message-list">
          {warnings.map((warning) => (
            <div className={`message ${warning.type}`} key={warning.id}>
              {warning.text}
            </div>
          ))}
        </div>
      )}
      <div className="button-row">
        <button type="button" onClick={copyJson} disabled={!contentJson}>
          Copy JSON
        </button>
        <button type="button" className="primary-button" onClick={downloadJson} disabled={!contentJson}>
          Download JSON
        </button>
        <button type="button" className="primary-button" onClick={onContinue} disabled={!contentJson}>
          Continue
        </button>
      </div>
      {continueMessage && <p className="status-text warning-text">{continueMessage}</p>}
      <textarea readOnly value={jsonText} placeholder="JSON output will appear here." />
    </section>
  );
}
