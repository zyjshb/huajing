import type { LlmProvider } from "./models";

export async function getSettings() {
  const r = await fetch("/api/settings");
  return r.json();
}

export async function saveSettings(body: Record<string, unknown>) {
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function comfyStatus() {
  const r = await fetch("/api/comfy/status");
  return r.json() as Promise<{ ok: boolean; error?: string; url?: string; t2iModel?: string; i2vModel?: string }>;
}

export async function getComfyModels() {
  const r = await fetch("/api/comfy/models");
  return r.json() as Promise<{
    ok: boolean;
    error?: string;
    image: { file: string; label: string; family: string }[];
    video: { file: string; label: string; family: string }[];
    extras: string[];
    t2iModel: string;
    i2vModel: string;
    tts?: { ok: boolean; node: string; label: string; error?: string };
    ttsBackend?: string;
    ttsRefUrl?: string;
    ttsRefText?: string;
    ttsVoice?: string;
  }>;
}

export async function pickComfyModels(body: { t2iModel?: string; i2vModel?: string }) {
  const r = await fetch("/api/comfy/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function getCanvas() {
  const r = await fetch("/api/canvas");
  return r.json() as Promise<{
    nodes?: unknown[];
    edges?: unknown[];
    bible?: Record<string, unknown> | null;
  }>;
}

export type CanvasMeta = { id: string; title: string; updatedAt: number; nodes: number };

export async function listCanvases() {
  const r = await fetch("/api/canvases");
  return r.json() as Promise<{ items: CanvasMeta[] }>;
}

export async function loadCanvas(id: string) {
  const r = await fetch(`/api/canvases/${id}`);
  if (!r.ok) throw new Error("画布不存在");
  return r.json() as Promise<{
    nodes?: unknown[];
    edges?: unknown[];
    bible?: Record<string, unknown> | null;
  }>;
}

export async function deleteCanvas(id: string) {
  const r = await fetch(`/api/canvases/${id}`, { method: "DELETE" });
  return r.json() as Promise<{ ok: boolean; items: CanvasMeta[] }>;
}

export async function saveCanvas(body: { id?: string | null; nodes: unknown; edges: unknown; bible: unknown }) {
  const r = await fetch("/api/canvas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<{ ok: boolean; id: string | null; items: CanvasMeta[] }>;
}

export async function uploadFiles(files: FileList | File[]) {
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("files", f);
  const r = await fetch("/api/assets", { method: "POST", body: fd });
  return r.json() as Promise<{ id: string; name: string; url: string; mime: string }[]>;
}

export async function uploadWorkflow(kind: "t2i" | "i2v", file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`/api/workflows/${kind}`, { method: "POST", body: fd });
  return r.json();
}

type LlmOpt = { provider?: LlmProvider; model?: string };

export async function textToScript(text: string, bible: string, llm?: LlmOpt) {
  const r = await fetch("/api/llm/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, bible, ...llm }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "拆脚本失败");
  return data.script;
}

export async function synthesizePrompts(
  body: { shots: unknown; assets: unknown; globalStyle?: string; bible?: string },
  llm?: LlmOpt,
) {
  const r = await fetch("/api/llm/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...llm }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "合成提示词失败");
  return data.result as { shots: { id: string; imagePrompt: string; videoPrompt: string }[] };
}

export async function imageToPrompt(shot: string, bible: string, imageUrl?: string, llm?: LlmOpt) {
  const r = await fetch("/api/llm/image-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shot, bible, imageUrl, ...llm }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "写提示词失败");
  return data.prompt as { imagePrompt: string; videoPrompt: string; negative: string };
}

export async function optimizeH3(
  body: { shots: unknown; assets?: unknown; bible?: string },
  llm?: LlmOpt,
) {
  const r = await fetch("/api/llm/h3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...llm }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "H3 优化失败");
  return data.result as { shots: { id: string; videoPrompt: string }[] };
}

export async function generateAudio(body: Record<string, unknown>) {
  const r = await fetch("/api/generate/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "配音失败");
  return data;
}

export async function generateImage(body: Record<string, unknown>) {
  const r = await fetch("/api/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "生图失败");
  return data;
}

export async function generateVideo(body: Record<string, unknown>) {
  const r = await fetch("/api/generate/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "出镜头失败");
  return data;
}
