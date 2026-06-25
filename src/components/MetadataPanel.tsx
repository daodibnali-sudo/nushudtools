import type { Metadata } from "../types";

type MetadataPanelProps = {
  metadata: Metadata;
  onChange: (metadata: Metadata) => void;
};

export function MetadataPanel({ metadata, onChange }: MetadataPanelProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Metadata</h2>
        <p>Optional export fields</p>
      </div>
      <div className="field-grid">
        <label>
          Title
          <input
            value={metadata.title}
            onChange={(event) => onChange({ ...metadata, title: event.target.value })}
            placeholder="Taweel Al Shawq"
          />
        </label>
        <label>
          Artist
          <input
            value={metadata.artist}
            onChange={(event) => onChange({ ...metadata, artist: event.target.value })}
            placeholder="Unknown"
          />
        </label>
        <label>
          Nasheed ID / slug
          <input
            value={metadata.id}
            onChange={(event) => onChange({ ...metadata, id: event.target.value })}
            placeholder="taweel-al-shawq"
          />
        </label>
      </div>
    </section>
  );
}
