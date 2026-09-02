export type GenQuality = "fast" | "std" | "high";
export type SheetKind = "assets" | "prompts" | "boards" | "videos" | "audios";
export type Sheet = { kind: SheetKind; scriptId: string } | null;

export function bindAtToSlots(prompt: string, refs: { name: string; url: string }[]) {
  let p = prompt || "";
  refs.forEach((r, i) => {
    if (!r.name) return;
    const escaped = r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const slot = `<image ${i + 1}>`;
    p = p.replace(new RegExp(`@${escaped}(?!\\s*<image)`, "g"), `@${r.name} ${slot}`);
  });
  return p;
}

export function spokenLine(raw?: string) {
  const t = (raw || "").trim();
  if (!t || /^(无|无对白|没有对白|无台词|—+|-+)$/.test(t)) return "";
  if (/^音效[：:]/.test(t)) return "";
  const stripped = t.replace(/^[^：:\n]{1,16}[：:]\s*/, "").trim();
  if (!stripped || /^音效[：:]/.test(stripped)) return "";
  return stripped;
}

export function withAtTags(text: string, names: string[]) {
  if (!text) return text;
  let out = text;
  for (const n of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`@?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
    out = out.replace(re, `@${n}`);
  }
  return out;
}

export type NodeKind = "text" | "image" | "video" | "audio" | "script";

export type AssetKind = "character" | "scene" | "prop";

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  prompt: string;
  url: string;
  model?: string;
  width?: number;
  height?: number;
  quality?: GenQuality;
  status: "idle" | "running" | "done" | "error";
  error?: string;
};

export type Shot = {
  id: string;
  time: string;
  duration: number;
  scene: string;
  action: string;
  shotScale: string;
  lighting: string;
  dialogue: string;
  sfx: string;
  camera: string;
  carryIn: string;
  carryOut: string;
  imagePrompt: string;
  videoPrompt: string;
};

export type ScriptPayload = {
  title: string;
  logline: string;
  style: string;
  aspect: string;
  shots: Shot[];
};

export type TextData = { kind: "text"; title: string; body: string };
export type MediaRef = { name: string; url: string };

export type ImageData = {
  kind: "image";
  title: string;
  shotId?: string;
  url: string;
  prompt: string;
  negative: string;
  model?: string;
  width?: number;
  height?: number;
  quality?: GenQuality;
  usedModel?: string;
  usedRefs?: MediaRef[];
  extraRefs?: MediaRef[];
  status: "idle" | "running" | "done" | "error";
  error?: string;
};
export type VideoData = {
  kind: "video";
  title: string;
  shotId?: string;
  url: string;
  prompt: string;
  duration: number;
  model?: string;
  width?: number;
  height?: number;
  quality?: GenQuality;
  usedModel?: string;
  usedRefs?: MediaRef[];
  extraRefs?: MediaRef[];
  status: "idle" | "running" | "done" | "error";
  error?: string;
};
export type AudioData = {
  kind: "audio";
  title: string;
  shotId?: string;
  url: string;
  prompt: string;
  voice?: string;
  model?: string;
  backend?: "auto" | "comfy" | "cloud";
  refUrl?: string;
  refText?: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
};
export type ScriptData = {
  kind: "script";
  title: string;
  draft: string;
  script: ScriptPayload;
  selected: string[];
  step: 1 | 2 | 3;
  globalStyle: string;
  assets: Asset[];
  promptsReady: boolean;
  refs: { name: string; url: string }[];
};

export type NodeData = TextData | ImageData | VideoData | AudioData | ScriptData;

export type Bible = {
  title: string;
  aspect: "16:9" | "9:16" | "1:1";
  duration: number;
  style: string;
  forbid: string;
  notes: string;
};

export const emptyShot = (id: string): Shot => ({
  id,
  time: "",
  duration: 6,
  scene: "",
  action: "",
  shotScale: "",
  lighting: "",
  dialogue: "",
  sfx: "",
  camera: "",
  carryIn: "",
  carryOut: "",
  imagePrompt: "",
  videoPrompt: "",
});

export const emptyAsset = (kind: AssetKind, name = ""): Asset => ({
  id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  kind,
  name: name || (kind === "character" ? "新角色" : kind === "scene" ? "新场景" : "新道具"),
  prompt: "",
  url: "",
  status: "idle",
});

export const emptyScript = (): ScriptPayload => ({
  title: "未命名",
  logline: "",
  style: "",
  aspect: "9:16",
  shots: [],
});

export const defaultBible = (): Bible => ({
  title: "Untitled",
  aspect: "16:9",
  duration: 6,
  style: "",
  forbid: "",
  notes: "",
});
