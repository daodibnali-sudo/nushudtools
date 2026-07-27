type HeaderProps = {
  currentView?: "sync" | "dictionary" | "library" | "publish";
  onNavigate?: (view: "sync" | "dictionary" | "library") => void;
};

export function Header({ currentView, onNavigate }: HeaderProps) {
  const buildDate = new Date(__APP_BUILD_TIME__);
  const versionLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(buildDate);

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Private publishing workflow</p>
        <h1>NUSHUD Tool</h1>
      </div>
      <div className="header-actions">
        {onNavigate && currentView && (
          <nav className="view-tabs" aria-label="Tool sections">
            <button
              type="button"
              className={currentView === "sync" || currentView === "publish" ? "active" : ""}
              onClick={() => onNavigate("sync")}
            >
              Publish
            </button>
            <button
              type="button"
              className={currentView === "dictionary" ? "active" : ""}
              onClick={() => onNavigate("dictionary")}
            >
              Dictionary
            </button>
            <button
              type="button"
              className={currentView === "library" ? "active" : ""}
              onClick={() => onNavigate("library")}
            >
              Library
            </button>
          </nav>
        )}
        <div className="build-version" title={buildDate.toISOString()}>
          <span>Last updated</span>
          <strong>{versionLabel}</strong>
        </div>
        <div className="header-mark">NT</div>
      </div>
    </header>
  );
}
