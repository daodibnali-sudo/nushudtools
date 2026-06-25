import type { ValidationMessage } from "../types";

type ValidationPanelProps = {
  messages: ValidationMessage[];
};

export function ValidationPanel({ messages }: ValidationPanelProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>File Validation</h2>
        <p>Readiness checks before syncing</p>
      </div>
      <div className="message-list">
        {messages.map((message) => (
          <div className={`message ${message.type}`} key={message.id}>
            {message.text}
          </div>
        ))}
      </div>
    </section>
  );
}
