import { ArrowUp, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isPlaceholderAsset } from "./matchAssets";
import { TTS_PRESETS } from "./models";
import { sizeOf, useStudio } from "./store";
import type { Asset, AssetKind, AudioData, GenQuality, ImageData, ScriptData, VideoData } from "./types";

const LIB: { kind: AssetKind; label: string }[] = [
  { kind: "character", label: "角色库" },
  { kind: "scene", label: "场景库" },
  { kind: "prop", label: "素材库" },
];

function scriptFor(id: string): ScriptData | undefined {
  const { nodes, edges } = useStudio.getState();
  const self = nodes.find((n) => n.id === id);
  const via = edges
    .filter((e) => e.target === id || e.source === id)
    .map((e) => nodes.find((n) => n.id === (e.target === id ? e.source : e.target)))
    .find((n) => n?.data.kind === "script");
  if (via?.data.kind === "script") return via.data;
  const shotId = self?.data.kind === "image" || self?.data.kind === "video" ? self.data.shotId : undefined;
  const hit = nodes.find((n) => n.data.kind === "script" && (!shotId || n.data.script.shots.some((s) => s.id === shotId)));
  return hit?.data.kind === "script" ? hit.data : undefined;
}

function MediaBar({
  id,
  kind,
}: {
  id: string;
  kind: "image" | "video";
}) {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const setPreview = useStudio((s) => s.setPreview);
  const extraUrls = useMemo(() => {
    const n = nodes.find((x) => x.id === id);
    if (!n || (n.data.kind !== "image" && n.data.kind !== "video")) return new Set<string>();
    return new Set((n.data.extraRefs || []).map((r) => r.url));
  }, [id, nodes]);
  const media = useMemo(() => useStudio.getState().shotMedia(id), [id, nodes, edges]);
  const cap = kind === "video" ? 9 : 3;
  const refs = media.images.slice(0, cap);
  const vids = kind === "video" ? media.videos : [];
  if (!refs.length && !vids.length) {
    return <p className="hint-line">还没有参考。从下面角色库 / 场景库 / 素材库点进去，或把分镜图连上。H3 最多 9 图 + 3 视频。</p>;
  }
  return (
    <div className="ref-strip">
      {refs.map((r, i) => (
        <div key={r.url} className="ref-slot">
          <img src={r.url} alt={r.name} onClick={() => setPreview({ url: r.url, kind: "image", title: r.name })} />
          <em>图{i + 1}{extraUrls.has(r.url) ? "" : " · 自动"}</em>
          <small title={r.name}>{r.name}</small>
          {extraUrls.has(r.url) ? (
            <button type="button" className="ref-x" onClick={() => useStudio.getState().unpinRef(id, r.url)} title="从本镜拿掉">
              ×
            </button>
          ) : null}
        </div>
      ))}
      {vids.map((r, i) => (
        <div key={r.url} className="ref-slot vid">
          <video src={r.url} muted />
          <em>视频{i + 1}</em>
          <small>{r.name}</small>
        </div>
      ))}
      <span className="pill">
        参考 {Math.min(refs.length, cap)}/{cap}
        {vids.length ? ` · 视频 ${vids.length}/3` : ""}
      </span>
    </div>
  );
}

function AssetLib({ id }: { id: string }) {
  const nodes = useStudio((s) => s.nodes);
  const [tab, setTab] = useState<AssetKind>("character");
  const script = useMemo(() => scriptFor(id), [id, nodes]);
  const assets = (script?.assets || []).filter((a) => a.kind === tab && !isPlaceholderAsset(a));
  return (
    <div className="asset-lib">
      <div className="lib-tabs">
        {LIB.map((t) => (
          <button key={t.kind} type="button" className={tab === t.kind ? "on" : ""} onClick={() => setTab(t.kind)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="lib-row">
        {assets.length ? (
          assets.map((a) => <LibCard key={a.id} asset={a} nodeId={id} />)
        ) : (
          <span className="muted">这一类还没有资产。去脚本节点准备资产。</span>
        )}
      </div>
    </div>
  );
}

function LibCard({ asset, nodeId }: { asset: Asset; nodeId: string }) {
  return (
    <button
      type="button"
      className={`lib-card ${asset.url ? "" : "empty"}`}
      title={asset.url ? `加入本镜参考，并写入 @${asset.name}` : "还没有图"}
      onClick={() => useStudio.getState().pinRef(nodeId, { name: asset.name, url: asset.url })}
    >
      {asset.url ? <img src={asset.url} alt="" /> : <span>无图</span>}
      <b>{asset.name}</b>
    </button>
  );
}

export function ModelSelect({
  kind,
  value,
  onChange,
}: {
  kind: "image" | "video";
  value: string;
  onChange: (v: string) => void;
}) {
  const catalog = useStudio((s) => s.catalog);
  const list = kind === "image" ? catalog.image : catalog.video;
  const cloud = list.filter((m) => m.family === "api");
  const local = list.filter((m) => m.family !== "api");
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title="这一节点用的模型">
      <option value="">跟随设置</option>
      {cloud.length ? (
        <optgroup label="云端 API">
          {cloud.map((m) => (
            <option key={m.file} value={m.file}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ) : null}
      {local.map((m) => (
        <option key={m.file} value={m.file}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

export function SizeFields({
  kind,
  width,
  height,
  onChange,
}: {
  kind: "image" | "video";
  width?: number;
  height?: number;
  onChange: (p: { width?: number; height?: number }) => void;
}) {
  const bible = useStudio((s) => s.bible);
  const [dw, dh] = sizeOf(bible.aspect, kind);
  const presets = kind === "video"
    ? [
        ["画幅", dw, dh],
        ["H3 16:9", 1344, 768],
        ["H3 2K", 1920, 1088],
        ["竖屏", 768, 1344],
      ]
    : [
        ["画幅", dw, dh],
        ["1280×720", 1280, 720],
        ["1344×768", 1344, 768],
        ["方图", 1024, 1024],
        ["竖图", 768, 1280],
      ];
  const w = width || dw;
  const h = height || dh;
  const preset = presets.find((p) => Number(p[1]) === w && Number(p[2]) === h)?.[0] || "自定义";
  return (
    <div className="gen-row">
      <select
        value={String(preset)}
        onChange={(e) => {
          const hit = presets.find((p) => p[0] === e.target.value);
          if (hit) onChange({ width: Number(hit[1]), height: Number(hit[2]) });
        }}
      >
        {presets.map((p) => (
          <option key={String(p[0])} value={String(p[0])}>
            {String(p[0])}
          </option>
        ))}
        <option value="自定义">自定义</option>
      </select>
      <label className="dur">
        宽
        <input type="number" min={256} max={2048} step={32} value={w} onChange={(e) => onChange({ width: Number(e.target.value) || w })} />
      </label>
      <label className="dur">
        高
        <input type="number" min={256} max={2048} step={32} value={h} onChange={(e) => onChange({ height: Number(e.target.value) || h })} />
      </label>
    </div>
  );
}

export function Generator() {
  const nodes = useStudio((s) => s.nodes);
  const scriptFull = useStudio((s) => s.scriptFull);
  const selected = nodes.filter((n) => n.selected);
  const one = selected.length === 1 ? selected[0] : undefined;
  const busy = useStudio((s) => s.busy);
  const updateNode = useStudio((s) => s.updateNode);

  useEffect(() => {
    void useStudio.getState().loadCatalog();
  }, []);

  if (scriptFull) return null;

  if (selected.length > 1) {
    return (
      <div className="generator">
        <p className="hint-line">已选 {selected.length} 个节点。框选后可 Delete。从右边拉线把参考传给下一个节点。</p>
      </div>
    );
  }
  if (!one) {
    return (
      <div className="generator">
        <p className="hint-line">选中图片/视频节点可改模型、尺寸、清晰度。点缩略图放大看。云端关机时先把参数设好。</p>
      </div>
    );
  }

  if (one.data.kind === "text") {
    return (
      <div className="generator">
        <p className="hint-line">从右边的 + 拉出「脚本生成器」。生成按钮在那个节点上，不在这里。</p>
      </div>
    );
  }

  if (one.data.kind === "audio") {
    const a = one.data;
    const catalog = useStudio.getState().catalog;
    const voice = a.voice || catalog.ttsVoice || "clone";
    const refUrl = a.refUrl || catalog.ttsRefUrl;
    return (
      <div className="generator wide">
        <p className="hint-line">H3 不负责说话。有对白的镜头会自动铺这个节点。仿声用参考音频，本机 GPT-SoVITS / IndexTTS 或云端千问、MiniMax。</p>
        <textarea
          className="nodrag nowheel"
          value={a.prompt}
          placeholder="要对的台词"
          onChange={(e) => updateNode(one.id, { prompt: e.target.value })}
        />
        <div className="gen-row">
          <select value={voice} onChange={(e) => updateNode(one.id, { voice: e.target.value })}>
            {TTS_PRESETS.map((t) => (
              <option key={`${t.provider}:${t.voice}`} value={t.voice}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={a.backend || catalog.ttsBackend || "auto"} onChange={(e) => updateNode(one.id, { backend: e.target.value as AudioData["backend"] })}>
            <option value="auto">自动</option>
            <option value="comfy">本机</option>
            <option value="cloud">云端</option>
          </select>
        </div>
        {voice === "clone" ? (
          <p className="hint-line">{refUrl ? "已有仿声参考音频" : "还没有参考音频，去设置里上传一段人声"}{catalog.ttsNode ? ` · ${catalog.ttsNode}` : ""}</p>
        ) : null}
        <footer>
          <span className="pill">{a.status === "error" ? a.error : a.url ? "配音已出" : "配音 · 本节点"}</span>
          <button className="send" disabled={!!busy} onClick={() => void useStudio.getState().generateAudio(one.id)}>
            <ArrowUp size={16} />
          </button>
        </footer>
      </div>
    );
  }

  if (one.data.kind === "script") {
    if (!one.data.promptsReady) return null;
    return <ScriptGen id={one.id} data={one.data} busy={busy} />;
  }

  if (one.data.kind === "image") {
    const d = one.data as ImageData;
    return (
      <div className="generator wide">
        <MediaBar id={one.id} kind="image" />
        <AssetLib id={one.id} />
        <textarea
          className="nodrag nowheel"
          value={d.prompt}
          placeholder="这一镜的画面。用 @角色 @场景 点参考，出图时会变成 图1 图2。"
          onChange={(e) => updateNode(one.id, { prompt: e.target.value })}
        />
        <textarea
          className="nodrag nowheel neg"
          value={d.negative}
          placeholder="负面提示词，可空。"
          onChange={(e) => updateNode(one.id, { negative: e.target.value })}
        />
        <div className="gen-row">
          <ModelSelect kind="image" value={d.model || ""} onChange={(model) => updateNode(one.id, { model })} />
          <select value={d.quality || "fast"} onChange={(e) => updateNode(one.id, { quality: e.target.value as GenQuality })}>
            <option value="fast">快</option>
            <option value="std">标准</option>
            <option value="high">清晰</option>
          </select>
        </div>
        <SizeFields kind="image" width={d.width} height={d.height} onChange={(p) => updateNode(one.id, p)} />
        <footer>
          <span className="pill">{d.usedModel ? `上次 ${d.usedModel.replace(/^.*[/\\]/, "")}` : "出图 · 本节点"}</span>
          <button className="send" disabled={!!busy} onClick={() => void useStudio.getState().generateImage(one.id)}>
            <ArrowUp size={16} />
          </button>
        </footer>
      </div>
    );
  }

  const v = one.data as VideoData;
  return (
    <div className="generator wide">
      <MediaBar id={one.id} kind="video" />
      <AssetLib id={one.id} />
      <textarea
        className="nodrag nowheel"
        value={v.prompt}
        placeholder="这一镜怎么动。用 @彼得库伦 @棚外夜场 点参考，H3 会按 图1 图2 吃多模态。"
        onChange={(e) => updateNode(one.id, { prompt: e.target.value })}
      />
      <div className="gen-row">
        <ModelSelect kind="video" value={v.model || ""} onChange={(model) => updateNode(one.id, { model })} />
        <select value={v.quality || "std"} onChange={(e) => updateNode(one.id, { quality: e.target.value as GenQuality })}>
          <option value="fast">快</option>
          <option value="std">标准</option>
          <option value="high">清晰</option>
        </select>
        <label className="dur">
          秒
          <input
            type="number"
            min={1}
            max={15}
            value={v.duration}
            onChange={(e) => updateNode(one.id, { duration: Number(e.target.value) || 6 })}
          />
        </label>
      </div>
      <SizeFields kind="video" width={v.width} height={v.height} onChange={(p) => updateNode(one.id, p)} />
      <footer>
        <button
          type="button"
          className="ghost"
          disabled={!!busy}
          onClick={() => {
            const shotId = v.shotId;
            const script = useStudio.getState().nodes.find((n) => n.data.kind === "script" && (!shotId || n.data.script.shots.some((s) => s.id === shotId)));
            if (!script) {
              useStudio.getState().setToast("找不到对应脚本。先在脚本页合成提示词，再点 H3 优化");
              return;
            }
            void useStudio.getState().optimizeH3(script.id, shotId ? [shotId] : undefined);
          }}
        >
          针对 MiniMax H3 优化
        </button>
        <span className="pill">{v.usedModel ? `上次 ${v.usedModel.replace(/^.*[/\\]/, "")}` : "H3 · 本节点"}</span>
        <button className="send" disabled={!!busy} onClick={() => void useStudio.getState().generateVideo(one.id)}>
          <ArrowUp size={16} />
        </button>
      </footer>
    </div>
  );
}

function ScriptGen({ id, data, busy }: { id: string; data: ScriptData; busy: string }) {
  const updateNode = useStudio((s) => s.updateNode);
  const bible = useStudio((s) => s.bible);
  const setBible = useStudio((s) => s.setBible);
  const batch = useStudio((s) => s.batch);
  const [draft, setDraft] = useState(data.draft);
  useEffect(() => setDraft(data.draft), [data.draft, id]);

  const hasShots = (data.script.shots || []).length > 0;

  return (
    <div className="generator">
      {!hasShots ? (
        <textarea
          className="nodrag nowheel tall"
          value={draft}
          placeholder="左边剧本拉过来会自动填。也可以把剧情贴这里，点「生成脚本」拆镜头、抽资产。"
          onChange={(e) => {
            setDraft(e.target.value);
            updateNode(id, { draft: e.target.value });
          }}
        />
      ) : batch === "boards" ? (
        <p className="hint-line">出分镜图：每个图片节点可单独改模型、尺寸。云端没开时先把参数设好。</p>
      ) : batch === "videos" ? (
        <p className="hint-line">批量出视频走 MiniMax H3。每个视频节点可单独改参考、秒数和清晰度。</p>
      ) : batch === "audios" ? (
        <p className="hint-line">有对白的镜头在铺配音。仿声用设置里的参考音频。</p>
      ) : data.promptsReady ? (
        <p className="hint-line">提示词已合成。点顶部「生成分镜」，再选中单镜改参数。</p>
      ) : (
        <p className="hint-line">
          已拆 {data.script.shots.length} 镜。打开脚本节点：确认镜头 → 准备资产 → 合成提示词。还没到出镜头这一步。
        </p>
      )}
      <footer>
        <label className="file-chip">
          <FileUp size={14} /> 导入 txt
          <input
            type="file"
            accept=".txt,.json,.md"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const raw = await f.text();
              useStudio.getState().updateNode(id, { draft: raw });
              await useStudio.getState().parseOrWriteScript(id);
              e.target.value = "";
            }}
          />
        </label>
        {!hasShots ? (
          <button className="primary" disabled={!!busy} onClick={() => void useStudio.getState().parseOrWriteScript(id)}>
            生成脚本
          </button>
        ) : (
          <>
            <button type="button" onClick={() => useStudio.getState().setScriptFull(id)}>
              打开脚本节点
            </button>
            {data.promptsReady ? (
              <>
                <select value={bible.aspect} onChange={(e) => setBible({ aspect: e.target.value as typeof bible.aspect })}>
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                  <option value="1:1">1:1</option>
                </select>
                {batch === "videos" ? (
                  <label className="dur">
                    秒
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={bible.duration}
                      onChange={(e) => setBible({ duration: Number(e.target.value) || 6 })}
                    />
                  </label>
                ) : null}
                {batch ? (
                  <button
                    className="send"
                    disabled={!!busy}
                    onClick={() =>
                      void (batch === "boards"
                        ? useStudio.getState().generateBoards(id)
                        : useStudio.getState().generateVideos(id))
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                ) : (
                  <span className="pill">先点顶部生成分镜</span>
                )}
              </>
            ) : (
              <span className="pill">先合成提示词</span>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
