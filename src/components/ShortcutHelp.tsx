const shortcuts = [
  ["Enter", "Mark current line end"],
  ["S", "Mark first line start"],
  ["Backspace", "Undo last timestamp"],
  ["Space", "Play or pause"],
  ["ArrowLeft / ArrowRight", "Seek 1 second"],
  ["Shift + Arrows", "Seek 5 seconds"],
];

export function ShortcutHelp() {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Keyboard Shortcuts</h2>
        <p>Active during sync mode only</p>
      </div>
      <div className="shortcut-grid">
        {shortcuts.map(([key, label]) => (
          <div className="shortcut" key={key}>
            <kbd>{key}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
