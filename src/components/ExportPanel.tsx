import type { NushudContentJson, ValidationMessage } from "../types";
import { makeDownloadName } from "../utils/exportJson";

type ExportPanelProps = {
  contentJson: NushudContentJson | null;
  warnings: ValidationMessage[];
};

export function ExportPanel({ contentJson, warnings }: ExportPanelProps) {
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
        <p>One clean JSON file</p>
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
      </div>
      <textarea readOnly value={jsonText} placeholder="JSON output will appear here." />
    </section>
  );
}
