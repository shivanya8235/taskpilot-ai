
import { useState } from "react";
import {
  Bot, Play, CheckCircle2, Circle, AlertCircle,
  FileText, ShieldCheck, Activity, LoaderCircle
} from "lucide-react";
import "./App.css";

type LogEntry = {
  time: string;
  message: string;
  status: string;
  details?: unknown;
};

type TaskResult = {
  task_id?: string;
  task: string;
  status: string;
  summary: string;
  logs: LogEntry[];
  write_allowed?: boolean;
  tool_calls?: number;
  verification?: "passed" | "failed" | "not_required";
  evidence?: {
    source_file: string;
    verified_fields: string[];
    saved_record: Record<string, unknown>;
  } | null;
};

const API = "http://localhost:8080";

const examples = [
  "Find the latest invoice from Acme Corp, extract the amount and due date, enter it into our internal system, and verify completion.",
];

function App() {
  const [task, setTask] = useState(examples[0]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState("");

  async function runTask() {
    if (!task.trim() || running) return;

    setRunning(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch(`${API}/api/agent/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        if (payload.data) setResult(payload.data);
        throw new Error(payload.error || "Task execution failed.");
      }

      setResult(payload.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Check that the backend is running on port 8080.`
          : "Could not connect to TaskPilot."
      );
    } finally {
      setRunning(false);
    }
  }

  const completed = result?.status === "completed";
  const failed = result?.status === "failed";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Bot size={25} /></div>
          <div>
            <strong>TaskPilot AI</strong>
            <span>Autonomous task worker</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active"><Activity size={18} /> Task execution</div>
        <div className="nav-item"><FileText size={18} /> Tool activity</div>
        <div className="nav-item"><ShieldCheck size={18} /> Verification</div>

        <div className="sidebar-bottom">
          <span className="status-dot" />
          Local development environment
          <small>Demo workspace · localhost</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">AUTOMATION WORKSPACE</div>
            <h1>Task execution</h1>
          </div>
          <div className="connection"><span className="status-dot" /> Local API</div>
        </header>

        <section className="welcome">
          <div className="welcome-icon"><Bot size={30} /></div>
          <div>
            <h2>What should I get done?</h2>
            <p>Describe your goal. TaskPilot will execute supported actions and check the result.</p>
          </div>
        </section>

        <section className="task-card">
          <label htmlFor="task">TASK INSTRUCTIONS</label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the outcome you want..."
            rows={4}
            disabled={running}
          />
          <div className="task-footer">
            <span>Supported workflow: invoice processing</span>
            <button onClick={runTask} disabled={running || !task.trim()}>
              {running
                ? <><LoaderCircle className="spin" size={17} /> Executing...</>
                : <><Play size={17} /> Run task</>}
            </button>
          </div>
        </section>

        {error && (
          <div className="error-box">
            <AlertCircle size={20} />
            <div><strong>Execution issue</strong><p>{error}</p></div>
          </div>
        )}

        <section className="section">
          <div className="section-heading">
            <div><h3>Execution trace</h3><p>Actions and observations returned by the backend</p></div>
            {result && (
              <span className={`pill ${completed ? "green" : failed ? "red" : ""}`}>
                {result.status}
              </span>
            )}
          </div>

          {!result && !running && (
            <div className="empty-state">
              <Activity size={27} />
              <strong>No execution yet</strong>
              <p>Run the invoice task to inspect the execution trace.</p>
            </div>
          )}

          {running && (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <strong>Task is executing</strong>
              <p>The backend is processing your request. The trace will appear when it returns.</p>
            </div>
          )}

          {result && (
            <div className="timeline">
              {result.logs?.map((log, index) => (
                <div className="timeline-item" key={`${log.time}-${index}`}>
                  <div className={`timeline-icon ${log.status}`}>
                    {log.status === "success"
                      ? <CheckCircle2 size={17} />
                      : log.status === "error"
                        ? <AlertCircle size={17} />
                        : <Circle size={15} />}
                  </div>
                  <div className="timeline-content">
                    <div className="log-message">{log.message}</div>
                    <div className="log-meta">
                      {new Date(log.time).toLocaleTimeString()} · {log.status}
                    </div>
                    {log.details && (
                      <pre className="details">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {result && (
          <section className="section">
            <div className="section-heading">
              <div><h3>Outcome & verification</h3><p>Result returned by the execution engine</p></div>
              <ShieldCheck size={22} />
            </div>

            <div className={`result-card ${completed ? "result-success" : "result-failed"}`}>
              <div className="result-title">
                {completed ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
              <strong>
  {!completed
    ? "Task did not complete"
    : result.verification === "passed"
      ? "Task verified"
      : result.verification === "failed"
        ? "Verification failed"
        : result.summary.toLowerCase().includes("duplicate")
          ? "Duplicate prevented"
          : "Task completed"}
</strong>
              </div>
              <p>{result.summary}</p>
              {result.evidence && (
                <>
                  <div className="evidence-label">SOURCE FILE</div>
                  <code>{result.evidence.source_file}</code>
                 {result.evidence.verified_fields.length > 0 && (
  <>
    <div className="evidence-label">VERIFIED FIELDS</div>
    <div className="field-list">
      {result.evidence.verified_fields.map((field) => (
        <span key={field}>
          <CheckCircle2 size={14} /> {field}
        </span>
      ))}
    </div>
  </>
)}
                  <details>
                    <summary>View saved record evidence</summary>
                    <pre className="details">
                      {JSON.stringify(result.evidence.saved_record, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </div>
          </section>
        )}

        <footer>TaskPilot AI · Prototype · Local demo environment</footer>
      </main>
    </div>
  );
}

export default App;
