import { History, Trash2 } from "lucide-react";
import { useStudio } from "./store";

function when(ts: number) {
  try {
    return new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
          <h2>历史画布</h2>
          <button type="button" className="ghost" onClick={() => useStudio.getState().setHistoryOpen(false)}>
            关闭
          </button>
        </header>
        <p className="hint">每次进来都是空白画布。以前的项目都在这里，点开继续做。</p>
        {items.length ? (
          <ul>
            {items.map((it) => (
              <li key={it.id} className={it.id === canvasId ? "on" : ""}>
                <button type="button" className="hist-open" onClick={() => void useStudio.getState().openCanvas(it.id)}>
                  <b>{it.title || "未命名画布"}</b>
                  <span>
                    {it.nodes} 个节点 · {when(it.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost hist-del"
                  title="删除"
                  onClick={() => {
                    if (!window.confirm(`删除「${it.title || "未命名画布"}」？删掉就不能恢复。`)) return;
                    void useStudio.getState().deleteHistory(it.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hist-empty">还没有历史。从一份剧本开始后，再点新建，上一份就会出现在这里。</p>
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
      历史画布{n ? ` ${n}` : ""}
    </button>
  );
}
