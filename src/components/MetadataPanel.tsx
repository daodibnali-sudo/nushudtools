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
        <p>Fill in or update imported JSON details</p>
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
        <label>
          Difficulty
          <select
            value={metadata.difficulty}
            onChange={(event) =>
              onChange({
                ...metadata,
                difficulty: event.target.value as Metadata["difficulty"],
              })
            }
          >
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>
        <label>
          Tags
          <input
            value={metadata.tags}
            onChange={(event) => onChange({ ...metadata, tags: event.target.value })}
            placeholder="warrior, romantic, slow"
          />
        </label>
      </div>
    </section>
  );
}
