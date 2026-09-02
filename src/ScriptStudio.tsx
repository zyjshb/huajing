import { useEffect, useMemo, useState } from "react";
import { LlmPicker } from "./LlmPicker";
import { ModelSelect, SizeFields } from "./Generator";
import { matchAllShots } from "./matchAssets";
import { useStudio } from "./store";
import type { Asset, AssetKind, GenQuality, ScriptData, Shot } from "./types";

const SCALES = ["特写", "近景", "中近景", "中景", "全身景", "全景", "大远景", "过肩"];
const kinds: { kind: AssetKind; label: string }[] = [
  { kind: "character", label: "角色" },
  { kind: "scene", label: "场景" },
  { kind: "prop", label: "道具" },
];

export function ScriptStudio({ id }: { id: string }) {
  const node = useStudio((s) => s.nodes.find((n) => n.id === id));
  const busy = useStudio((s) => s.busy);
  const setScriptFull = useStudio((s) => s.setScriptFull);
  const setScriptStep = useStudio((s) => s.setScriptStep);
  const patchShot = useStudio((s) => s.patchShot);
  const addShot = useStudio((s) => s.addShot);
  const patchAsset = useStudio((s) => s.patchAsset);
  const addAsset = useStudio((s) => s.addAsset);
  const removeAsset = useStudio((s) => s.removeAsset);
  const updateNode = useStudio((s) => s.updateNode);
  const [editId, setEditId] = useState("");
  const [promptShot, setPromptShot] = useState<Shot | null>(null);

  useEffect(() => {
    void useStudio.getState().loadCatalog();
  }, []);

  if (!node || node.data.kind !== "script") return null;
  const d = node.data as ScriptData;
  const shots = d.script.shots || [];
  const assets = d.assets || [];
  const names = assets.map((a) => a.name).filter(Boolean);
  const matched = matchAllShots(d);
  const ready = shots.filter((s) => s.imagePrompt.trim()).length;
  const pictured = assets.filter((a) => a.url).length;
  const step = d.step || 1;
  const editing = assets.find((a) => a.id === editId);

  return (
    <div className="script-studio">
      <header className="studio-head">
        <button type="button" className="ghost" onClick={() => setScriptFull("")}>
          ← 返回画布
        </button>
        <ol className="steps">
          <li className={step === 1 ? "on" : shots.length ? "done" : ""}>
            <button type="button" onClick={() => shots.length && setScriptStep(id, 1)}>
              <b>{shots.length ? "✓" : "1"}</b>
              <span>
                确认镜头
                <small>{shots.length ? `${shots.length} 个镜头已就绪` : "待拆解"}</small>
              </span>
            </button>
          </li>
          <li className={step === 2 ? "on" : step > 2 ? "done" : ""}>
            <button type="button" onClick={() => shots.length && setScriptStep(id, 2)}>
              <b>{step > 2 ? "✓" : "2"}</b>
              <span>
                准备资产
                <small>{assets.length ? `${pictured}/${assets.length} 已生成` : "0"}</small>
              </span>
            </button>
          </li>
          <li className={step === 3 ? "on" : d.promptsReady ? "done" : ""}>
            <button type="button" onClick={() => shots.length && setScriptStep(id, 3)}>
              <b>{d.promptsReady ? "✓" : "3"}</b>
              <span>
                合成提示词
                <small>
                  {ready}/{shots.length || 0} 已合成
                </small>
              </span>
            </button>
          </li>
        </ol>
        <em className="step-note">{d.promptsReady ? "2/3 完成后可生成分镜" : "合成提示词后才能出镜头"}</em>
        <LlmPicker />
        <button type="button" className="ghost" onClick={() => useStudio.getState().setSettingsOpen(true)}>
          设置
        </button>
      </header>

      {step === 1 ? (
        <>
          <ShotTable
            shots={shots}
            names={names}
            matched={matched}
            promptMode="pending"
            onPatch={(sid, patch) => patchShot(id, sid, patch)}
            onOpenPrompt={setPromptShot}
          />
          <footer className="studio-foot">
            <button type="button" onClick={() => addShot(id)}>
              + 添加镜头
            </button>
            <button type="button" className="primary" disabled={!shots.length} onClick={() => setScriptStep(id, 2)}>
              下一步：准备资产 →
            </button>
          </footer>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className={`asset-stage ${editing ? "with-edit" : ""}`}>
            <section>
              <h3>全局风格</h3>
              <textarea
                className="style-box"
                value={d.globalStyle}
                placeholder="全片画风、色调、媒介。"
                onChange={(e) => updateNode(id, { globalStyle: e.target.value })}
              />
            </section>
            {kinds.map((row) => (
              <section key={row.kind}>
                <h3>{row.label}</h3>
                <div className="asset-row">
                  {assets
                    .filter((a) => a.kind === row.kind)
                    .map((a) => (
                      <AssetCard key={a.id} asset={a} active={editId === a.id} onPick={() => setEditId(a.id)} />
                    ))}
                  <button type="button" className="asset-add" onClick={() => addAsset(id, row.kind)}>
                    + 新增
                  </button>
                </div>
              </section>
            ))}
          </div>
          {editing ? (
            <aside className="asset-edit">
              <h3>编辑{kinds.find((k) => k.kind === editing.kind)?.label}</h3>
              <div className="asset-slot">
                {editing.url ? (
                  <button
                    type="button"
                    className="zoom-hit"
                    onClick={() => useStudio.getState().setPreview({ url: editing.url, kind: "image", title: editing.name })}
                  >
                    <img src={editing.url} alt="" />
                  </button>
                ) : (
                  <span>生成或上传{kinds.find((k) => k.kind === editing.kind)?.label}图</span>
                )}
                <label className="upload-fab">
                  上传
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      if (!e.target.files?.length) return;
                      const { uploadFiles } = await import("./api");
                      const [up] = await uploadFiles(e.target.files);
                      if (up) patchAsset(id, editing.id, { url: up.url, status: "done" });
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <label>
                名称
                <input value={editing.name} onChange={(e) => patchAsset(id, editing.id, { name: e.target.value })} />
              </label>
              <label>
                描述
                <textarea value={editing.prompt} onChange={(e) => patchAsset(id, editing.id, { prompt: e.target.value })} />
              </label>
              <p className="hint">模型和尺寸在下面改。选「跟随设置」则用右上角设置里的默认出图模型。</p>
              <div className="gen-row">
                <ModelSelect kind="image" value={editing.model || ""} onChange={(model) => patchAsset(id, editing.id, { model })} />
                <select
                  value={editing.quality || "fast"}
                  onChange={(e) => patchAsset(id, editing.id, { quality: e.target.value as GenQuality })}
                >
                  <option value="fast">快</option>
                  <option value="std">标准</option>
                  <option value="high">清晰</option>
                </select>
              </div>
              <SizeFields
                kind="image"
                width={editing.width}
                height={editing.height}
                onChange={(p) => patchAsset(id, editing.id, p)}
              />
              <p className="hint">库伦正脸请上传真照片。其他资产可生成：有参考图会走 Qwen 多图参考（最多 3 张）。H3 出视频会把这些图一起当多模态参考。</p>
              <div className="row">
                <button type="button" disabled={!!busy} onClick={() => void useStudio.getState().generateAsset(id, editing.id)}>
                  {editing.status === "running" ? "生成中…" : "生成此资产"}
                </button>
                <button type="button" className="danger" onClick={() => { removeAsset(id, editing.id); setEditId(""); }}>
                  删除
                </button>
              </div>
            </aside>
          ) : null}
          <footer className="studio-foot">
            <span className="hint">
              检出 {assets.filter((a) => a.kind === "character").length} 个角色、
              {assets.filter((a) => a.kind === "scene").length} 个场景、
              {assets.filter((a) => a.kind === "prop").length} 个道具。可上传或批量生成。
            </span>
            <div className="foot-actions">
              <button type="button" onClick={() => setScriptStep(id, 1)}>
                ← 确认镜头
              </button>
              <button type="button" disabled={!!busy} onClick={() => useStudio.getState().setSheet({ kind: "assets", scriptId: id })}>
                一键生成所有资产
              </button>
              <button type="button" className="primary" onClick={() => setScriptStep(id, 3)}>
                下一步：合成提示词 →
              </button>
            </div>
          </footer>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <ShotTable
            shots={shots}
            names={names}
            matched={matched}
            promptMode="final"
            busy={Boolean(busy)}
            onPatch={(sid, patch) => patchShot(id, sid, patch)}
            onOpenPrompt={setPromptShot}
          />
          <footer className="studio-foot">
            <button type="button" onClick={() => setScriptStep(id, 2)}>
              ← 准备资产
            </button>
            <div className="foot-actions">
              <button type="button" className="primary" disabled={!!busy} onClick={() => useStudio.getState().setSheet({ kind: "prompts", scriptId: id })}>
                一键合成全部提示词
              </button>
              {d.promptsReady ? (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void useStudio.getState().optimizeH3(id)}
                  >
                    针对 MiniMax H3 优化
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => useStudio.getState().armBatch(id, "boards")}
                  >
                    完成，去生成分镜
                  </button>
                  <button type="button" onClick={() => useStudio.getState().armBatch(id, "audios")}>
                    铺有台词的配音
                  </button>
                </>
              ) : null}
            </div>
          </footer>
        </>
      ) : null}

      {promptShot ? (
        <PromptModal
          shot={promptShot}
          style={d.globalStyle}
          onClose={() => setPromptShot(null)}
          onChange={(patch) => patchShot(id, promptShot.id, patch)}
        />
      ) : null}
    </div>
  );
}

function ShotTable({
  shots,
  names,
  matched,
  busy,
  onPatch,
  onOpenPrompt,
}: {
  shots: Shot[];
  names: string[];
  matched: ReturnType<typeof matchAllShots>;
  promptMode?: "pending" | "final";
  busy?: boolean;
  onPatch: (id: string, patch: Partial<Shot>) => void;
  onOpenPrompt: (s: Shot) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="shot-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>时长</th>
            <th>画面描述</th>
            <th>景别</th>
            <th>光影氛围</th>
            <th>对话/旁白</th>
            <th>音效</th>
            <th>运镜</th>
            <th>最终提示词</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shots.map((s) => (
            <tr key={s.id}>
              <td className="num">{s.id}</td>
              <td className="dur-cell">
                <input type="number" min={1} max={15} value={s.duration} onChange={(e) => onPatch(s.id, { duration: Number(e.target.value) || 6 })} />
                <span>s</span>
              </td>
              <td>
                <EditCell value={s.action} names={names} onChange={(action) => onPatch(s.id, { action })} />
                <div className="match-chips">
                  {(matched.get(s.id) || []).map((r) => (
                    <span key={r.name} title={r.why}>
                      @{r.name}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <select value={s.shotScale} onChange={(e) => onPatch(s.id, { shotScale: e.target.value })}>
                  <option value="">景别</option>
                  {s.shotScale && !SCALES.includes(s.shotScale) ? <option value={s.shotScale}>{s.shotScale}</option> : null}
                  {SCALES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <EditCell value={s.lighting} onChange={(lighting) => onPatch(s.id, { lighting })} />
              </td>
              <td>
                <EditCell value={s.dialogue} names={names} onChange={(dialogue) => onPatch(s.id, { dialogue })} />
              </td>
              <td>
                <EditCell value={s.sfx} onChange={(sfx) => onPatch(s.id, { sfx })} />
              </td>
              <td>
                <EditCell value={s.camera} onChange={(camera) => onPatch(s.id, { camera })} />
              </td>
              <td>
                {s.imagePrompt ? (
                  <button type="button" className="link" onClick={() => onOpenPrompt(s)}>
                    查看提示词
                  </button>
                ) : busy ? (
                  <span className="muted">合成中…</span>
                ) : (
                  <span className="muted">待生成提示词</span>
                )}
              </td>
              <td>
                <button type="button" className="ghost" onClick={() => onOpenPrompt(s)} title="详情">
                  ···
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditCell({ value, names = [], onChange }: { value: string; names?: string[]; onChange: (v: string) => void }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setOn(false)}
      />
    );
  }
  return (
    <div className="cell" onClick={() => setOn(true)}>
      {value ? <Highlight text={value} names={names} /> : <span className="muted">点击编辑</span>}
    </div>
  );
}

function Highlight({ text, names }: { text: string; names: string[] }) {
  const list = names.filter(Boolean).sort((a, b) => b.length - a.length);
  const tokens = [...list.map((n) => `@${n}`), ...list];
  const re = tokens.length
    ? new RegExp(`(${tokens.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|@[\\u4e00-\\u9fffA-Za-z0-9_]+)`)
    : /(@[\u4e00-\u9fffA-Za-z0-9_]+)/;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const tagged = p.startsWith("@") || list.includes(p);
        return tagged ? (
          <em key={i} className="ent">
            {p.startsWith("@") ? p : `@${p}`}
          </em>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function AssetCard({ asset, active, onPick }: { asset: Asset; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`asset-card kind-${asset.kind} ${active ? "on" : ""}`}
      onClick={onPick}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (asset.url) useStudio.getState().setPreview({ url: asset.url, kind: "image", title: asset.name });
      }}
    >
      <div className="asset-thumb">
        {asset.url ? <img src={asset.url} alt="" /> : <span>{asset.status === "running" ? "生成中…" : "生成或上传"}</span>}
      </div>
      <b>{asset.name}</b>
      <p>{asset.prompt}</p>
    </button>
  );
}

function PromptModal({
  shot,
  style,
  onClose,
  onChange,
}: {
  shot: Shot;
  style: string;
  onClose: () => void;
  onChange: (p: Partial<Shot>) => void;
}) {
  const live = useStudio((s) => {
    for (const n of s.nodes) {
      if (n.data.kind !== "script") continue;
      const hit = n.data.script.shots.find((x) => x.id === shot.id);
      if (hit) return hit;
    }
    return shot;
  });
  const title = useMemo(() => `第 ${Number(live.id)} 镜：最终提示词`, [live.id]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal prompt-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <label>
          分镜提示词
          <textarea value={live.imagePrompt} onChange={(e) => onChange({ imagePrompt: e.target.value })} />
        </label>
        <label>
          视频运动提示词
          <textarea value={live.videoPrompt} onChange={(e) => onChange({ videoPrompt: e.target.value })} />
        </label>
        {style ? <p className="hint">全局风格：{style}</p> : null}
        <footer>
          <button
            type="button"
            onClick={() => {
              const script = useStudio.getState().nodes.find((n) => n.data.kind === "script" && n.data.script.shots.some((s) => s.id === live.id));
              if (script) void useStudio.getState().optimizeH3(script.id, [live.id]);
            }}
          >
            按 H3 优化本镜
          </button>
          <button type="button" className="primary" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
