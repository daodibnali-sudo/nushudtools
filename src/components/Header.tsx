type HeaderProps = {
  currentView?: "sync" | "dictionary" | "publish";
  onNavigate?: (view: "sync" | "dictionary") => void;
};

export function Header({ currentView, onNavigate }: HeaderProps) {
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
          </nav>
        )}
        <div className="header-mark">NT</div>
      </div>
    </header>
  );
}
