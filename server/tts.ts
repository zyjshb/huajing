import fs from "fs";
import path from "path";

export type TtsHit = { name: string; label: string };

const CLONE_NAMES = [
  "GPT_SOVITS_TTS",
  "GPT_SOVITS_INFER",
  "GPT_SoVITS_TTS",
  "GPTSoVITSTTS",
  "IndexTTS2Run",
  "IndexTTSRun",
  "IndexTTS2Generate",
  "IndexTTS",
  "CosyVoiceNode",
  "CosyVoiceSampler",
  "FishSpeechTTS",
  "F5TTSAudio",
];

type NodeDef = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};

function fieldsOf(def: NodeDef) {
  return { ...(def.input?.required || {}), ...(def.input?.optional || {}) };
}

function comboFirst(spec: unknown) {
  if (!Array.isArray(spec)) return undefined;
  const kind = spec[0];
  if (Array.isArray(kind) && kind.length) return kind[0];
  if (spec[1] && typeof spec[1] === "object" && spec[1] !== null && "default" in spec[1]) {
    return (spec[1] as { default?: unknown }).default;
  }
  return undefined;
}

function pickField(keys: Record<string, unknown>, tests: RegExp[], skip?: RegExp) {
  return Object.keys(keys).find((k) => tests.some((t) => t.test(k)) && (!skip || !skip.test(k)));
}

async function probe(comfy: string, name: string): Promise<NodeDef | null> {
  try {
    const r = await fetch(`${comfy}/object_info/${encodeURIComponent(name)}`);
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, NodeDef>;
    return data[name] || Object.values(data)[0] || null;
  } catch {
    return null;
  }
}

export async function scanTts(comfyUrl: string): Promise<{ ok: boolean; node: string; label: string; error?: string }> {
  const comfy = comfyUrl.replace(/\/$/, "");
  try {
    const ping = await fetch(`${comfy}/system_stats`);
    if (!ping.ok) throw new Error("down");
  } catch {
    return { ok: false, node: "", label: "", error: "Comfy 未开" };
  }
  for (const name of CLONE_NAMES) {
    const def = await probe(comfy, name);
    if (!def) continue;
    const keys = fieldsOf(def);
    const hasText = pickField(keys, [/^text$/i, /content/, /tts_text/], /prompt_text|refer_text|prompt_language/);
    const hasAudio = pickField(keys, [/audio/, /refer/, /ref/, /prompt_wav/, /speaker/]);
    if (hasText && hasAudio) {
      const label = /sovits/i.test(name) ? `本机 GPT-SoVITS · ${name}` : /index/i.test(name) ? `本机 IndexTTS · ${name}` : `本机仿声 · ${name}`;
      return { ok: true, node: name, label };
    }
  }
  return { ok: false, node: "", label: "", error: "没扫到 GPT-SoVITS / IndexTTS / CosyVoice 节点。装自定义节点后重扫，或走云端仿声。" };
}

function langOf(text: string) {
  return /[\u4e00-\u9fff]/.test(text) ? "中文" : "英文";
}

export async function runComfyClone(opts: {
  comfyUrl: string;
  text: string;
  refPath: string;
  refName: string;
  refText?: string;
  uploadDir: string;
  uploadToComfy: (comfy: string, file: { name: string; url: string }) => Promise<string>;
  waitHistory: (comfy: string, id: string) => Promise<Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>>>;
  collectOutputs: (
    comfy: string,
    outputs: Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>>,
  ) => Promise<{ url: string; name: string; kind: string }[]>;
}) {
  const comfy = opts.comfyUrl.replace(/\/$/, "");
  const scanned = await scanTts(comfy);
  if (!scanned.ok) throw new Error(scanned.error || "本机没有仿声节点");
  const def = await probe(comfy, scanned.node);
  if (!def) throw new Error(`找不到节点 ${scanned.node}`);
  const keys = fieldsOf(def);
  const textKey = pickField(keys, [/^text$/i, /tts_text/, /content/, /prompt$/], /prompt_text|refer_text|prompt_language|text_language/) || "text";
  const promptTextKey = pickField(keys, [/prompt_text/, /refer_text/, /ref_text/]);
  const audioKey = pickField(keys, [/^audio$/i, /refer_audio/, /ref_audio/, /prompt_wav/, /prompt_audio/, /speaker_audio/, /reference/]) || "audio";
  const textLangKey = pickField(keys, [/text_language/, /language$/], /prompt_language/);
  const promptLangKey = pickField(keys, [/prompt_language/, /refer_language/]);

  if (!fs.existsSync(opts.refPath)) throw new Error("找不到仿声参考音频。先在设置里上传一段人声");
  const uploaded = await opts.uploadToComfy(comfy, { name: opts.refName, url: `/files/${path.basename(opts.refPath)}` });

  const loadId = "10";
  const ttsId = "20";
  const saveId = "30";
  const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    [loadId]: { class_type: "LoadAudio", inputs: { audio: uploaded } },
    [ttsId]: { class_type: scanned.node, inputs: {} },
    [saveId]: { class_type: "SaveAudio", inputs: { audio: [ttsId, 0], filename_prefix: "jc_tts" } },
  };

  const inputs = workflow[ttsId].inputs;
  for (const [k, spec] of Object.entries(keys)) {
    const defVal = comboFirst(spec);
    if (defVal !== undefined) inputs[k] = defVal;
  }
  inputs[textKey] = opts.text;
  inputs[audioKey] = [loadId, 0];
  if (promptTextKey) inputs[promptTextKey] = opts.refText || opts.text.slice(0, 80);
  const zh = langOf(opts.text);
  if (textLangKey) inputs[textLangKey] = comboFirst(keys[textLangKey]) || zh;
  if (promptLangKey) inputs[promptLangKey] = comboFirst(keys[promptLangKey]) || zh;

  const queued = await fetch(`${comfy}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const q = (await queued.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!queued.ok || !q.prompt_id) {
    const nodeErr = q.node_errors;
    if (nodeErr && typeof nodeErr === "object") {
      const parts = Object.values(nodeErr as Record<string, { errors?: { message?: string }[] }>).flatMap((v) =>
        (v.errors || []).map((e) => e.message || ""),
      );
      if (parts.length) throw new Error(parts.filter(Boolean).join("；"));
    }
    throw new Error("本机仿声提交失败。确认 Comfy 已装 GPT-SoVITS 或 IndexTTS");
  }
  const outputs = await opts.waitHistory(comfy, q.prompt_id);
  const media = await opts.collectOutputs(comfy, outputs);
  const audio = media.find((m) => m.kind === "audio") || media[0];
  if (!audio?.url) throw new Error("本机仿声没有返回音频");
  return audio;
}
