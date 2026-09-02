import fs from "fs";
import path from "path";

export type KeyBag = Record<string, string>;

function need(keys: KeyBag, name: string, label: string) {
  const key = keys[name];
  if (!key) throw new Error(`先在设置里填 ${label} 的 API Key`);
  return key;
}

async function saveBytes(uploadDir: string, buf: Buffer, ext: string, prefix: string) {
  const name = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  return { url: `/files/${name}`, name };
}

async function fetchJson(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(err?.message || (typeof data.message === "string" ? data.message : text.slice(0, 240)) || `HTTP ${r.status}`);
  }
  return data;
}

function sizeLabel(width?: number, height?: number) {
  const w = width || 1280;
  const h = height || 720;
  if (Math.abs(w / h - 1) < 0.08) return "1024x1024";
  if (h > w) return "1024x1792";
  return "1792x1024";
}

export async function generateCloudImage(opts: {
  keys: KeyBag;
  provider: string;
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  uploadDir: string;
}) {
  const { keys, provider, model, prompt, width, height, uploadDir } = opts;
  if (provider === "openai") {
    const key = need(keys, "openai", "ChatGPT");
    const data = await fetchJson("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || "gpt-image-1", prompt, size: sizeLabel(width, height), n: 1 }),
    });
    return saveImagePayload(data, uploadDir, "openai");
  }
  if (provider === "grok") {
    const key = need(keys, "grok", "Grok");
    const data = await fetchJson("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || "grok-2-image", prompt, n: 1 }),
    });
    return saveImagePayload(data, uploadDir, "grok");
  }
  if (provider === "doubao") {
    const key = need(keys, "doubao", "豆包");
    const data = await fetchJson("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model || "doubao-seedream-4-0-250828",
        prompt,
        size: `${width || 1280}x${height || 720}`,
        response_format: "b64_json",
        watermark: false,
      }),
    });
    return saveImagePayload(data, uploadDir, "doubao");
  }
  if (provider === "qwen") {
    const key = need(keys, "qwen", "通义千问");
    const data = await fetchJson("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model || "qwen-image-plus",
        input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
        parameters: { size: `${width || 1280}x${height || 720}`, n: 1, prompt_extend: true },
      }),
    });
    return saveQwenImage(data, uploadDir);
  }
  if (provider === "gemini") {
    const key = need(keys, "gemini", "Gemini");
    const used = model || "gemini-2.5-flash-image";
    const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${used}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });
    return saveGeminiImage(data, uploadDir);
  }
  throw new Error(`还不支持 ${provider} 出图`);
}

function b64toBuf(raw: string) {
  return Buffer.from(raw.replace(/^data:image\/\w+;base64,/, ""), "base64");
}

async function saveImagePayload(data: Record<string, unknown>, uploadDir: string, prefix: string) {
  const list = (data.data as { b64_json?: string; url?: string }[]) || [];
  const first = list[0];
  if (first?.b64_json) return saveBytes(uploadDir, b64toBuf(first.b64_json), "png", prefix);
  if (first?.url) {
    const r = await fetch(first.url);
    const buf = Buffer.from(await r.arrayBuffer());
    return saveBytes(uploadDir, buf, "png", prefix);
  }
  throw new Error("云端出图没有返回图片");
}

async function saveQwenImage(data: Record<string, unknown>, uploadDir: string) {
  const output = data.output as { choices?: { message?: { content?: { image?: string; url?: string }[] } }[] } | undefined;
  const part = output?.choices?.[0]?.message?.content?.find((c) => c.image || c.url);
  if (part?.image) return saveBytes(uploadDir, b64toBuf(part.image), "png", "qwen");
  if (part?.url) {
    const r = await fetch(part.url);
    return saveBytes(uploadDir, Buffer.from(await r.arrayBuffer()), "png", "qwen");
  }
  return saveImagePayload(data, uploadDir, "qwen");
}

async function saveGeminiImage(data: Record<string, unknown>, uploadDir: string) {
  const cands = data.candidates as { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] | undefined;
  const inline = cands?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini 没有返回图片。确认模型支持出图，并且 Key 可用");
  const ext = inline.mimeType?.includes("jpeg") ? "jpg" : "png";
  return saveBytes(uploadDir, Buffer.from(inline.data, "base64"), ext, "gemini");
}

export async function generateCloudSpeech(opts: {
  keys: KeyBag;
  provider: string;
  voice: string;
  text: string;
  uploadDir: string;
}) {
  const { keys, provider, voice, text, uploadDir } = opts;
  if (!text.trim()) throw new Error("先写要对的那句台词");
  if (provider === "qwen") {
    const key = need(keys, "qwen", "通义千问");
    const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-DashScope-Async": "disable",
      },
      body: JSON.stringify({
        model: "cosyvoice-v2",
        input: { text, voice: voice || "longxiaochun" },
        parameters: { format: "mp3" },
      }),
    });
    const ctype = r.headers.get("content-type") || "";
    if (!r.ok) {
      const err = await r.text();
      throw new Error(err.slice(0, 240) || `千问配音 ${r.status}`);
    }
    if (ctype.includes("json")) {
      const data = (await r.json()) as { output?: { audio?: { url?: string; data?: string } } };
      const audio = data.output?.audio;
      if (audio?.data) return saveBytes(uploadDir, Buffer.from(audio.data, "base64"), "mp3", "tts");
      if (audio?.url) {
        const file = await fetch(audio.url);
        return saveBytes(uploadDir, Buffer.from(await file.arrayBuffer()), "mp3", "tts");
      }
      throw new Error("千问配音没有返回音频");
    }
    return saveBytes(uploadDir, Buffer.from(await r.arrayBuffer()), "mp3", "tts");
  }
  const key = need(keys, "openai", "ChatGPT");
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: voice || "onyx",
      input: text,
    }),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 240) || `配音 ${r.status}`);
  return saveBytes(uploadDir, Buffer.from(await r.arrayBuffer()), "mp3", "tts");
}

function mimeOf(file: string) {
  if (/\.wav$/i.test(file)) return "audio/wav";
  if (/\.m4a$/i.test(file)) return "audio/mp4";
  return "audio/mpeg";
}

function dataUrlOf(filePath: string) {
  const buf = fs.readFileSync(filePath);
  return `data:${mimeOf(filePath)};base64,${buf.toString("base64")}`;
}

export async function enrollQwenVoice(opts: { key: string; filePath: string; transcript?: string }) {
  const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
    body: JSON.stringify({
      model: "qwen-voice-enrollment",
      input: {
        action: "create",
        target_model: "qwen3-tts-vc-realtime-2026-01-15",
        preferred_name: "jcvoice",
        language: "zh",
        audio: { data: dataUrlOf(opts.filePath) },
        ...(opts.transcript ? { text: opts.transcript } : {}),
      },
    }),
  });
  const data = (await r.json()) as { output?: { voice?: string; voice_id?: string; target_model?: string }; message?: string; code?: string };
  if (!r.ok) throw new Error(data.message || data.code || `千问仿声登记 ${r.status}`);
  const voice = data.output?.voice || data.output?.voice_id;
  if (!voice) throw new Error("千问没有返回仿声音色 ID");
  return { voice, model: data.output?.target_model || "qwen3-tts-vc-realtime-2026-01-15" };
}

async function synthQwenCloned(opts: { key: string; text: string; voice: string; model: string; uploadDir: string }) {
  const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
    body: JSON.stringify({
      model: opts.model || "qwen3-tts-vc-realtime-2026-01-15",
      input: { text: opts.text, voice: opts.voice },
      parameters: { format: "mp3" },
    }),
  });
  const ctype = r.headers.get("content-type") || "";
  if (!r.ok) throw new Error((await r.text()).slice(0, 240) || `千问仿声 ${r.status}`);
  if (ctype.includes("json")) {
    const data = (await r.json()) as { output?: { audio?: { url?: string; data?: string } } };
    const audio = data.output?.audio;
    if (audio?.data) return saveBytes(opts.uploadDir, Buffer.from(audio.data, "base64"), "mp3", "clone");
    if (audio?.url) {
      const file = await fetch(audio.url);
      return saveBytes(opts.uploadDir, Buffer.from(await file.arrayBuffer()), "mp3", "clone");
    }
    throw new Error("千问仿声没有返回音频");
  }
  return saveBytes(opts.uploadDir, Buffer.from(await r.arrayBuffer()), "mp3", "clone");
}

function minimaxHosts() {
  return ["https://api.minimax.chat/v1", "https://api.minimaxi.com/v1", "https://api.minimax.io/v1"];
}

async function minimaxUpload(key: string, filePath: string) {
  const buf = fs.readFileSync(filePath);
  let last = "";
  for (const host of minimaxHosts()) {
    const form = new FormData();
    form.append("purpose", "voice_clone");
    form.append("file", new Blob([new Uint8Array(buf)]), path.basename(filePath));
    const r = await fetch(`${host}/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const data = (await r.json()) as { file?: { file_id?: number | string }; base_resp?: { status_msg?: string }; file_id?: string };
    if (r.ok && (data.file?.file_id || data.file_id)) return { host, fileId: String(data.file?.file_id || data.file_id) };
    last = data.base_resp?.status_msg || `MiniMax 上传 ${r.status}`;
  }
  throw new Error(last || "MiniMax 上传参考音频失败");
}

export async function enrollMinimaxVoice(opts: { key: string; filePath: string; voiceId: string; transcript?: string }) {
  const up = await minimaxUpload(opts.key, opts.filePath);
  const r = await fetch(`${up.host}/voice_clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
    body: JSON.stringify({
      file_id: Number(up.fileId) || up.fileId,
      voice_id: opts.voiceId,
      ...(opts.transcript ? { text: opts.transcript, model: "speech-02-hd" } : {}),
    }),
  });
  const data = (await r.json()) as { base_resp?: { status_code?: number; status_msg?: string }; input_sensitive?: boolean };
  if (!r.ok || (data.base_resp?.status_code && data.base_resp.status_code !== 0)) {
    throw new Error(data.base_resp?.status_msg || `MiniMax 仿声 ${r.status}`);
  }
  return { voice: opts.voiceId, host: up.host };
}

async function synthMinimax(opts: { key: string; host?: string; text: string; voice: string; uploadDir: string }) {
  const hosts = opts.host ? [opts.host] : minimaxHosts();
  let last = "";
  for (const host of hosts) {
    const r = await fetch(`${host}/t2a_v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
      body: JSON.stringify({
        model: "speech-02-hd",
        text: opts.text,
        stream: false,
        output_format: "hex",
        voice_setting: { voice_id: opts.voice, speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
      }),
    });
    const data = (await r.json()) as { data?: { audio?: string; status?: number }; base_resp?: { status_msg?: string } };
    if (r.ok && data.data?.audio) {
      return saveBytes(opts.uploadDir, Buffer.from(data.data.audio, "hex"), "mp3", "clone");
    }
    last = data.base_resp?.status_msg || `MiniMax 配音 ${r.status}`;
  }
  throw new Error(last || "MiniMax 配音失败");
}

export async function generateClonedSpeech(opts: {
  keys: KeyBag;
  provider: string;
  text: string;
  filePath: string;
  transcript?: string;
  cached?: { voice: string; model?: string; key?: string };
  uploadDir: string;
}) {
  const { keys, provider, text, filePath, transcript, cached, uploadDir } = opts;
  const stamp = `${filePath}:${fs.statSync(filePath).mtimeMs}`;
  if (provider === "minimax" || (!keys.qwen && keys.minimax)) {
    const key = need(keys, "minimax", "MiniMax");
    let voice = cached?.key === stamp ? cached.voice : "";
    if (!voice) {
      const out = await enrollMinimaxVoice({ key, filePath, voiceId: `jc${Date.now().toString(36).slice(-8)}`, transcript });
      voice = out.voice;
    }
    const media = await synthMinimax({ key, text, voice, uploadDir });
    return { ...media, clone: { voice, key: stamp } };
  }
  const key = need(keys, "qwen", "通义千问");
  let voice = cached?.key === stamp ? cached.voice : "";
  let model = cached?.model || "qwen3-tts-vc-realtime-2026-01-15";
  if (!voice) {
    const out = await enrollQwenVoice({ key, filePath, transcript });
    voice = out.voice;
    model = out.model;
  }
  const media = await synthQwenCloned({ key, text, voice, model, uploadDir });
  return { ...media, clone: { voice, model, key: stamp } };
}
