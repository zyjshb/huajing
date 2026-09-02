import { useEffect, useMemo, useState } from "react";
import { LlmPicker } from "./LlmPicker";
import { ModelSelect, SizeFields } from "./Generator";
import { sizeOf, useStudio } from "./store";
import type { Asset, AssetKind, GenQuality, ScriptData, Shot } from "./types";
import { spokenLine } from "./types";

const KIND_LABEL: Record<AssetKind, string> = { character: "角色", scene: "场景", prop: "道具" };

export function BatchSheet() {
  const sheet = useStudio((s) => s.sheet);
  const node = useStudio((s) => (sheet ? s.nodes.find((n) => n.id === sheet.scriptId) : undefined));
  const catalog = useStudio((s) => s.catalog);
  const bible = useStudio((s) => s.bible);
  const busy = useStudio((s) => s.busy);
  const close = () => useStudio.getState().setSheet(null);

  useEffect(() => {
    void useStudio.getState().loadCatalog();
  }, [sheet?.kind]);

  if (!sheet || !node || node.data.kind !== "script") return null;
  const d = node.data as ScriptData;

  if (sheet.kind === "assets") return <AssetSheet id={sheet.scriptId} data={d} catalogModel={catalog.t2iModel} onClose={close} busy={busy} />;
  if (sheet.kind === "prompts") return <PromptSheet id={sheet.scriptId} data={d} onClose={close} busy={busy} />;
  if (sheet.kind === "audios") return <AudioSheet id={sheet.scriptId} data={d} onClose={close} busy={busy} />;
  if (sheet.kind === "boards") {
    return (
      <ShotSheet
        id={sheet.scriptId}
        data={d}
        title="分镜批量生图"
        hint="会优先使用已准备的角色、场景、道具图当参考，让分镜贴上资产。"
        confirm={(n) => `确认并创建生成器组 (${n})`}
        kind="image"
        defaultModel={catalog.t2iModel}
        aspect={bible.aspect}
        onClose={close}
        busy={busy}
        onConfirm={(ids, p) => {
          close();
          useStudio.getState().setScriptFull("");
          void useStudio.getState().generateBoards(sheet.scriptId, { ...p, ids });
        }}
      />
    );
  }
  return (
    <ShotSheet
      id={sheet.scriptId}
      data={d}
      title="批量生视频"
      hint="优先用分镜图 + 资产图当 MiniMax H3 多模态参考。先点「针对 MiniMax H3 优化」再出视频会更稳。擎天柱成片一律 6 秒、16:9。"
      confirm={(n) => `确认并创建视频生成器组 (${n})`}
      kind="video"
      defaultModel={catalog.i2vModel}
      aspect={bible.aspect}
      onClose={close}
      busy={busy}
      showMotion
      onConfirm={(ids, p) => {
        close();
        useStudio.getState().setScriptFull("");
        void useStudio.getState().generateVideos(sheet.scriptId, { ...p, ids });
      }}
    />
  );
}

function AssetSheet({
  id,
  data,
  catalogModel,
  onClose,
  busy,
}: {
  id: string;
  data: ScriptData;
  catalogModel: string;
  onClose: () => void;
  busy: string;
}) {
  const assets = data.assets || [];
  const [picked, setPicked] = useState<string[]>(() => assets.filter((a) => !/库伦/.test(a.name) && !a.url).map((a) => a.id));
  const [model, setModel] = useState("");
  const [quality, setQuality] = useState<GenQuality>("std");
  const [dw, dh] = sizeOf(useStudio.getState().bible.aspect, "image");
  const [width, setWidth] = useState(dw);
  const [height, setHeight] = useState(dh);
  const groups = (["character", "scene", "prop"] as AssetKind[])
    .map((kind) => ({ kind, items: assets.filter((a) => a.kind === kind) }))
    .filter((g) => g.items.length);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="batch-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>一键生成所有资产</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="batch-list">
          {groups.map((g) => (
            <section key={g.kind}>
              <h3>
                {KIND_LABEL[g.kind]} ({g.items.length})
              </h3>
              {g.items.map((a) => (
                <AssetRow key={a.id} asset={a} checked={picked.includes(a.id)} onToggle={(on) => setPicked(on ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />
              ))}
            </section>
          ))}
        </div>
        <footer className="batch-bar">
          <label className="check">
            <input
              type="checkbox"
              checked={picked.length === assets.filter((a) => !/库伦/.test(a.name)).length && picked.length > 0}
              onChange={(e) =>
                setPicked(e.target.checked ? assets.filter((a) => !/库伦/.test(a.name)).map((a) => a.id) : [])
              }
            />
            已选 {picked.length}/{assets.length}
          </label>
          <ModelSelect kind="image" value={model} onChange={setModel} />
          <select value={quality} onChange={(e) => setQuality(e.target.value as GenQuality)}>
            <option value="fast">快</option>
            <option value="std">标准画质</option>
            <option value="high">清晰</option>
          </select>
          <SizeFields kind="image" width={width} height={height} onChange={(p) => { if (p.width) setWidth(p.width); if (p.height) setHeight(p.height); }} />
          <button
            type="button"
            className="primary"
            disabled={!!busy || !picked.length}
            onClick={() => {
              onClose();
              void useStudio.getState().generateAllAssets(id, { ids: picked, model: model || catalogModel, quality, width, height });
            }}
          >
            生成({picked.length})
          </button>
        </footer>
      </div>
    </div>
  );
}

function AssetRow({ asset, checked, onToggle }: { asset: Asset; checked: boolean; onToggle: (on: boolean) => void }) {
  const locked = /库伦/.test(asset.name);
  return (
    <label className={`batch-row ${locked ? "locked" : ""}`}>
      <input type="checkbox" checked={checked && !locked} disabled={locked} onChange={(e) => onToggle(e.target.checked)} />
      <div>
        <b>
          {asset.name} <em>{KIND_LABEL[asset.kind]}</em>
        </b>
        <p>{locked ? "库伦正脸只许上传真照片，不能生成。" : asset.prompt || "还没有描述"}</p>
      </div>
    </label>
  );
}

function AudioSheet({ id, data, onClose, busy }: { id: string; data: ScriptData; onClose: () => void; busy: string }) {
  const shots = (data.script.shots || []).filter((s) => spokenLine(s.dialogue));
  const [picked, setPicked] = useState<string[]>(() => shots.map((s) => s.id));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="batch-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>有台词的镜头 · 配音</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="hint">会给每条对白铺一个配音节点。仿声用设置里的参考音频：本机 GPT-SoVITS / IndexTTS，或云端千问、MiniMax。</p>
        <div className="batch-list">
          {shots.map((s) => (
            <label key={s.id} className="batch-row">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
              <div>
                <b>镜头 {s.id}</b>
                <p>{spokenLine(s.dialogue)}</p>
              </div>
            </label>
          ))}
        </div>
        <footer className="batch-bar">
          <label className="check">
            <input type="checkbox" checked={picked.length === shots.length} onChange={(e) => setPicked(e.target.checked ? shots.map((s) => s.id) : [])} />
            已选 {picked.length}/{shots.length}
          </label>
          <button
            type="button"
            className="primary"
            disabled={!!busy || !picked.length}
            onClick={() => {
              onClose();
              useStudio.getState().setScriptFull("");
              void useStudio.getState().generateAudios(id, { ids: picked });
            }}
          >
            铺节点并生成 ({picked.length})
          </button>
        </footer>
      </div>
    </div>
  );
}

function PromptSheet({ id, data, onClose, busy }: { id: string; data: ScriptData; onClose: () => void; busy: string }) {
  const shots = data.script.shots || [];
  const [picked, setPicked] = useState<string[]>(() => shots.map((s) => s.id));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="batch-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>合成最终提示词</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="hint">提示词会自动用 @角色 @场景 @道具 引用前面准备好的资产。用下面的大模型来写，也可以随时去设置里换。</p>
        <LlmPicker />
        <div className="batch-list">
          {shots.map((s) => (
            <label key={s.id} className="batch-row">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
              <div>
                <b>镜头 {s.id}</b>
                <p>{s.imagePrompt || s.action}</p>
              </div>
            </label>
          ))}
        </div>
        <footer className="batch-bar">
          <label className="check">
            <input type="checkbox" checked={picked.length === shots.length} onChange={(e) => setPicked(e.target.checked ? shots.map((s) => s.id) : [])} />
            全选镜头 已选 {picked.length}/{shots.length}
          </label>
          <button
            type="button"
            className="primary"
            disabled={!!busy || !picked.length}
            onClick={() => {
              onClose();
              void useStudio.getState().synthesizePrompts(id, picked);
            }}
          >
            确认生成
          </button>
        </footer>
      </div>
    </div>
  );
}

function ShotSheet({
  data,
  title,
  hint,
  confirm,
  kind,
  defaultModel,
  aspect,
  onClose,
  busy,
  showMotion,
  onConfirm,
}: {
  id: string;
  data: ScriptData;
  title: string;
  hint: string;
  confirm: (n: number) => string;
  kind: "image" | "video";
  defaultModel: string;
  aspect: "16:9" | "9:16" | "1:1";
  onClose: () => void;
  busy: string;
  showMotion?: boolean;
  onConfirm: (ids: string[], p: { model?: string; quality?: GenQuality; width?: number; height?: number }) => void;
}) {
  const shots = data.script.shots || [];
  const [picked, setPicked] = useState<string[]>(() => shots.map((s) => s.id));
  const [model, setModel] = useState("");
  const [quality, setQuality] = useState<GenQuality>(kind === "video" ? "std" : "std");
  const [dw, dh] = sizeOf(aspect, kind);
  const [width, setWidth] = useState(dw);
  const [height, setHeight] = useState(dh);
  const patchShot = useStudio((s) => s.patchShot);
  const scriptId = useStudio((s) => s.sheet?.scriptId || "");

  const list = useMemo(() => shots, [shots]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="batch-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="hint">{hint}</p>
        <div className="batch-list">
          {list.map((s) => (
            <ShotRow
              key={s.id}
              shot={s}
              checked={picked.includes(s.id)}
              motion={showMotion}
              onToggle={(on) => setPicked(on ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
              onDuration={(duration) => patchShot(scriptId, s.id, { duration })}
            />
          ))}
        </div>
        <footer className="batch-bar">
          <label className="check">
            <input type="checkbox" checked={picked.length === shots.length} onChange={(e) => setPicked(e.target.checked ? shots.map((s) => s.id) : [])} />
            已选 {picked.length}/{shots.length}
          </label>
          <ModelSelect kind={kind} value={model} onChange={setModel} />
          <select value={quality} onChange={(e) => setQuality(e.target.value as GenQuality)}>
            <option value="fast">快</option>
            <option value="std">标准画质</option>
            <option value="high">清晰</option>
          </select>
          <SizeFields kind={kind} width={width} height={height} onChange={(p) => { if (p.width) setWidth(p.width); if (p.height) setHeight(p.height); }} />
          {kind === "video" ? (
            <button
              type="button"
              disabled={!!busy || !picked.length}
              onClick={() => void useStudio.getState().optimizeH3(scriptId, picked)}
            >
              针对 MiniMax H3 优化
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            disabled={!!busy || !picked.length}
            onClick={() => onConfirm(picked, { model: model || defaultModel, quality, width, height })}
          >
            {confirm(picked.length)}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ShotRow({
  shot,
  checked,
  motion,
  onToggle,
  onDuration,
}: {
  shot: Shot;
  checked: boolean;
  motion?: boolean;
  onToggle: (on: boolean) => void;
  onDuration: (n: number) => void;
}) {
  return (
    <label className="batch-row">
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      <div>
        <b>镜头 {shot.id}</b>
        {motion ? (
          <>
            <p>
              <em>起始</em> {shot.imagePrompt || shot.action}
            </p>
            <p>
              <em>动作</em> {shot.videoPrompt || shot.camera || shot.action}
            </p>
          </>
        ) : (
          <p>{shot.imagePrompt || shot.action}</p>
        )}
      </div>
      {motion ? (
        <span className="dur" onClick={(e) => e.preventDefault()}>
          <input type="number" min={1} max={15} value={shot.duration} onChange={(e) => onDuration(Number(e.target.value) || 6)} />
          s
        </span>
      ) : null}
    </label>
  );
}
