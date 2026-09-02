import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import * as api from "./api";
import type { CanvasMeta } from "./api";
import { extractAssets, looksLikeScript, parseScript } from "./importScript";
import { IMAGE_API_MODELS, type CustomLlm, type LlmProvider } from "./models";
import { matchShotAssets, retagScript, stampNodePrompt } from "./matchAssets";
import {
  defaultBible,
  emptyAsset,
  emptyScript,
  emptyShot,
  bindAtToSlots,
  spokenLine,
  type Asset,
  type AssetKind,
  type AudioData,
  type Bible,
  type ImageData,
  type NodeData,
  type NodeKind,
  type ScriptData,
  type ScriptPayload,
  type Shot,
  type TextData,
  type VideoData,
  type GenQuality,
  type Sheet,
} from "./types";

type GenOpts = { ids?: string[]; model?: string; quality?: GenQuality; width?: number; height?: number };

export type StudioNode = Node<NodeData>;

let seq = 1;
const nid = () => `n${Date.now().toString(36)}${seq++}`;

export const labels: Record<NodeKind, string> = {
  text: "剧本",
  image: "图片",
  video: "视频",
  audio: "配音",
  script: "脚本生成器",
};

export type CatalogPick = { file: string; label: string; family: string };
export type Preview = { url: string; kind: "image" | "video"; title: string };

export function sizeOf(aspect: Bible["aspect"], kind: "image" | "video" = "image"): [number, number] {
  if (kind === "video") {
    if (aspect === "9:16") return [768, 1344];
    if (aspect === "1:1") return [768, 768];
    return [1344, 768];
  }
  if (aspect === "9:16") return [768, 1280];
  if (aspect === "1:1") return [1024, 1024];
  return [1280, 720];
}

export function stepsOf(quality: GenQuality | undefined, kind: "image" | "video") {
  if (kind === "image") return quality === "high" ? 20 : quality === "std" ? 8 : 4;
  return quality === "high" ? 28 : quality === "fast" ? 12 : 20;
}

function blank(kind: NodeKind): NodeData {
  if (kind === "text") return { kind, title: "剧本", body: "" };
  if (kind === "image") return { kind, title: "图片", url: "", prompt: "", negative: "", status: "idle" };
  if (kind === "video") return { kind, title: "视频", url: "", prompt: "", duration: 4, status: "idle" };
  if (kind === "audio") return { kind, title: "配音", url: "", prompt: "", voice: "clone", status: "idle" };
  return {
    kind,
    title: "脚本生成器",
    draft: "",
    script: emptyScript(),
    selected: [],
    step: 1,
    globalStyle: "",
    assets: [],
    promptsReady: false,
    refs: [],
  };
}

function pickShotAssets(script: ScriptData, shotId?: string, prompt = "") {
  return matchShotAssets(script, shotId, prompt).map((a) => ({ name: a.name, url: a.url }));
}

function asScript(node?: StudioNode): ScriptData | undefined {
  return node?.data.kind === "script" ? node.data : undefined;
}

function genFail(e: unknown) {
  const msg = e instanceof Error ? e.message : "失败";
  if (/fetch|ECONNREFUSED|Failed to fetch|comfy offline|未连|超时|timeout/i.test(msg)) {
    return "云端没开。这个节点的模型、尺寸、提示词已记下，开机后再生成。";
  }
  return msg;
}

export function waitCloud(msg?: string) {
  return Boolean(msg && /云端没开/.test(msg));
}

function clearOfflineError(nodes: StudioNode[]) {
  return nodes.map((n) => {
    if ((n.data.kind === "image" || n.data.kind === "video") && waitCloud(n.data.error)) {
      return { ...n, data: { ...n.data, status: "idle" as const, error: "" } };
    }
    return n;
  });
}

function dropEmptyShots(nodes: StudioNode[], edges: Edge[]) {
  const keep = nodes.filter((n) => {
    if (n.data.kind !== "image" && n.data.kind !== "video") return true;
    const shot = (n.data as ImageData | VideoData).shotId;
    if (!shot) return true;
    return Boolean((n.data as ImageData | VideoData).url);
  });
  const ids = new Set(keep.map((n) => n.id));
  return { nodes: keep, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

function bibleText(b: Bible) {
  return [`片名：${b.title}`, `画幅：${b.aspect}`, `默认时长：${b.duration}秒`, `画风：${b.style}`, `禁令：${b.forbid}`].join("\n");
}

type State = {
  nodes: StudioNode[];
  edges: Edge[];
  bible: Bible;
  busy: string;
  toast: string;
  settingsOpen: boolean;
  scriptFull: string;
  sheet: Sheet;
  batch: "" | "boards" | "videos" | "audios";
  preview: Preview | null;
  canvasId: string | null;
  history: CanvasMeta[];
  historyOpen: boolean;
  catalog: {
    image: CatalogPick[];
    video: CatalogPick[];
    t2iModel: string;
    i2vModel: string;
    llmProvider: string;
    llmModel: string;
    customLlms: CustomLlm[];
    ttsProvider: string;
    ttsVoice: string;
    ttsBackend: string;
    ttsRefUrl: string;
    ttsRefText: string;
    ttsNode: string;
  };
  setBusy: (v: string) => void;
  setToast: (v: string) => void;
  setPreview: (v: Preview | null) => void;
  loadCatalog: () => Promise<void>;
  setLlm: (p: { provider: LlmProvider; model: string; remember?: boolean }) => Promise<void>;
  newCanvas: () => void;
  openCanvas: (id: string) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  setHistoryOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setScriptFull: (id: string) => void;
  setSheet: (v: Sheet) => void;
  clearShotNodes: () => void;
  setScriptStep: (id: string, step: 1 | 2 | 3) => void;
  armBatch: (id: string, kind: "boards" | "videos" | "audios") => void;
  setBible: (p: Partial<Bible>) => void;
  onNodesChange: (c: NodeChange<StudioNode>[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNode: (kind: NodeKind, position: XYPosition, extra?: Partial<NodeData>) => string;
  addConnected: (fromId: string, kind: NodeKind, position: XYPosition) => string;
  selectOnly: (id: string) => void;
  importScript: (raw: string, position?: XYPosition) => string;
  updateNode: (id: string, data: Partial<NodeData>) => void;
  patchShot: (scriptId: string, shotId: string, patch: Partial<Shot>) => void;
  addShot: (scriptId: string) => void;
  toggleShot: (scriptId: string, shotId: string, on?: boolean) => void;
  patchAsset: (scriptId: string, assetId: string, patch: Partial<Asset>) => void;
  addAsset: (scriptId: string, kind: AssetKind) => void;
  removeAsset: (scriptId: string, assetId: string) => void;
  selected: () => StudioNode | undefined;
  incomingImages: (id: string) => { name: string; url: string }[];
  incomingVideos: (id: string) => { name: string; url: string }[];
  shotMedia: (id: string) => { images: { name: string; url: string }[]; videos: { name: string; url: string }[] };
  incomingText: (id: string) => string;
  pinRef: (id: string, ref: { name: string; url: string }) => void;
  unpinRef: (id: string, url: string) => void;
  bindShotAssets: (scriptId: string) => void;
  parseOrWriteScript: (id: string) => Promise<void>;
  synthesizePrompts: (id: string, ids?: string[]) => Promise<void>;
  generateAsset: (scriptId: string, assetId: string) => Promise<void>;
  generateAllAssets: (scriptId: string, opts?: GenOpts) => Promise<void>;
  generateBoards: (id: string, opts?: GenOpts) => Promise<void>;
  generateVideos: (id: string, opts?: GenOpts) => Promise<void>;
  generateAudios: (id: string, opts?: { ids?: string[] }) => Promise<void>;
  generateImage: (id: string) => Promise<void>;
  generateVideo: (id: string) => Promise<void>;
  generateAudio: (id: string) => Promise<void>;
  optimizeH3: (scriptId: string, ids?: string[]) => Promise<void>;
};

export const useStudio = create<State>()((set, get) => ({
      nodes: [],
      edges: [],
      bible: defaultBible(),
      busy: "",
      toast: "",
      settingsOpen: false,
      scriptFull: "",
      sheet: null,
      batch: "",
      preview: null,
      canvasId: null,
      history: [],
      historyOpen: false,
      catalog: { image: [], video: [], t2iModel: "", i2vModel: "", llmProvider: "deepseek", llmModel: "deepseek-v4-flash", customLlms: [], ttsProvider: "qwen", ttsVoice: "clone", ttsBackend: "auto", ttsRefUrl: "", ttsRefText: "", ttsNode: "" },
      setBusy: (busy) => set({ busy }),
      setPreview: (preview) => set({ preview }),
      loadCatalog: async () => {
        const fallbackImage = [
          { file: "qwen_image_2512_fp8_e4m3fn_scaled_comfyui.safetensors", label: "Qwen Image 2512", family: "qwen" },
          { file: "qwen_image_edit_2509_fp8_e4m3fn_scaled.safetensors", label: "Qwen 多图参考", family: "qwen_edit" },
        ];
        const fallbackVideo = [
          { file: "minimax_h3_ref2va_pruned_int8_convrot.safetensors", label: "MiniMax H3 参考", family: "h3_ref2va" },
          { file: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", label: "MiniMax H3 首尾帧", family: "h3_fl2va" },
        ];
        try {
          const s = await api.getSettings();
          const cat = await api.getComfyModels().catch(() => null);
          set({
            catalog: {
              image: [...IMAGE_API_MODELS, ...(cat?.ok && cat.image?.length ? cat.image : fallbackImage)],
              video: cat?.ok && cat.video?.length ? cat.video : fallbackVideo,
              t2iModel: (s.t2iModel || "").startsWith("api:") ? s.t2iModel : cat?.t2iModel || s.t2iModel || fallbackImage[0].file,
              i2vModel: cat?.i2vModel || s.i2vModel || fallbackVideo[0].file,
              llmProvider: s.llmProvider || "deepseek",
              llmModel: s.llmModel || "deepseek-v4-flash",
              customLlms: (s.customLlms || []) as CustomLlm[],
              ttsProvider: s.ttsProvider || "qwen",
              ttsVoice: s.ttsVoice || "clone",
              ttsBackend: s.ttsBackend || "auto",
              ttsRefUrl: s.ttsRefUrl || "",
              ttsRefText: s.ttsRefText || "",
              ttsNode: cat?.tts?.label || "",
            },
          });
        } catch {
          set({
            catalog: {
              image: [...IMAGE_API_MODELS, ...fallbackImage],
              video: fallbackVideo,
              t2iModel: fallbackImage[0].file,
              i2vModel: fallbackVideo[0].file,
              llmProvider: "deepseek",
              llmModel: "deepseek-v4-flash",
              customLlms: [],
              ttsProvider: "qwen",
              ttsVoice: "clone",
              ttsBackend: "auto",
              ttsRefUrl: "",
              ttsRefText: "",
              ttsNode: "",
            },
          });
        }
      },
      setToast: (toast) => {
        set({ toast });
        if (toast) window.setTimeout(() => set({ toast: "" }), 4200);
      },
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setLlm: async ({ provider, model, remember }) => {
        const id = model.trim();
        const prev = get().catalog.customLlms || [];
        const exists = prev.some((p) => p.provider === provider && p.model === id);
        const customLlms =
          remember && !exists ? [...prev, { provider, model: id, label: id }] : prev;
        set({ catalog: { ...get().catalog, llmProvider: provider, llmModel: id, customLlms } });
        await api.saveSettings({ llmProvider: provider, llmModel: id, customLlms });
      },
      setHistoryOpen: (historyOpen) => set({ historyOpen }),
      newCanvas: () => {
        const had = get().nodes.length;
        set({
          nodes: [],
          edges: [],
          bible: defaultBible(),
          canvasId: null,
          scriptFull: "",
          sheet: null,
          batch: "",
          historyOpen: false,
        });
        get().setToast(had ? "已新建。上一份在「历史画布」里" : "已是空白画布");
      },
      openCanvas: async (id) => {
        const c = await api.loadCanvas(id);
        const nodes = clearOfflineError((c.nodes || []) as StudioNode[]);
        set({
          nodes,
          edges: (c.edges || []) as Edge[],
          bible: { ...defaultBible(), ...(c.bible as Bible | null | undefined) },
          canvasId: id,
          scriptFull: "",
          sheet: null,
          batch: "",
          historyOpen: false,
        });
        for (const n of nodes) {
          if (n.data.kind === "script" && n.data.promptsReady) get().bindShotAssets(n.id);
        }
        get().setToast("已打开历史画布");
      },
      deleteHistory: async (id) => {
        const r = await api.deleteCanvas(id);
        const wipe = get().canvasId === id;
        set({
          history: r.items || [],
          ...(wipe
            ? { nodes: [], edges: [], bible: defaultBible(), canvasId: null, scriptFull: "", sheet: null, batch: "" }
            : {}),
        });
        get().setToast("已从历史里删掉");
      },
      setScriptFull: (scriptFull) => set({ scriptFull }),
      setSheet: (sheet) => set({ sheet }),
      clearShotNodes: () => {
        const before = get().nodes.length;
        const { nodes, edges } = dropEmptyShots(get().nodes, get().edges);
        if (nodes.length === before) return;
        set({ nodes, edges, batch: "", sheet: null });
        get().setToast("已清掉空的分镜节点，剧本和资产还在");
      },
      setScriptStep: (id, step) => get().updateNode(id, { step } as Partial<ScriptData>),
      armBatch: (id, kind) => {
        const d = asScript(get().nodes.find((n) => n.id === id));
        if (!d) return;
        if (!d.script.shots.length) {
          get().setToast("先生成脚本，确认镜头");
          return;
        }
        if (kind === "audios") {
          const n = d.script.shots.filter((s) => spokenLine(s.dialogue)).length;
          if (!n) {
            get().setToast("这些镜头没有对白。把台词写进对白栏，再铺配音节点");
            return;
          }
          set({ batch: kind, sheet: { kind, scriptId: id } });
          return;
        }
        if (!d.promptsReady) {
          get().setToast("先走完三步：确认镜头 → 准备资产 → 合成提示词");
          return;
        }
        if (kind === "videos") {
          const has = get().nodes.some((n) => n.data.kind === "image" && (n.data as ImageData).url && (n.data as ImageData).shotId);
          if (!has) {
            get().setToast("先生成分镜图");
            return;
          }
        }
        set({ batch: kind, sheet: { kind, scriptId: id } });
      },
      setBible: (p) => set({ bible: { ...get().bible, ...p } }),
      onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) as StudioNode[] }),
      onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
      onConnect: (c) => {
        set({ edges: addEdge({ ...c, animated: false }, get().edges) });
        if (!c.source || !c.target) return;
        const src = get().nodes.find((n) => n.id === c.source);
        const dst = get().nodes.find((n) => n.id === c.target);
        if (src?.data.kind === "text" && dst?.data.kind === "script" && src.data.body.trim()) {
          get().updateNode(dst.id, { draft: src.data.body } as Partial<ScriptData>);
        }
      },
      addNode: (kind, position, extra) => {
        const id = nid();
        const data = { ...blank(kind), ...(extra as object) } as NodeData;
        set({ nodes: [...get().nodes, { id, type: kind, position, data }] });
        return id;
      },
      addConnected: (fromId, kind, position) => {
        const id = get().addNode(kind, position);
        set({ edges: addEdge({ id: nid(), source: fromId, target: id }, get().edges) });
        const src = get().nodes.find((n) => n.id === fromId);
        if (kind === "script" && src?.data.kind === "text") {
          get().updateNode(id, { draft: src.data.body, title: src.data.title || "脚本生成器" } as Partial<ScriptData>);
        }
        if (kind === "image" && src?.data.kind === "text") {
          get().updateNode(id, { prompt: (src.data as TextData).body } as Partial<ImageData>);
        }
        if (kind === "image" && src?.data.kind === "script") {
          const shot = (src.data as ScriptData).script.shots[0];
          if (shot) get().updateNode(id, { prompt: shot.imagePrompt || shot.action, shotId: shot.id } as Partial<ImageData>);
        }
        if (kind === "video" && src?.data.kind === "image") {
          const img = src.data as ImageData;
          get().updateNode(id, { prompt: img.prompt, shotId: img.shotId } as Partial<VideoData>);
        }
        if (kind === "audio" && src?.data.kind === "video") {
          const vid = src.data as VideoData;
          const script = get().nodes.find((n) => n.data.kind === "script" && n.data.script.shots.some((s) => s.id === vid.shotId));
          const shot = script?.data.kind === "script" ? script.data.script.shots.find((s) => s.id === vid.shotId) : undefined;
          get().updateNode(id, {
            title: vid.shotId ? `配音 镜${vid.shotId}` : "配音",
            shotId: vid.shotId,
            prompt: spokenLine(shot?.dialogue) || shot?.sfx || "",
            voice: get().catalog.ttsVoice || "clone",
          } as Partial<AudioData>);
        }
        get().selectOnly(id);
        return id;
      },
      importScript: (raw, position) => {
        const pos = position || { x: 80, y: 120 };
        const title = (raw.match(/^片名[：:]\s*(.+)$/m) || [])[1]?.trim() || "剧本";
        const aspect = (raw.match(/^画幅[：:]\s*(16:9|9:16|1:1)/m) || [])[1] as Bible["aspect"] | undefined;
        const duration = Number((raw.match(/^默认秒数[：:]\s*(\d+)/m) || [])[1] || 0);
        const style = ((raw.match(/^画风[：:]\s*(.+)$/m) || [])[1] || "").trim();
        const forbid = ((raw.match(/^禁令[：:]\s*(.+)$/m) || [])[1] || "").trim();
        get().setBible({
          title,
          ...(aspect ? { aspect } : {}),
          ...(duration ? { duration } : {}),
          ...(style ? { style } : {}),
          ...(forbid ? { forbid } : {}),
        });
        const playId = get().addNode("text", pos, { kind: "text", title, body: raw } as TextData);
        const genId = get().addConnected(playId, "script", { x: pos.x + 460, y: pos.y });
        get().updateNode(genId, { draft: raw, title } as Partial<ScriptData>);
        get().selectOnly(genId);
        if (looksLikeScript(raw)) {
          void get().parseOrWriteScript(genId);
        } else {
          get().setToast("点脚本生成器上的「生成脚本」");
        }
        return genId;
      },
      selectOnly: (id) => set({ nodes: get().nodes.map((n) => ({ ...n, selected: n.id === id })) }),
      updateNode: (id, data) =>
        set({
          nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } as NodeData } : n)),
        }),
      patchShot: (scriptId, shotId, patch) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        const invalidate = ["action", "scene", "camera", "shotScale", "lighting"].some((k) => k in patch);
        get().updateNode(scriptId, {
          script: { ...d.script, shots: d.script.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) },
          promptsReady: invalidate ? false : d.promptsReady,
        } as Partial<ScriptData>);
      },
      addShot: (scriptId) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        const id = String(d.script.shots.length + 1).padStart(2, "0");
        const shot = emptyShot(id);
        get().updateNode(scriptId, {
          script: { ...d.script, shots: [...d.script.shots, shot] },
          selected: [...d.selected, id],
          promptsReady: false,
        } as Partial<ScriptData>);
      },
      toggleShot: (scriptId, shotId, on) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        const cur = new Set(d.selected);
        const next = on ?? !cur.has(shotId);
        if (next) cur.add(shotId);
        else cur.delete(shotId);
        get().updateNode(scriptId, { selected: [...cur] } as Partial<ScriptData>);
      },
      patchAsset: (scriptId, assetId, patch) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        get().updateNode(scriptId, {
          assets: (d.assets || []).map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
        } as Partial<ScriptData>);
      },
      addAsset: (scriptId, kind) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        get().updateNode(scriptId, { assets: [...(d.assets || []), emptyAsset(kind)] } as Partial<ScriptData>);
      },
      removeAsset: (scriptId, assetId) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        get().updateNode(scriptId, { assets: (d.assets || []).filter((a) => a.id !== assetId) } as Partial<ScriptData>);
      },
      selected: () => get().nodes.find((n) => n.selected),
      incomingImages: (id) => {
        const refs: { name: string; url: string }[] = [];
        const self = get().nodes.find((n) => n.id === id);
        const shotId = self?.data.kind === "image" || self?.data.kind === "video" ? self.data.shotId : undefined;
        const prompt = self?.data.kind === "image" || self?.data.kind === "video" ? self.data.prompt : "";
        for (const e of get().edges.filter((x) => x.target === id)) {
          const src = get().nodes.find((n) => n.id === e.source);
          if (src?.data.kind === "image" && src.data.url) refs.push({ name: src.data.title, url: src.data.url });
          if (src?.data.kind === "script") refs.push(...pickShotAssets(src.data, shotId, prompt));
        }
        if (self?.data.kind === "script") refs.push(...pickShotAssets(self.data));
        if (self?.data.kind === "image" || self?.data.kind === "video") {
          for (const r of self.data.extraRefs || []) refs.push(r);
        }
        return refs.filter((r, i) => refs.findIndex((x) => x.url === r.url) === i);
      },
      incomingVideos: (id) => {
        const refs: { name: string; url: string }[] = [];
        for (const e of get().edges.filter((x) => x.target === id)) {
          const src = get().nodes.find((n) => n.id === e.source);
          if (src?.data.kind === "video" && src.data.url) refs.push({ name: src.data.title, url: src.data.url });
        }
        return refs.filter((r, i) => refs.findIndex((x) => x.url === r.url) === i);
      },
      shotMedia: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        const images = [...get().incomingImages(id)];
        const videos = [...get().incomingVideos(id)];
        const shotId = node?.data.kind === "video" || node?.data.kind === "image" ? node.data.shotId : undefined;
        const prompt = node?.data.kind === "image" || node?.data.kind === "video" ? node.data.prompt : "";
        for (const n of get().nodes) {
          if (n.data.kind !== "script") continue;
          if (shotId && !n.data.script.shots.some((s) => s.id === shotId)) continue;
          images.push(...pickShotAssets(n.data, shotId, prompt));
        }
        const uniq = (list: { name: string; url: string }[]) =>
          list.filter((r, i) => list.findIndex((x) => x.url === r.url) === i);
        return { images: uniq(images).slice(0, 9), videos: uniq(videos).slice(0, 3) };
      },
      pinRef: (id, ref) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || (node.data.kind !== "image" && node.data.kind !== "video")) return;
        if (!ref.url) {
          get().setToast(`${ref.name} 还没有图，先去资产里上传`);
          return;
        }
        const cur = node.data.extraRefs || [];
        const already = get().shotMedia(id).images.some((r) => r.url === ref.url) || cur.some((r) => r.url === ref.url);
        const prompt = node.data.prompt || "";
        const nextPrompt = ref.name && !prompt.includes(`@${ref.name}`) ? `${prompt}${prompt ? " " : ""}@${ref.name}`.trim() : prompt;
        if (already) {
          if (nextPrompt !== prompt) get().updateNode(id, { prompt: nextPrompt } as Partial<ImageData | VideoData>);
          return;
        }
        if (cur.length >= 9) {
          get().setToast("这一镜最多 9 张参考");
          return;
        }
        get().updateNode(id, { extraRefs: [...cur, ref], prompt: nextPrompt } as Partial<ImageData | VideoData>);
      },
      unpinRef: (id, url) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || (node.data.kind !== "image" && node.data.kind !== "video")) return;
        get().updateNode(id, { extraRefs: (node.data.extraRefs || []).filter((r) => r.url !== url) } as Partial<ImageData | VideoData>);
      },
      bindShotAssets: (scriptId) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        const next = retagScript(d);
        get().updateNode(scriptId, { script: next.script } as Partial<ScriptData>);
        const fresh = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!fresh) return;
        for (const n of get().nodes) {
          if (n.data.kind !== "image" && n.data.kind !== "video") continue;
          const sid = n.data.shotId;
          if (!sid || !fresh.script.shots.some((s) => s.id === sid)) continue;
          const shot = fresh.script.shots.find((s) => s.id === sid);
          if (!shot) continue;
          const refs = pickShotAssets(fresh, sid, n.data.prompt);
          const stamped = stampNodePrompt(n.data.prompt || (n.data.kind === "video" ? shot.videoPrompt : shot.imagePrompt), refs);
          if (stamped !== n.data.prompt) {
            get().updateNode(n.id, { prompt: stamped } as Partial<ImageData | VideoData>);
          }
        }
      },
      incomingText: (id) => {
        const parts: string[] = [];
        const self = get().nodes.find((n) => n.id === id);
        if (self?.data.kind === "script" && self.data.draft.trim()) parts.push(self.data.draft.trim());
        for (const e of get().edges.filter((x) => x.target === id)) {
          const src = get().nodes.find((n) => n.id === e.source);
          if (src?.data.kind === "text" && src.data.body.trim()) parts.push(src.data.body.trim());
          if (src?.data.kind === "video") {
            const sid = src.data.shotId;
            const script = get().nodes.find((n) => n.data.kind === "script" && (!sid || n.data.script.shots.some((s) => s.id === sid)));
            const shot = sid && script?.data.kind === "script" ? script.data.script.shots.find((s) => s.id === sid) : undefined;
            if (shot?.dialogue?.trim()) parts.push(shot.dialogue.trim());
          }
        }
        return parts.join("\n\n");
      },
      parseOrWriteScript: async (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.data.kind !== "script") return;
        const play = get()
          .edges.filter((x) => x.target === id)
          .map((e) => get().nodes.find((n) => n.id === e.source))
          .find((n) => n?.data.kind === "text" && n.data.body.trim());
        const draft = (play?.data.kind === "text" ? play.data.body : node.data.draft).trim();
        if (!draft) {
          get().setToast("先把剧情写进「剧本」节点，再拉到脚本生成器");
          return;
        }
        get().updateNode(id, { draft } as Partial<ScriptData>);
        const apply = (script: ScriptPayload, globalStyle: string, assets: Asset[]) => {
          const shots = script.shots.map((s) => ({
            ...s,
            shotScale: s.shotScale || s.camera,
            imagePrompt: "",
            videoPrompt: "",
          }));
          get().updateNode(id, {
            title: script.title || node.data.title,
            script: { ...script, shots },
            selected: shots.map((s) => s.id),
            step: 1,
            globalStyle: globalStyle || script.style,
            assets,
            promptsReady: false,
          } as Partial<ScriptData>);
          get().setScriptFull(id);
        };
        if (looksLikeScript(draft)) {
          try {
            const script = parseScript(draft);
            const extra = extractAssets(draft, script);
            apply(script, extra.globalStyle, extra.assets);
            get().setToast(`已写入 ${script.shots.length} 镜。先确认镜头，再准备资产`);
          } catch (e) {
            get().setToast(e instanceof Error ? e.message : "解析失败");
          }
          return;
        }
        get().setBusy("正在拆镜头、抽资产…");
        try {
          const packed = await api.textToScript(draft, bibleText(get().bible), {
            provider: get().catalog.llmProvider as LlmProvider,
            model: get().catalog.llmModel,
          });
          const script = parseScript(JSON.stringify(packed));
          const assets: Asset[] = (packed.assets || []).map((a: { kind: AssetKind; name: string; prompt: string }, i: number) => ({
            id: `a${i + 1}`,
            kind: a.kind === "scene" || a.kind === "prop" ? a.kind : "character",
            name: a.name,
            prompt: a.prompt || "",
            url: "",
            status: "idle" as const,
          }));
          apply(script, packed.globalStyle || script.style, assets.length ? assets : extractAssets(draft, script).assets);
          get().setToast(`已拆 ${script.shots.length} 镜。先确认镜头，再准备资产`);
        } catch (e) {
          get().setToast(e instanceof Error ? e.message : "拆脚本失败，去设置里填大模型 Key");
        } finally {
          get().setBusy("");
        }
      },
      synthesizePrompts: async (id, ids) => {
        const d = asScript(get().nodes.find((n) => n.id === id));
        if (!d?.script.shots.length) {
          get().setToast("还没有镜头");
          return;
        }
        const picks = ids?.length ? d.script.shots.filter((s) => ids.includes(s.id)) : d.script.shots;
        get().setBusy("正在合成最终提示词…");
        try {
          const result = await api.synthesizePrompts(
            {
              shots: picks.map((s) => ({
                id: s.id,
                duration: s.duration,
                action: s.action,
                scene: s.scene,
                shotScale: s.shotScale,
                lighting: s.lighting,
                dialogue: s.dialogue,
                sfx: s.sfx,
                camera: s.camera,
              })),
              assets: (d.assets || [])
                .filter((a) => a.name && !/^新(角色|场景|道具)$/.test(a.name))
                .map((a) => ({ kind: a.kind, name: a.name, prompt: a.prompt, hasImage: Boolean(a.url) })),
              globalStyle: d.globalStyle,
              bible: bibleText(get().bible),
            },
            { provider: get().catalog.llmProvider as LlmProvider, model: get().catalog.llmModel },
          );
          const map = new Map((result.shots || []).map((s) => [String(s.id).padStart(2, "0"), s]));
          get().updateNode(id, {
            script: {
              ...d.script,
              shots: d.script.shots.map((s) => {
                if (ids?.length && !ids.includes(s.id)) return s;
                const hit = map.get(s.id) || map.get(String(Number(s.id)));
                return hit
                  ? {
                      ...s,
                      imagePrompt: hit.imagePrompt || s.imagePrompt,
                      videoPrompt: hit.videoPrompt || s.videoPrompt,
                    }
                  : s;
              }),
            },
            step: 3,
            promptsReady: true,
          } as Partial<ScriptData>);
          get().bindShotAssets(id);
          get().setToast("提示词已合成，每镜已按画面自动匹配角色/场景/道具");
        } catch (e) {
          get().setToast(e instanceof Error ? e.message : "合成失败");
        } finally {
          get().setBusy("");
        }
      },
      generateAsset: async (scriptId, assetId) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        const asset = d?.assets.find((a) => a.id === assetId);
        if (!d || !asset) return;
        if (/库伦/.test(asset.name)) {
          get().setToast("库伦正脸请上传真照片，不要生成");
          return;
        }
        if (!asset.prompt.trim()) {
          get().setToast("先写资产描述，或自己上传定妆图");
          return;
        }
        get().patchAsset(scriptId, assetId, { status: "running", error: "" });
        get().setBusy(`出资产 ${asset.name}…`);
        try {
          const [dw, dh] = sizeOf(get().bible.aspect, "image");
          const w = asset.width || dw;
          const h = asset.height || dh;
          const model = asset.model || get().catalog.t2iModel;
          const refs = (d.assets || [])
            .filter((a) => a.url && a.id !== assetId && !/库伦/.test(a.name))
            .filter((a) => asset.prompt.includes(`@${a.name}`) || asset.prompt.includes(a.name))
            .map((a) => ({ name: a.name, url: a.url }))
            .slice(0, 3);
          const out = await api.generateImage({
            prompt: asset.prompt,
            width: w,
            height: h,
            images: refs,
            model,
            steps: stepsOf(asset.quality, "image"),
          });
          const media = out.media?.find((m: { kind: string }) => m.kind === "image") || out.media?.[0];
          get().patchAsset(scriptId, assetId, { status: "done", url: media?.url || "" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "出图失败";
          get().patchAsset(scriptId, assetId, { status: "error", error: msg });
          get().setToast(msg);
        } finally {
          get().setBusy("");
        }
      },
      generateAllAssets: async (scriptId, opts) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d) return;
        const pending = (d.assets || []).filter((a) => {
          if (/库伦/.test(a.name)) return false;
          if (opts?.ids?.length) return opts.ids.includes(a.id);
          return !a.url;
        });
        if (!pending.length) {
          get().setToast("没有可生成的资产。库伦请上传真照片");
          return;
        }
        for (const a of pending) {
          if (opts?.model || opts?.quality || opts?.width || opts?.height) {
            get().patchAsset(scriptId, a.id, {
              model: opts.model || a.model,
              quality: opts.quality || a.quality,
              width: opts.width || a.width,
              height: opts.height || a.height,
            });
          }
          await get().generateAsset(scriptId, a.id);
        }
      },
      generateBoards: async (id, opts) => {
        const node = get().nodes.find((n) => n.id === id);
        const d = asScript(node);
        if (!node || !d) return;
        if (!d.promptsReady) {
          get().setToast("先合成提示词");
          return;
        }
        get().bindShotAssets(id);
        const script = asScript(get().nodes.find((n) => n.id === id));
        if (!script) return;
        const picks = script.script.shots.filter((s) => (opts?.ids?.length ? opts.ids.includes(s.id) : true));
        if (!picks.length) {
          get().setToast("没有可出的镜头");
          return;
        }
        const existing = new Set(
          get()
            .nodes.filter((n) => n.data.kind === "image" && (n.data as ImageData).shotId)
            .map((n) => (n.data as ImageData).shotId),
        );
        const created: string[] = [];
        picks.forEach((shot, i) => {
          if (existing.has(shot.id)) {
            const hit = get().nodes.find((n) => n.data.kind === "image" && (n.data as ImageData).shotId === shot.id);
            if (hit) {
              get().updateNode(hit.id, {
                prompt: stampNodePrompt(shot.imagePrompt || shot.action, pickShotAssets(script, shot.id)),
                model: opts?.model || (hit.data as ImageData).model,
                quality: opts?.quality || (hit.data as ImageData).quality,
                width: opts?.width || (hit.data as ImageData).width,
                height: opts?.height || (hit.data as ImageData).height,
              } as Partial<ImageData>);
              created.push(hit.id);
            }
            return;
          }
          const col = i % 5;
          const row = Math.floor(i / 5);
          const iid = get().addNode(
            "image",
            { x: node.position.x + 440 + col * 268, y: node.position.y + row * 248 },
            {
              kind: "image",
              title: `镜${shot.id}`,
              shotId: shot.id,
              url: "",
              prompt: stampNodePrompt(shot.imagePrompt || shot.action, pickShotAssets(script, shot.id)),
              negative: "",
              model: opts?.model,
              quality: opts?.quality,
              width: opts?.width,
              height: opts?.height,
              status: "idle",
            } as ImageData,
          );
          set({ edges: addEdge({ id: nid(), source: id, target: iid }, get().edges) });
          created.push(iid);
        });
        get().setToast(`已在画布铺 ${created.length} 张分镜位`);
        const online = await api.comfyStatus().then((r) => r.ok).catch(() => false);
        if (!online) {
          get().setToast(`已创建 ${created.length} 个分镜位。云端没开，开机后再点节点生成`);
          set({ batch: "" });
          return;
        }
        set({ batch: "boards" });
        let ok = 0;
        let fail = 0;
        for (const iid of created) {
          const img = get().nodes.find((n) => n.id === iid);
          if (img?.data.kind === "image" && img.data.url) {
            ok += 1;
            continue;
          }
          await get().generateImage(iid);
          const after = get().nodes.find((n) => n.id === iid);
          if (after?.data.kind === "image" && after.data.url) ok += 1;
          else fail += 1;
        }
        set({ batch: "" });
        get().setToast(fail ? `分镜出完 ${ok} 张，失败 ${fail} 张` : `分镜 ${ok} 张已出完`);
      },
      generateVideos: async (id, opts) => {
        const node = get().nodes.find((n) => n.id === id);
        const d = asScript(node);
        if (!node || !d) return;
        get().bindShotAssets(id);
        const script = asScript(get().nodes.find((n) => n.id === id));
        if (!script) return;
        const boards = get().nodes.filter(
          (n) => n.data.kind === "image" && (n.data as ImageData).shotId && script.script.shots.some((s) => s.id === (n.data as ImageData).shotId),
        );
        const ready = boards.filter((n) => {
          const sid = (n.data as ImageData).shotId;
          if (opts?.ids?.length && sid && !opts.ids.includes(sid)) return false;
          return Boolean((n.data as ImageData).url);
        });
        if (!ready.length) {
          get().setToast("还没有分镜图。先批量生成分镜");
          return;
        }
        const vids: string[] = [];
        for (const board of ready) {
          const img = board.data as ImageData;
          let vid = get().nodes.find((n) => n.data.kind === "video" && (n.data as VideoData).shotId === img.shotId)?.id;
          const shot = script.script.shots.find((s) => s.id === img.shotId);
          const refs = pickShotAssets(script, img.shotId, shot?.videoPrompt || img.prompt);
          const stamped = stampNodePrompt(shot?.videoPrompt || img.prompt, refs);
          if (!vid) {
            vid = get().addNode(
              "video",
              { x: board.position.x + 268, y: board.position.y },
              {
                kind: "video",
                title: `${img.title}`,
                shotId: img.shotId,
                url: "",
                prompt: stamped,
                duration: shot?.duration || 6,
                model: opts?.model,
                quality: opts?.quality,
                width: opts?.width,
                height: opts?.height,
                status: "idle",
              } as VideoData,
            );
            set({ edges: addEdge({ id: nid(), source: board.id, target: vid }, get().edges) });
          } else {
            get().updateNode(vid, {
              prompt: stamped,
              model: opts?.model,
              quality: opts?.quality,
              width: opts?.width,
              height: opts?.height,
            } as Partial<VideoData>);
          }
          vids.push(vid);
        }
        get().setToast(`已创建 ${vids.length} 个视频位（H3）`);
        const online = await api.comfyStatus().then((r) => r.ok).catch(() => false);
        if (!online) {
          get().setToast("视频节点已铺好。云端没开，开机后再生成");
          set({ batch: "" });
          return;
        }
        set({ batch: "videos" });
        let ok = 0;
        let fail = 0;
        for (const vid of vids) {
          const v = get().nodes.find((n) => n.id === vid);
          if (v?.data.kind === "video" && v.data.url) {
            ok += 1;
            continue;
          }
          await get().generateVideo(vid);
          const after = get().nodes.find((n) => n.id === vid);
          if (after?.data.kind === "video" && after.data.url) ok += 1;
          else fail += 1;
        }
        set({ batch: "" });
        get().setToast(fail ? `视频出完 ${ok} 条，失败 ${fail} 条` : `视频 ${ok} 条已出完`);
        const spoken = script.script.shots.filter((s) => spokenLine(s.dialogue) && (!opts?.ids?.length || opts.ids.includes(s.id)));
        if (spoken.length) {
          await get().generateAudios(id, { ids: spoken.map((s) => s.id) });
        }
      },
      generateImage: async (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.data.kind !== "image") return;
        const refs = get().shotMedia(id).images.slice(0, 3);
        const prompt = stampNodePrompt(node.data.prompt.trim(), refs);
        if (!prompt) {
          get().setToast("还没有提示词。先在脚本生成器里合成提示词");
          return;
        }
        const [dw, dh] = sizeOf(get().bible.aspect);
        const w = node.data.width || dw;
        const h = node.data.height || dh;
        const model = node.data.model || get().catalog.t2iModel;
        get().updateNode(id, { status: "running", error: "" } as Partial<ImageData>);
        get().setBusy(`出图 ${node.data.title}…`);
        try {
          const out = await api.generateImage({
            prompt: bindAtToSlots(prompt, refs),
            negative: node.data.negative,
            width: w,
            height: h,
            images: refs,
            model,
            steps: stepsOf(node.data.quality, "image"),
          });
          const media = out.media?.find((m: { kind: string }) => m.kind === "image") || out.media?.[0];
          get().updateNode(id, {
            status: "done",
            url: media?.url || "",
            usedModel: model,
            usedRefs: refs,
            width: w,
            height: h,
          } as Partial<ImageData>);
          if (!get().batch) get().setToast(`${node.data.title} 出图完成`);
        } catch (e) {
          const msg = genFail(e);
          get().updateNode(id, { status: "error", error: msg, usedModel: model, usedRefs: refs, width: w, height: h } as Partial<ImageData>);
          get().setToast(msg);
        } finally {
          get().setBusy("");
        }
      },
      generateVideo: async (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.data.kind !== "video") return;
        const mediaRefs = get().shotMedia(id);
        const prompt = stampNodePrompt(node.data.prompt.trim(), mediaRefs.images);
        const [dw, dh] = sizeOf(get().bible.aspect, "video");
        const model = node.data.model || get().catalog.i2vModel;
        const h3 = /h3|minimax/i.test(model);
        const duration = h3 ? 6 : node.data.duration || 6;
        const w = h3 ? node.data.width || 1344 : node.data.width || dw;
        const h = h3 ? node.data.height || 768 : node.data.height || dh;
        get().updateNode(id, { prompt, status: "running", error: "", duration } as Partial<VideoData>);
        get().setBusy(`出视频 ${node.data.title}…`);
        try {
          const out = await api.generateVideo({
            prompt: bindAtToSlots(prompt, mediaRefs.images) || "cinematic motion, silent, no speech, no on-screen text",
            duration,
            width: w,
            height: h,
            images: mediaRefs.images,
            videos: mediaRefs.videos,
            model,
            steps: stepsOf(node.data.quality, "video"),
          });
          const media = out.media?.find((m: { kind: string }) => m.kind === "video") || out.media?.[0];
          get().updateNode(id, {
            status: "done",
            url: media?.url || "",
            usedModel: model,
            usedRefs: mediaRefs.images,
            width: w,
            height: h,
          } as Partial<VideoData>);
          if (!get().batch) get().setToast(`${node.data.title} 出完了`);
        } catch (e) {
          const msg = genFail(e);
          get().updateNode(id, {
            status: "error",
            error: msg,
            usedModel: model,
            usedRefs: mediaRefs.images,
            width: w,
            height: h,
          } as Partial<VideoData>);
          if (!get().batch) get().setToast(msg);
        } finally {
          get().setBusy("");
        }
      },
      generateAudios: async (id, opts) => {
        const node = get().nodes.find((n) => n.id === id);
        const d = asScript(node);
        if (!node || !d) return;
        const shots = d.script.shots.filter((s) => spokenLine(s.dialogue) && (!opts?.ids?.length || opts.ids.includes(s.id)));
        if (!shots.length) {
          get().setToast("这些镜头没有对白。把台词写进对白栏");
          return;
        }
        const ids: string[] = [];
        for (const shot of shots) {
          const line = spokenLine(shot.dialogue);
          let audio = get().nodes.find((n) => n.data.kind === "audio" && n.data.shotId === shot.id);
          if (!audio) {
            const vid = get().nodes.find((n) => n.data.kind === "video" && n.data.shotId === shot.id);
            const img = get().nodes.find((n) => n.data.kind === "image" && n.data.shotId === shot.id);
            const src = vid || img || node;
            const aid = get().addNode(
              "audio",
              { x: src.position.x + 268, y: src.position.y },
              {
                kind: "audio",
                title: `配音 镜${shot.id}`,
                shotId: shot.id,
                url: "",
                prompt: line,
                voice: get().catalog.ttsVoice || "clone",
                status: "idle",
              } as AudioData,
            );
            set({ edges: addEdge({ id: nid(), source: src.id, target: aid }, get().edges) });
            audio = get().nodes.find((n) => n.id === aid);
          } else if (audio.data.kind === "audio" && !audio.data.prompt) {
            get().updateNode(audio.id, { prompt: line } as Partial<AudioData>);
          }
          if (audio) ids.push(audio.id);
        }
        const needRef = (get().catalog.ttsVoice || "clone") === "clone" && !get().catalog.ttsRefUrl;
        if (needRef) {
          get().setToast(`已铺 ${ids.length} 个配音节点。仿声先去设置上传参考人声，再点节点生成`);
          return;
        }
        set({ batch: "audios" });
        let ok = 0;
        let fail = 0;
        for (const aid of ids) {
          const a = get().nodes.find((n) => n.id === aid);
          if (a?.data.kind === "audio" && a.data.url) {
            ok += 1;
            continue;
          }
          await get().generateAudio(aid);
          const after = get().nodes.find((n) => n.id === aid);
          if (after?.data.kind === "audio" && after.data.url) ok += 1;
          else fail += 1;
        }
        set({ batch: "" });
        get().setToast(fail ? `配音出完 ${ok} 条，失败 ${fail} 条` : `配音 ${ok} 条已出完`);
      },
      generateAudio: async (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.data.kind !== "audio") return;
        const prompt = node.data.prompt.trim() || get().incomingText(id).trim();
        if (!prompt) {
          get().setToast("先写要对的台词，或从视频节点拉出配音");
          return;
        }
        const voice = node.data.voice || get().catalog.ttsVoice || "clone";
        const backend = node.data.backend || get().catalog.ttsBackend || "auto";
        const refUrl = node.data.refUrl || get().catalog.ttsRefUrl;
        const refText = node.data.refText || get().catalog.ttsRefText;
        if (voice === "clone" && !refUrl) {
          get().setToast("仿声要先在设置里上传一段参考人声，像 GPT-SoVITS 那样");
          return;
        }
        const provider = voice === "clone" ? (get().catalog.ttsProvider || "qwen") : /long/.test(voice) ? "qwen" : "openai";
        get().updateNode(id, { status: "running", error: "", prompt } as Partial<AudioData>);
        get().setBusy(`配音 ${node.data.title}…`);
        try {
          const out = await api.generateAudio({ prompt, voice, provider, backend, refUrl, refText });
          const media = out.media?.find((m: { kind: string }) => m.kind === "audio") || out.media?.[0];
          get().updateNode(id, { status: "done", url: media?.url || "", error: "" } as Partial<AudioData>);
          get().setToast(`${node.data.title} 配音完成`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "配音失败";
          get().updateNode(id, { status: "error", error: msg } as Partial<AudioData>);
          get().setToast(msg);
        } finally {
          get().setBusy("");
        }
      },
      optimizeH3: async (scriptId, ids) => {
        const d = asScript(get().nodes.find((n) => n.id === scriptId));
        if (!d?.script.shots.length) {
          get().setToast("还没有镜头");
          return;
        }
        const picks = ids?.length ? d.script.shots.filter((s) => ids.includes(s.id)) : d.script.shots;
        get().setBusy("正在按 MiniMax H3 改视频提示词…");
        try {
          const result = await api.optimizeH3(
            {
              shots: picks.map((s) => ({
                id: s.id,
                action: s.action,
                scene: s.scene,
                camera: s.camera,
                shotScale: s.shotScale,
                videoPrompt: s.videoPrompt,
                imagePrompt: s.imagePrompt,
                dialogue: s.dialogue,
              })),
              assets: (d.assets || [])
                .filter((a) => a.name && !/^新(角色|场景|道具)$/.test(a.name))
                .map((a) => ({ kind: a.kind, name: a.name })),
              bible: bibleText(get().bible),
            },
            { provider: get().catalog.llmProvider as LlmProvider, model: get().catalog.llmModel },
          );
          const map = new Map((result.shots || []).map((s) => [String(s.id).padStart(2, "0"), s]));
          get().updateNode(scriptId, {
            script: {
              ...d.script,
              shots: d.script.shots.map((s) => {
                if (ids?.length && !ids.includes(s.id)) return s;
                const hit = map.get(s.id) || map.get(String(Number(s.id)));
                return hit?.videoPrompt ? { ...s, videoPrompt: hit.videoPrompt } : s;
              }),
            },
          } as Partial<ScriptData>);
          get().bindShotAssets(scriptId);
          const bound = asScript(get().nodes.find((n) => n.id === scriptId));
          if (bound) {
            set({
              nodes: get().nodes.map((n) => {
                if (n.data.kind !== "video") return n;
                const vid = n.data;
                if (!vid.shotId) return n;
                if (ids?.length && !ids.includes(vid.shotId)) return n;
                const shot = bound.script.shots.find((s) => s.id === vid.shotId);
                return shot?.videoPrompt ? { ...n, data: { ...vid, prompt: shot.videoPrompt } } : n;
              }),
            });
          }
          get().setToast("已按 MiniMax H3 改好视频提示词。出视频会更稳");
        } catch (e) {
          get().setToast(e instanceof Error ? e.message : "H3 优化失败");
        } finally {
          get().setBusy("");
        }
      },
}));

let canvasReady = false;
let saveTimer: number | undefined;

export async function hydrateCanvas() {
  for (const key of ["jingchang-v2", "jingchang-v3", "jingchang-v4", "jingchang-v5"]) {
    localStorage.removeItem(key);
  }
  try {
    const list = await api.listCanvases();
    useStudio.setState({
      nodes: [],
      edges: [],
      bible: defaultBible(),
      canvasId: null,
      scriptFull: "",
      history: list.items || [],
    });
  } finally {
    canvasReady = true;
    void useStudio.getState().loadCatalog();
  }
}

useStudio.subscribe((s, prev) => {
  if (!canvasReady) return;
  if (s.nodes === prev.nodes && s.edges === prev.edges && s.bible === prev.bible) return;
  if (!s.nodes.length && !s.canvasId) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const cur = useStudio.getState();
    if (!cur.nodes.length && !cur.canvasId) return;
    void api.saveCanvas({ id: cur.canvasId, nodes: cur.nodes, edges: cur.edges, bible: cur.bible }).then((r) => {
      const patch: Partial<typeof cur> = {};
      if (r.items) patch.history = r.items;
      if (r.id && r.id !== cur.canvasId) patch.canvasId = r.id;
      if (Object.keys(patch).length) useStudio.setState(patch);
    });
  }, 500);
});
