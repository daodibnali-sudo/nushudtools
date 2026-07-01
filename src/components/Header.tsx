type HeaderProps = {
  currentView: "sync" | "admin";
  onViewChange: (view: "sync" | "admin") => void;
};

export function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Local browser workflow</p>
        <h1>NUSHUD Tools</h1>
      </div>
      <nav className="view-tabs" aria-label="NUSHUD tool sections">
        <button
          type="button"
          className={currentView === "sync" ? "active" : ""}
          onClick={() => onViewChange("sync")}
        >
          Sync
        </button>
        <button
          type="button"
          className={currentView === "admin" ? "active" : ""}
          onClick={() => onViewChange("admin")}
        >
          Admin
        </button>
      </nav>
    </header>
  );
}
