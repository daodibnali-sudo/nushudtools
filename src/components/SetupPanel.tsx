import { useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SetupPanelProps = {
  onReady: (client: SupabaseClient, email: string) => void;
};

const configStorageKey = "nushudAdminConfig";

export function SetupPanel({ onReady }: SetupPanelProps) {
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Enter your Supabase link, anon key, and admin login once on this device.");

  const connectAndLogin = async () => {
    const url = supabaseUrl.trim();
    const anonKey = supabaseAnonKey.trim();

    if (!url || !anonKey || !email.trim() || !password) {
      setStatus("Fill Supabase URL, anon key, email, and password first.");
      return;
    }

    const client = createClient(url, anonKey);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setStatus(`Login failed: ${error.message}`);
      return;
    }

    const { data: adminResult, error: adminError } = await client.rpc("is_admin");

    if (adminError || adminResult !== true) {
      setStatus("Logged in, but this user is not allowed by is_admin.");
      return;
    }

    localStorage.setItem(configStorageKey, JSON.stringify({ url, anonKey }));
    setStatus("Saved. Opening the tool.");
    onReady(client, email.trim());
  };

  return (
    <section className="panel setup-panel">
      <div className="panel-heading">
        <h2>One-time Login</h2>
        <p>This browser remembers the session</p>
      </div>
      <div className="field-grid two-column">
        <label>
          Supabase URL
          <input
            type="url"
            value={supabaseUrl}
            onChange={(event) => setSupabaseUrl(event.target.value)}
            placeholder="https://your-project.supabase.co"
          />
        </label>
        <label>
          Supabase anon key
          <input
            type="password"
            value={supabaseAnonKey}
            onChange={(event) => setSupabaseAnonKey(event.target.value)}
            placeholder="ey..."
          />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
      </div>
      <div className="button-row admin-actions">
        <button type="button" className="primary-button" onClick={connectAndLogin}>
          Login and remember
        </button>
      </div>
      <p className="status-text">{status}</p>
    </section>
  );
}
