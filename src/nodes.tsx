import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard, Image as ImageIcon, Music, Type, Video } from "lucide-react";
import { useMemo } from "react";
import type { AudioData, ImageData, MediaRef, ScriptData, TextData, VideoData } from "./types";
import { sizeOf, useStudio, waitCloud, type StudioNode } from "./store";

function Shell({
  selected,
  wide,
  play,
  kind,
  icon,
  badge,
  title,
  onTitle,
  children,
}: {
  selected?: boolean;
  wide?: boolean;
  play?: boolean;
  kind: "text" | "image" | "video" | "audio" | "script";
  icon: React.ReactNode;
  badge?: string;
  title: string;
  onTitle?: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`card kind-${kind} ${selected ? "selected" : ""} ${wide ? "wide" : ""} ${play ? "play" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span className="ico">{icon}</span>
        {badge ? <em className="badge">{badge}</em> : null}
        <input className="nodrag" value={title} onChange={(e) => onTitle?.(e.target.value)} />
      </header>
      {children}
      <Handle type="source" position={Position.Right} className="plus-handle">
        +
      </Handle>
    </div>
  );
}

function NodeMeta({
  id,
  data,
  kind,
}: {
  id: string;
  data: ImageData | VideoData;
  kind: "image" | "video";
}) {
  const setPreview = useStudio((s) => s.setPreview);
  const catalog = useStudio((s) => s.catalog);
  const bible = useStudio((s) => s.bible);
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const extraKey = (data.extraRefs || []).map((r) => r.url).join("|");
  const live = useMemo(
    () => useStudio.getState().shotMedia(id).images,
    [id, nodes, edges, extraKey, data.prompt],
  );
  const refs: MediaRef[] = live.slice(0, kind === "video" ? 9 : 3);
  const [dw, dh] = sizeOf(bible.aspect, kind);
  const w = data.width || dw;
  const h = data.height || dh;
  const model = data.model || data.usedModel || (kind === "image" ? catalog.t2iModel : catalog.i2vModel);
  const label = [...catalog.image, ...catalog.video].find((m) => m.file === model)?.label || model.split("/").pop() || "跟随设置";
  const q = data.quality === "high" ? "清晰" : data.quality === "std" ? "标准" : data.quality === "fast" ? "快" : "";
  return (
    <div className="node-meta nodrag nowheel">
      {refs.length ? (
        <div className="ref-chips">
          {refs.map((r) => (
            <img
              key={r.url}
              src={r.url}
              alt={r.name}
              title={r.name}
              onClick={(e) => {
                e.stopPropagation();
                setPreview({ url: r.url, kind: "image", title: r.name });
              }}
            />
          ))}
        </div>
      ) : (
        <span>无参考图</span>
      )}
      <span>
        {w}×{h}
        {q ? ` · ${q}` : ""}
      </span>
      <span title={model}>{label}</span>
    </div>
  );
}

async function onUpload(files: FileList | null, apply: (url: string) => void) {
  const f = files?.[0];
  if (!f) return;
  const { uploadFiles } = await import("./api");
  const [a] = await uploadFiles([f]);
  if (a) apply(a.url);
}

export function TextNode({ id, data, selected }: NodeProps<StudioNode>) {
  const d = data as TextData;
  const updateNode = useStudio((s) => s.updateNode);
  return (
    <Shell selected={selected} play kind="text" icon={<Type size={14} />} badge="剧本" title={d.title} onTitle={(title) => updateNode(id, { title })}>
      <textarea
        className="nodrag nowheel play-body"
        value={d.body}
        placeholder="把完整剧情贴这里，然后从右边 + 拉出脚本生成器。"
        onChange={(e) => updateNode(id, { body: e.target.value })}
      />
    </Shell>
  );
}

export function ImageNode({ id, data, selected }: NodeProps<StudioNode>) {
  const d = data as ImageData;
  const updateNode = useStudio((s) => s.updateNode);
  const setPreview = useStudio((s) => s.setPreview);
  return (
    <Shell selected={selected} kind="image" icon={<ImageIcon size={14} />} title={d.title} onTitle={(title) => updateNode(id, { title })}>
      <div className="media">
        {d.url ? (
          <button
            type="button"
            className="zoom-hit nodrag nowheel"
            onClick={(e) => {
              e.stopPropagation();
              setPreview({ url: d.url, kind: "image", title: d.title });
            }}
          >
            <img src={d.url} alt="" />
          </button>
        ) : (
          <span>
            {d.status === "running"
              ? "出图中…"
              : waitCloud(d.error) || (!d.url && d.status !== "error")
                ? "待出图。选中后改参数，开机再生成"
                : d.error || "上传，或选中后在底部改参数"}
          </span>
        )}
        <label className="upload-fab nodrag" title="上传替换">
          上传
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void onUpload(e.target.files, (url) => updateNode(id, { url, status: "done" }))}
          />
        </label>
      </div>
      <NodeMeta id={id} data={d} kind="image" />
    </Shell>
  );
}

export function VideoNode({ id, data, selected }: NodeProps<StudioNode>) {
  const d = data as VideoData;
  const updateNode = useStudio((s) => s.updateNode);
  const setPreview = useStudio((s) => s.setPreview);
  return (
    <Shell selected={selected} kind="video" icon={<Video size={14} />} title={d.title} onTitle={(title) => updateNode(id, { title })}>
      <div className="media">
        {d.url ? (
          <button
            type="button"
            className="zoom-hit nodrag nowheel"
            onClick={(e) => {
              e.stopPropagation();
              setPreview({ url: d.url, kind: "video", title: d.title });
            }}
          >
            <video src={d.url} muted />
          </button>
        ) : (
          <span>
            {d.status === "running"
              ? "H3 出视频中…"
              : waitCloud(d.error) || (!d.url && d.status !== "error")
                ? "待出视频。选中后改参数，开机再生成"
                : d.error || "选中后在底部改模型、参考和尺寸"}
          </span>
        )}
        <label className="upload-fab nodrag" title="上传成片">
          上传
          <input
            type="file"
            accept="video/*"
            onChange={(e) => void onUpload(e.target.files, (url) => updateNode(id, { url, status: "done" }))}
          />
        </label>
      </div>
      <NodeMeta id={id} data={d} kind="video" />
    </Shell>
  );
}

export function AudioNode({ id, data, selected }: NodeProps<StudioNode>) {
  const d = data as AudioData;
  const updateNode = useStudio((s) => s.updateNode);
  const busy = useStudio((s) => s.busy);
  return (
    <Shell selected={selected} kind="audio" icon={<Music size={14} />} badge="配音" title={d.title} onTitle={(title) => updateNode(id, { title })}>
      <div className="media short">
        {d.url ? (
          <audio src={d.url} controls className="nodrag nowheel" />
        ) : (
          <span>
            {d.status === "running"
              ? "配音中…"
              : d.error || (d.prompt ? d.prompt : "有对白会自动铺。选中后生成，或去设置上传仿声参考")}
          </span>
        )}
        <label className="upload-fab nodrag" title="上传配音">
          上传
          <input
            className="nodrag"
            type="file"
            accept="audio/*"
            onChange={(e) => void onUpload(e.target.files, (url) => updateNode(id, { url, status: "done" }))}
          />
        </label>
      </div>
      <p className="logline">{d.voice === "clone" || !d.voice ? "仿声" : d.voice} · {d.prompt ? "有台词" : "无台词"}</p>
      {!d.url ? (
        <button
          className="run nodrag nowheel"
          type="button"
          disabled={Boolean(busy) || d.status === "running"}
          onClick={() => void useStudio.getState().generateAudio(id)}
        >
          生成配音
        </button>
      ) : null}
    </Shell>
  );
}

export function ScriptNode({ id, data, selected }: NodeProps<StudioNode>) {
  const d = data as ScriptData;
  const updateNode = useStudio((s) => s.updateNode);
  const setScriptFull = useStudio((s) => s.setScriptFull);
  const busy = useStudio((s) => s.busy);
  const shots = d.script.shots || [];
  const assets = d.assets || [];
  const pictured = assets.filter((a) => a.url).length;
  const ready = shots.filter((s) => s.imagePrompt.trim()).length;
  const running = Boolean(busy);
  return (
    <Shell selected={selected} wide kind="script" icon={<Clapperboard size={14} />} badge="脚本" title={d.title} onTitle={(title) => updateNode(id, { title })}>
      {running && !shots.length ? (
        <div className="gen-wait">
          <i />
          <p>生成中…</p>
          <small>{busy}</small>
        </div>
      ) : shots.length ? (
        <>
          <div className="mini-steps nodrag">
            <span className={(d.step || 1) === 1 ? "on" : "done"}>
              <b>1</b>确认镜头
            </span>
            <span className={(d.step || 1) === 2 ? "on" : (d.step || 1) > 2 ? "done" : ""}>
              <b>2</b>准备资产
            </span>
            <span className={(d.step || 1) === 3 ? "on" : ""}>
              <b>3</b>合成提示词
            </span>
          </div>
          <p className="logline">
            {shots.length} 镜已就绪 · 资产 {pictured}/{assets.length} · 提示词 {ready}/{shots.length}
          </p>
          <button className="ghost-btn nodrag nowheel" type="button" onClick={() => setScriptFull(id)}>
            打开脚本节点 →
          </button>
        </>
      ) : (
        <div className="gen-wait">
          <i className="lines" />
          <p>把左边剧情接进来，在节点上生成</p>
          <button
            className="run nodrag nowheel"
            type="button"
            disabled={running}
            onClick={() => void useStudio.getState().parseOrWriteScript(id)}
          >
            生成脚本
          </button>
        </div>
      )}
    </Shell>
  );
}

export const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  script: ScriptNode,
};
