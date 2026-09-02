import { History, Trash2 } from "lucide-react";
import { useStudio } from "./store";

function when(ts: number) {
  try {
    return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function HistoryPanel() {
  const open = useStudio((s) => s.historyOpen);
  const items = useStudio((s) => s.history);
  const canvasId = useStudio((s) => s.canvasId);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={() => useStudio.getState().setHistoryOpen(false)}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>History</h2>
          <button type="button" className="ghost" onClick={() => useStudio.getState().setHistoryOpen(false)}>
            Close
          </button>
        </header>
        <p className="hint">Every visit starts on a blank canvas. Open a past project here to continue.</p>
        {items.length ? (
          <ul>
            {items.map((it) => (
              <li key={it.id} className={it.id === canvasId ? "on" : ""}>
                <button type="button" className="hist-open" onClick={() => void useStudio.getState().openCanvas(it.id)}>
                  <b>{it.title || "Untitled"}</b>
                  <span>
                    {it.nodes} nodes · {when(it.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost hist-del"
                  title="Delete"
                  onClick={() => {
                    if (!window.confirm(`Delete “${it.title || "Untitled"}”? This cannot be undone.`)) return;
                    void useStudio.getState().deleteHistory(it.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hist-empty">No history yet. Start from a script, then click New — the last canvas shows up here.</p>
        )}
      </div>
    </div>
  );
}

export function HistoryButton() {
  const n = useStudio((s) => s.history.length);
  return (
    <button type="button" className="ghost" onClick={() => useStudio.getState().setHistoryOpen(true)}>
      <History size={16} />
      History{n ? ` ${n}` : ""}
    </button>
  );
}
