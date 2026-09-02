import cors from "cors";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { extractAssets, parseScript } from "../src/importScript.ts";
import { generateCloudImage, generateCloudSpeech, generateClonedSpeech } from "./cloudMedia.ts";
import { runComfyClone, scanTts } from "./tts.ts";
import {
  imageFamily,
  isH3Family,
  isQwenFamily,
  pairLow,
  pickH3Support,
  pickQwenSupport,
  scanComfy,
  videoFamily,
  workflowName,
  type ModelPick,
} from "./comfyModels.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const uploadDir = path.join(dataDir, "uploads");
const workflowDir = path.join(dataDir, "workflows");
const bundledDir = path.join(root, "workflows");
const settingsPath = path.join(dataDir, "settings.json");

const canvasPath = path.join(dataDir, "canvas.json");
const canvasesDir = path.join(dataDir, "canvases");
const libraryPath = path.join(dataDir, "library.json");
const filmScriptPath = path.join(root, "scripts", "够强才配温柔.txt");

type ProviderKeys = {
  gemini: string;
  openai: string;
  anthropic: string;
  deepseek: string;
  openrouter: string;
  grok: string;
  doubao: string;
  qwen: string;
  minimax: string;
};

type Settings = {
  keys: ProviderKeys;
  llmModel: string;
  llmProvider: string;
  visionModel: string;
  comfyUrl: string;
  t2iWorkflow: string;
  i2vWorkflow: string;
  t2iModel: string;
  i2vModel: string;
  ttsProvider: string;
  ttsVoice: string;
  ttsBackend: string;
  ttsRefUrl: string;
  ttsRefText: string;
  ttsCloneVoice: string;
  ttsCloneModel: string;
  ttsCloneKey: string;
  t2iMap: Record<string, string>;
  i2vMap: Record<string, string>;
  customLlms: { provider: string; model: string; label: string }[];
};

const defaultT2iMap = { prompt: "20:text", negative: "21:text", width: "30:width", height: "30:height" };
const defaultI2vMap = {
  prompt: "20:text",
  negative: "21:text",
  image: "30:image",
  width: "40:width",
  height: "40:height",
  duration: "40:length",
};

const h3I2vMap = {
  prompt: "30:prompt",
  width: "30:width",
  height: "30:height",
  duration: "30:length",
};

const qwenT2iMap = { prompt: "20:text", width: "30:width", height: "30:height" };
const qwenEditMap = { prompt: "20:prompt", width: "30:width", height: "30:height" };

const defaultSettings: Settings = {
  keys: { gemini: "", openai: "", anthropic: "", deepseek: "", openrouter: "", grok: "", doubao: "", qwen: "", minimax: "" },
  llmModel: "deepseek-v4-flash",
  llmProvider: "deepseek",
  customLlms: [],
  visionModel: "",
  comfyUrl: "http://127.0.0.1:8188",
  t2iWorkflow: path.join(bundledDir, "镜场_Qwen出图_API.json"),
  i2vWorkflow: path.join(bundledDir, "镜场_H3_参考_API.json"),
  t2iModel: "",
  i2vModel: "",
  ttsProvider: "openai",
  ttsVoice: "clone",
  ttsBackend: "auto",
  ttsRefUrl: "",
  ttsRefText: "",
  ttsCloneVoice: "",
  ttsCloneModel: "",
  ttsCloneKey: "",
  t2iMap: defaultT2iMap,
  i2vMap: h3I2vMap,
};

function readSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Partial<Settings> & {
      llmApiKey?: string;
      llmBaseUrl?: string;
    };
    const keys = { ...defaultSettings.keys, ...(raw.keys || {}) };
    if (raw.llmApiKey && !keys.deepseek) keys.deepseek = raw.llmApiKey;
    return {
      ...defaultSettings,
      ...raw,
      keys,
      t2iMap: isQwenFamily(imageFamily(raw.t2iModel || ""))
        ? imageFamily(raw.t2iModel || "") === "qwen_edit"
          ? { ...qwenEditMap }
          : { ...qwenT2iMap }
        : { ...defaultT2iMap, ...(raw.t2iMap || {}) },
      i2vMap:
        isH3Family(videoFamily(raw.i2vModel || "")) || /H3/.test(String(raw.i2vWorkflow || ""))
          ? { ...h3I2vMap }
          : { ...defaultI2vMap, ...(raw.i2vMap || {}) },
      t2iWorkflow: raw.t2iWorkflow || defaultSettings.t2iWorkflow,
      i2vWorkflow: raw.i2vWorkflow || defaultSettings.i2vWorkflow,
      t2iModel: raw.t2iModel || "",
      i2vModel: raw.i2vModel || "",
      customLlms: Array.isArray(raw.customLlms) ? raw.customLlms : [],
    };
  } catch {
    return structuredClone(defaultSettings);
  }
}

function writeSettings(s: Settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), "utf8");
}

function applyModelPick(s: Settings, image: string, video: string, cat?: { image: ModelPick[]; video: ModelPick[] }) {
  s.t2iModel = image || s.t2iModel;
  s.i2vModel = video || s.i2vModel;
  const imgFam = cat?.image.find((m) => m.file === s.t2iModel)?.family || imageFamily(s.t2iModel) || "qwen";
  const vidFam = cat?.video.find((m) => m.file === s.i2vModel)?.family || videoFamily(s.i2vModel) || "h3_ref2va";
  const customT2i = /[/\\]data[/\\]workflows[/\\]/.test(s.t2iWorkflow);
  const customI2v = /[/\\]data[/\\]workflows[/\\]/.test(s.i2vWorkflow);
  if (!customT2i) s.t2iWorkflow = path.join(bundledDir, workflowName("t2i", imgFam));
  if (!customI2v) s.i2vWorkflow = path.join(bundledDir, workflowName("i2v", vidFam));
  s.t2iMap =
    imgFam === "qwen_edit"
      ? { ...qwenEditMap }
      : imgFam === "qwen"
        ? { ...qwenT2iMap }
        : imgFam === "flux"
          ? { prompt: "20:text", width: "30:width", height: "30:height" }
          : { ...defaultT2iMap };
  s.i2vMap = isH3Family(vidFam) ? { ...h3I2vMap } : { ...defaultI2vMap };
}

function patchWorkflowModels(
  workflow: Record<string, { class_type?: string; inputs: Record<string, unknown> }>,
  kind: "t2i" | "i2v",
  s: Settings,
) {
  if (kind === "t2i" && s.t2iModel) {
    for (const node of Object.values(workflow)) {
      if (node.inputs?.ckpt_name) node.inputs.ckpt_name = s.t2iModel;
      if (node.class_type === "UNETLoader" && node.inputs) node.inputs.unet_name = s.t2iModel;
    }
    return;
  }
  if (kind !== "i2v" || !s.i2vModel) return;
  const unets = Object.values(workflow).filter((n) => n.class_type === "UNETLoader");
  if (unets.length >= 2) {
    unets[0].inputs.unet_name = s.i2vModel;
    unets[1].inputs.unet_name = pairLow(s.i2vModel, []);
  } else if (unets[0]) {
    unets[0].inputs.unet_name = s.i2vModel;
  }
}

function maskKeys(keys: ProviderKeys) {
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v ? "••••" : ""])) as ProviderKeys;
}

function seedFilmCanvas() {
  const raw = fs.readFileSync(filmScriptPath, "utf8").replace(/^\uFEFF/, "");
  const script = parseScript(raw);
  const extra = extractAssets(raw, script);
  const shots = script.shots.map((s) => ({ ...s, imagePrompt: "", videoPrompt: "" }));
  const forbid = ((raw.match(/^禁令[：:]\s*(.+)$/m) || [])[1] || "").trim();
  const canvas = {
    nodes: [
      {
        id: "play-gqt",
        type: "text",
        position: { x: 80, y: 140 },
        data: { kind: "text", title: "够强，才配温柔", body: raw },
      },
      {
        id: "script-gqt",
        type: "script",
        selected: true,
        position: { x: 540, y: 140 },
        data: {
          kind: "script",
          title: "够强，才配温柔",
          draft: raw,
          script: { ...script, shots },
          selected: shots.map((s) => s.id),
          step: 1,
          globalStyle: extra.globalStyle,
          assets: extra.assets,
          promptsReady: false,
          refs: [],
        },
      },
    ],
    edges: [{ id: "e-gqt", source: "play-gqt", target: "script-gqt" }],
    bible: {
      title: "够强，才配温柔",
      aspect: "16:9",
      duration: 6,
      style: extra.globalStyle,
      forbid,
      notes: "",
    },
  };
  fs.writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), "utf8");
  return canvas;
}

function emptyCanvas() {
  return {
    nodes: [],
    edges: [],
    bible: {
      title: "Untitled",
      aspect: "16:9",
      duration: 6,
      style: "",
      forbid: "",
      notes: "",
    },
  };
}

type CanvasDoc = { nodes?: unknown[]; edges?: unknown[]; bible?: unknown };
type CanvasMeta = { id: string; title: string; updatedAt: number; nodes: number };
type Library = { currentId: string | null; items: CanvasMeta[] };

function newCanvasId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function canvasFile(id: string) {
  return path.join(canvasesDir, `${id}.json`);
}

function metaOf(id: string, doc: CanvasDoc): CanvasMeta {
  const bible = doc.bible as { title?: string } | null | undefined;
  return {
    id,
    title: (bible?.title || "Untitled").trim() || "Untitled",
    updatedAt: Date.now(),
    nodes: Array.isArray(doc.nodes) ? doc.nodes.length : 0,
  };
}

function writeLibrary(lib: Library) {
  fs.mkdirSync(canvasesDir, { recursive: true });
  fs.writeFileSync(libraryPath, JSON.stringify(lib, null, 2), "utf8");
}

function migrateLibrary(): Library {
  fs.mkdirSync(canvasesDir, { recursive: true });
  const lib: Library = { currentId: null, items: [] };
  try {
    const old = JSON.parse(fs.readFileSync(canvasPath, "utf8")) as CanvasDoc;
    const nodes = Array.isArray(old.nodes) ? old.nodes : [];
    if (nodes.length) {
      const id = newCanvasId();
      fs.writeFileSync(canvasFile(id), JSON.stringify(old, null, 2), "utf8");
      lib.items.push(metaOf(id, old));
    }
  } catch {
    /* no legacy canvas */
  }
  fs.writeFileSync(canvasPath, JSON.stringify(emptyCanvas(), null, 2), "utf8");
  writeLibrary(lib);
  return lib;
}

function readLibrary(): Library {
  try {
    const raw = JSON.parse(fs.readFileSync(libraryPath, "utf8")) as Library;
    if (!raw || !Array.isArray(raw.items)) return migrateLibrary();
    return { currentId: raw.currentId || null, items: raw.items };
  } catch {
    return migrateLibrary();
  }
}

function upsertMeta(lib: Library, meta: CanvasMeta) {
  const i = lib.items.findIndex((x) => x.id === meta.id);
  if (i >= 0) lib.items[i] = meta;
  else lib.items.unshift(meta);
  lib.items.sort((a, b) => b.updatedAt - a.updatedAt);
}

function readCanvas() {
  return emptyCanvas();
}

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(workflowDir, { recursive: true });
fs.mkdirSync(canvasesDir, { recursive: true });
readLibrary();

const upload = multer({ dest: uploadDir });
const app = express();
app.use(cors());
app.use(express.json({ limit: "32mb" }));
app.use("/files", express.static(uploadDir));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/canvas", (_req, res) => {
  res.json(emptyCanvas());
});

app.put("/api/canvas", (req, res) => {
  const body = req.body as { id?: string | null; nodes?: unknown[]; edges?: unknown[]; bible?: unknown };
  const lib = readLibrary();
  const doc: CanvasDoc = { nodes: body.nodes || [], edges: body.edges || [], bible: body.bible ?? emptyCanvas().bible };
  const empty = !Array.isArray(doc.nodes) || doc.nodes.length === 0;
  fs.writeFileSync(canvasPath, JSON.stringify(emptyCanvas(), null, 2), "utf8");
  if (empty) {
    lib.currentId = null;
    writeLibrary(lib);
    res.json({ ok: true, id: null, items: lib.items });
    return;
  }
  const id = (body.id && String(body.id)) || lib.currentId || newCanvasId();
  fs.writeFileSync(canvasFile(id), JSON.stringify(doc, null, 2), "utf8");
  lib.currentId = id;
  upsertMeta(lib, metaOf(id, doc));
  writeLibrary(lib);
  res.json({ ok: true, id, items: lib.items });
});

app.get("/api/canvases", (_req, res) => {
  res.json({ items: readLibrary().items });
});

app.get("/api/canvases/:id", (req, res) => {
  const id = req.params.id;
  const file = canvasFile(id);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: "画布不存在" });
    return;
  }
  const lib = readLibrary();
  lib.currentId = id;
  writeLibrary(lib);
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});

app.delete("/api/canvases/:id", (req, res) => {
  const id = req.params.id;
  const lib = readLibrary();
  lib.items = lib.items.filter((x) => x.id !== id);
  if (lib.currentId === id) lib.currentId = null;
  writeLibrary(lib);
  try {
    fs.unlinkSync(canvasFile(id));
  } catch {
    /* already gone */
  }
  res.json({ ok: true, items: lib.items });
});

app.get("/api/settings", (_req, res) => {
  const s = readSettings();
  res.json({ ...s, keys: maskKeys(s.keys) });
});

app.post("/api/settings", (req, res) => {
  const prev = readSettings();
  const body = req.body as Partial<Settings>;
  const keys = { ...prev.keys, ...(body.keys || {}) };
  for (const k of Object.keys(keys) as (keyof ProviderKeys)[]) {
    if (keys[k] === "••••") keys[k] = prev.keys[k];
  }
  writeSettings({ ...prev, ...body, keys });
  res.json({ ok: true });
});

app.get("/api/comfy/status", async (_req, res) => {
  const s = readSettings();
  try {
    const r = await fetch(`${s.comfyUrl.replace(/\/$/, "")}/system_stats`);
    if (!r.ok) throw new Error(String(r.status));
    res.json({ ok: true, url: s.comfyUrl, t2iModel: s.t2iModel, i2vModel: s.i2vModel });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : "comfy offline", url: s.comfyUrl });
  }
});

app.get("/api/comfy/models", async (_req, res) => {
  const s = readSettings();
  const keepApi = (s.t2iModel || "").startsWith("api:");
  const cat = await scanComfy(s.comfyUrl, {
    image: keepApi ? undefined : s.t2iModel,
    video: s.i2vModel,
  });
  if (cat.ok && !keepApi && (cat.picked.image !== s.t2iModel || cat.picked.video !== s.i2vModel)) {
    applyModelPick(s, cat.picked.image, cat.picked.video, cat);
    writeSettings(s);
  }
  const tts = cat.ok ? await scanTts(s.comfyUrl) : { ok: false, node: "", label: "", error: cat.error };
  res.json({ ...cat, t2iModel: s.t2iModel, i2vModel: s.i2vModel, llmProvider: s.llmProvider, llmModel: s.llmModel, ttsProvider: s.ttsProvider, ttsVoice: s.ttsVoice, ttsBackend: s.ttsBackend, ttsRefUrl: s.ttsRefUrl, ttsRefText: s.ttsRefText, tts });
});

app.post("/api/comfy/models", (req, res) => {
  const s = readSettings();
  const body = req.body as { t2iModel?: string; i2vModel?: string };
  const t2i = body.t2iModel ?? s.t2iModel;
  if ((t2i || "").startsWith("api:")) {
    s.t2iModel = t2i;
    if (body.i2vModel) applyModelPick(s, s.t2iModel, body.i2vModel);
    writeSettings(s);
  } else {
    applyModelPick(s, t2i, body.i2vModel ?? s.i2vModel);
    writeSettings(s);
  }
  res.json({ ok: true, t2iModel: s.t2iModel, i2vModel: s.i2vModel });
});

app.post("/api/assets", upload.array("files", 24), (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.json(
    files.map((f) => ({
      id: f.filename,
      name: f.originalname,
      url: `/files/${f.filename}`,
      mime: f.mimetype,
    })),
  );
});

app.post("/api/workflows/:kind", upload.single("file"), (req, res) => {
  const kind = req.params.kind;
  if (kind !== "t2i" && kind !== "i2v") {
    res.status(400).json({ error: "kind must be t2i or i2v" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "no file" });
    return;
  }
  const dest = path.join(workflowDir, `${kind}.json`);
  fs.renameSync(req.file.path, dest);
  const s = readSettings();
  if (kind === "t2i") s.t2iWorkflow = dest;
  else s.i2vWorkflow = dest;
  writeSettings(s);
  const parsed = JSON.parse(fs.readFileSync(dest, "utf8"));
  res.json({ ok: true, nodes: summarizeWorkflow(parsed.prompt ?? parsed) });
});

const BREAKDOWN_SYSTEM = `你是短剧分镜导演。把用户剧本拆成「确认镜头」表和「准备资产」清单。
规则：
- 只输出 JSON，不要 markdown
- 这一步不要写最终生图/视频提示词：每镜 imagePrompt、videoPrompt 必须是空字符串
- 镜号从 01 连续；duration 3–8 秒整数
- 每镜字段：id,time,duration,scene,action,shotScale,lighting,dialogue,sfx,camera
- action 只写看得见的画面；shotScale 用近景/特写/中景/全景/大远景/全身景等
- lighting 写光影氛围；sfx 写音效；camera 写运镜
- assets 分 character / scene / prop。角色必须写明成年年龄≥28，禁止未成年外形
- 角色 prompt：白底定妆，左侧近景头像约占 1/3，右侧全身正侧背三视图
- 场景 prompt：空镜布景，不要画角色
- 道具 prompt：静物/产品，白底或场景中的清晰特写
- globalStyle 是全片画风一段话
- 原文已有「镜01」则保留镜数和剧情，只补景别/光影/音效/资产`;

const PROMPT_SYSTEM = `你是提示词合成器。根据已确认的分镜表和资产，为每一镜写出最终提示词。
规则：
- 只输出 JSON
- 只 @ 这一镜画面里真正出现的资产，禁止把资产表整份贴进每一镜
- 没有/不是/还没有/没人/空镜：不要 @ 被否定的角色或车辆
- 角色、场景、道具必须用 @名称 引用，不要另起外貌
- 不要 @「新角色」「新场景」「新道具」这类占位名
- imagePrompt：静态锁图，含景别、光影、构图、@资产，末尾加 [视觉风格: …]
- videoPrompt：运动、表演、运镜；并写参考图规则——角色以外貌为准忽略姿势；场景以空间布局为准；道具以结构尺寸为准
- 成年人，禁止未成年`;

const H3_SYSTEM = `你是 MiniMax Hailuo H3 Ref2VA 提示词工程师。把每镜的视频提示词改成 H3 最容易一次跑稳的写法。
规则：
- 只输出 JSON：{"shots":[{id,videoPrompt}]}
- 每镜固定 6 秒；H3 不发声、不口型、画面内不生成任何字
- 只写一个主动作 + 一种运镜。优先固定机位、硬切；接戏才允许微跟
- 身份只用已有 @资产名，不要重写外貌、服装、年龄
- 必须写参考图规则：角色以外貌为准忽略姿势；场景以空间布局为准；道具以结构尺寸为准
- 末尾可加：silent, no speech, no on-screen text, 6s
- 禁止：一条里走完整段变形、挥手退后、上车、伸手跪下摸脸、对白、字幕、年份
- 保留原有 @名称，不要新增资产名`;

app.post("/api/llm/script", async (req, res) => {
  try {
    const { text, bible, provider, model } = req.body as {
      text: string;
      bible: string;
      provider?: string;
      model?: string;
    };
    const content = await chat(
      [
        { role: "system", content: BREAKDOWN_SYSTEM },
        {
          role: "user",
          content: `项目设定：\n${bible || "无"}\n\n故事：\n${text}\n\n输出 JSON：{"title","logline","style","aspect","globalStyle","shots":[{id,time,duration,scene,action,shotScale,lighting,dialogue,sfx,camera,"imagePrompt":"","videoPrompt":""}],"assets":[{kind,name,prompt}]}`,
        },
      ],
      provider,
      model,
    );
    res.json({ ok: true, script: parseJson(content) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/llm/prompts", async (req, res) => {
  try {
    const { shots, assets, globalStyle, bible, provider, model } = req.body as {
      shots: unknown;
      assets: unknown;
      globalStyle?: string;
      bible?: string;
      provider?: string;
      model?: string;
    };
    const content = await chat(
      [
        { role: "system", content: PROMPT_SYSTEM },
        {
          role: "user",
          content: `项目设定：\n${bible || "无"}\n\n全局风格：\n${globalStyle || "无"}\n\n资产：\n${JSON.stringify(assets, null, 2)}\n\n镜头：\n${JSON.stringify(shots, null, 2)}\n\n输出 JSON：{"shots":[{id,imagePrompt,videoPrompt}]}`,
        },
      ],
      provider,
      model,
    );
    res.json({ ok: true, result: parseJson(content) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/llm/image-prompt", async (req, res) => {
  try {
    const { shot, bible, imageUrl, provider, model } = req.body as {
      shot: string;
      bible: string;
      imageUrl?: string;
      provider?: string;
      model?: string;
    };
    const userText = `项目设定：\n${bible || "无"}\n\n分镜：\n${shot}\n\n根据锁图（如有）和分镜，写出图生视频提示词。只输出 JSON：{"imagePrompt","videoPrompt","negative"}`;
    const content = imageUrl
      ? await chatVision(userText, toDataUrl(imageUrl), provider, model)
      : await chat([{ role: "user", content: userText }], provider, model);
    res.json({ ok: true, prompt: parseJson(content) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/llm/h3", async (req, res) => {
  try {
    const { shots, assets, bible, provider, model } = req.body as {
      shots: unknown;
      assets?: unknown;
      bible?: string;
      provider?: string;
      model?: string;
    };
    const content = await chat(
      [
        { role: "system", content: H3_SYSTEM },
        {
          role: "user",
          content: `项目设定：\n${bible || "无"}\n\n资产：\n${JSON.stringify(assets || [], null, 2)}\n\n镜头：\n${JSON.stringify(shots, null, 2)}\n\n输出 JSON：{"shots":[{id,videoPrompt}]}`,
        },
      ],
      provider,
      model,
    );
    res.json({ ok: true, result: parseJson(content) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/generate/image", async (req, res) => {
  try {
    const s = readSettings();
    const model = String(req.body.model || s.t2iModel || "");
    if (model.startsWith("api:")) {
      const [, provider, ...rest] = model.split(":");
      const out = await generateCloudImage({
        keys: s.keys,
        provider,
        model: rest.join(":"),
        prompt: String(req.body.prompt || ""),
        width: Number(req.body.width) || undefined,
        height: Number(req.body.height) || undefined,
        uploadDir,
      });
      res.json({ ok: true, media: [{ kind: "image", url: out.url, name: out.name }] });
      return;
    }
    res.json(await runComfy("t2i", req.body));
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/generate/video", async (req, res) => {
  try {
    res.json(await runComfy("i2v", req.body));
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.post("/api/generate/audio", async (req, res) => {
  try {
    const s = readSettings();
    const body = req.body as {
      prompt?: string;
      provider?: string;
      voice?: string;
      backend?: string;
      refUrl?: string;
      refText?: string;
    };
    const text = String(body.prompt || "").trim();
    if (!text) throw new Error("先写要对的那句台词");
    const refUrl = body.refUrl || s.ttsRefUrl || "";
    const refText = body.refText || s.ttsRefText || "";
    const backend = body.backend || s.ttsBackend || "auto";
    const voice = body.voice || s.ttsVoice || "clone";
    const clone = voice === "clone" || Boolean(refUrl);
    const refPath = refUrl ? path.join(uploadDir, refUrl.replace(/^\/files\//, "")) : "";
    const wantClone = clone && refPath && fs.existsSync(refPath);

    const tryComfy = async () => {
      const out = await runComfyClone({
        comfyUrl: s.comfyUrl,
        text,
        refPath,
        refName: path.basename(refPath),
        refText,
        uploadDir,
        uploadToComfy,
        waitHistory,
        collectOutputs,
      });
      return { ok: true, media: [{ kind: "audio", url: out.url, name: out.name }] };
    };
    const tryCloudClone = async () => {
      const provider = body.provider || (s.keys.minimax && !s.keys.qwen ? "minimax" : "qwen");
      const out = await generateClonedSpeech({
        keys: s.keys,
        provider,
        text,
        filePath: refPath,
        transcript: refText,
        cached: s.ttsCloneVoice ? { voice: s.ttsCloneVoice, model: s.ttsCloneModel, key: s.ttsCloneKey } : undefined,
        uploadDir,
      });
      if (out.clone) {
        s.ttsCloneVoice = out.clone.voice;
        s.ttsCloneModel = out.clone.model || s.ttsCloneModel;
        s.ttsCloneKey = out.clone.key;
        writeSettings(s);
      }
      return { ok: true, media: [{ kind: "audio", url: out.url, name: out.name }] };
    };

    if (wantClone && (backend === "comfy" || backend === "auto")) {
      try {
        res.json(await tryComfy());
        return;
      } catch (err) {
        if (backend === "comfy") throw err;
      }
    }
    if (wantClone && (backend === "cloud" || backend === "auto")) {
      try {
        res.json(await tryCloudClone());
        return;
      } catch (err) {
        if (backend === "cloud") throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`仿声失败：${msg}。本机装 GPT-SoVITS/IndexTTS，或填千问/MiniMax Key 并上传参考音频`);
      }
    }

    const provider = body.provider || (/long/.test(voice) ? "qwen" : s.ttsProvider || "openai");
    const out = await generateCloudSpeech({
      keys: s.keys,
      provider,
      voice: voice === "clone" ? "onyx" : voice,
      text,
      uploadDir,
    });
    res.json({ ok: true, media: [{ kind: "audio", url: out.url, name: out.name }] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

app.listen(8787, () => {
  console.log("Shotfield api http://127.0.0.1:8787");
  void (async () => {
    const s = readSettings();
    const cat = await scanComfy(s.comfyUrl, {
      image: imageFamily(s.t2iModel) && imageFamily(s.t2iModel) !== "flux" ? s.t2iModel : undefined,
      video: isH3Family(videoFamily(s.i2vModel)) ? s.i2vModel : undefined,
    });
    if (!cat.ok) {
      console.log("Comfy offline. Edit the canvas first.");
      return;
    }
    if (!cat.picked.video) return;
    applyModelPick(s, cat.picked.image || s.t2iModel, cat.picked.video, cat);
    writeSettings(s);
    console.log("出图", s.t2iModel);
    console.log("出视频", s.i2vModel);
  })();
});

function summarizeWorkflow(prompt: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>) {
  return Object.entries(prompt).map(([id, node]) => ({
    id,
    class: node.class_type ?? "",
    inputs: Object.keys(node.inputs ?? {}),
  }));
}

function parseJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}

type ChatMsg = { role: string; content: unknown };

function providerBase(provider?: string) {
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (provider === "grok") return "https://api.x.ai/v1";
  if (provider === "doubao") return "https://ark.cn-beijing.volces.com/api/v3";
  if (provider === "qwen") return "https://dashscope.aliyuncs.com/compatible-mode/v1";
  return "https://api.deepseek.com/v1";
}

function providerKey(provider?: string) {
  const s = readSettings();
  const p = provider || s.llmProvider || "deepseek";
  if (p === "gemini") return s.keys.gemini;
  if (p === "openai") return s.keys.openai;
  if (p === "anthropic") return s.keys.anthropic;
  if (p === "openrouter") return s.keys.openrouter;
  if (p === "grok") return s.keys.grok;
  if (p === "doubao") return s.keys.doubao;
  if (p === "qwen") return s.keys.qwen;
  return s.keys.deepseek;
}

async function chat(messages: ChatMsg[], provider?: string, model?: string) {
  const s = readSettings();
  const usedProvider = provider || s.llmProvider || "deepseek";
  const key = providerKey(usedProvider);
  const usedModel = model || s.llmModel;
  if (usedProvider === "anthropic") return anthropicChat(messages, key, usedModel);
  if (!key) throw new Error(`先在设置里填 ${usedProvider} 的 API Key`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (usedProvider === "openrouter") {
    headers["HTTP-Referer"] = "http://127.0.0.1:5173";
    headers["X-Title"] = "Shotfield";
  }
  const payload: Record<string, unknown> = { model: usedModel, temperature: 0.7, messages };
  if (usedProvider === "deepseek") payload.thinking = { type: "disabled" };
  const r = await fetch(`${providerBase(usedProvider).replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as {
    choices?: { message?: { content?: unknown; reasoning_content?: string } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `LLM ${r.status}`);
  const content = llmText(data.choices?.[0]?.message);
  if (!content) throw new Error("大模型没有返回内容");
  return content;
}

function llmText(msg?: { content?: unknown; reasoning_content?: string }) {
  const c = msg?.content;
  if (typeof c === "string" && c.trim()) return c;
  if (Array.isArray(c)) {
    const joined = c
      .map((p) => (typeof p === "string" ? p : p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text || "") : ""))
      .join("");
    if (joined.trim()) return joined;
  }
  return (msg?.reasoning_content || "").trim();
}

async function anthropicChat(messages: ChatMsg[], key: string, model: string) {
  if (!key) throw new Error("先在设置里填 Claude 的 API Key");
  const system = messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 8192, system: system || undefined, messages: rest }),
  });
  const data = (await r.json()) as { content?: { text?: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(data.error?.message || `Claude ${r.status}`);
  const text = data.content?.map((c) => c.text || "").join("");
  if (!text) throw new Error("Claude 没有返回内容");
  return text;
}

async function chatVision(text: string, imageUrl: string, provider?: string, model?: string) {
  return chat(
    [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    provider,
    model,
  );
}

function toDataUrl(imageUrl: string) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const file = imageUrl.replace(/^\/files\//, "");
  const abs = path.join(uploadDir, file);
  if (!fs.existsSync(abs)) return imageUrl;
  const buf = fs.readFileSync(abs);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function framesOf(seconds: unknown) {
  const s = Number(seconds) || 5;
  return Math.floor((s * 16) / 4) * 4 + 1;
}

function h3Frames(seconds: unknown) {
  const raw = Math.round((Number(seconds) || 6) * 24);
  return 17 * Math.max(0, Math.round((raw - 5) / 17)) + 5;
}

function h3Size(width: unknown, height: unknown): [number, number] {
  const w = Number(width) || 1344;
  const h = Number(height) || 768;
  const ratio = w / h;
  if (ratio > 1.3) return [1344, 768];
  if (ratio < 0.8) return [768, 1344];
  return [nearest(w, 32), nearest(h, 32)];
}

function withH3Tags(prompt: string, nImg: number, nVid: number) {
  let p = prompt.trim();
  const bits: string[] = [];
  for (let i = 1; i <= nImg; i++) if (!p.includes(`<image ${i}>`)) bits.push(`<image ${i}>`);
  for (let i = 1; i <= nVid; i++) if (!p.includes(`<video ${i}>`)) bits.push(`<video ${i}>`);
  if (bits.length) p = `${p}\n\nUse ${bits.join(", ")} as visual reference. Keep identity.`;
  return p;
}

function nextNodeId(workflow: Record<string, unknown>, start = 200) {
  let i = start;
  while (workflow[String(i)]) i += 1;
  return String(i);
}

function wireH3Refs(
  workflow: Record<string, { class_type?: string; inputs: Record<string, unknown> }>,
  images: string[],
  videos: string[],
) {
  const hit = Object.entries(workflow).find(
    ([, n]) => n.class_type === "MiniMaxH3ImageToVideo" || n.class_type === "MiniMaxH3ReferenceToVideo",
  );
  if (!hit) return;
  const node = hit[1];
  for (const key of Object.keys(node.inputs)) {
    if (key.startsWith("ref_images") || key.startsWith("ref_videos") || key === "first_frame" || key === "last_frame") {
      delete node.inputs[key];
    }
  }
  for (const [id, n] of Object.entries(workflow)) {
    if (n.class_type === "LoadImage" || n.class_type === "LoadVideo") delete workflow[id];
  }
  if (node.class_type === "MiniMaxH3ImageToVideo") {
    if (images[0]) {
      const id = nextNodeId(workflow);
      workflow[id] = { class_type: "LoadImage", inputs: { image: images[0] } };
      node.inputs.first_frame = [id, 0];
    }
    if (images[1]) {
      const id = nextNodeId(workflow);
      workflow[id] = { class_type: "LoadImage", inputs: { image: images[1] } };
      node.inputs.last_frame = [id, 0];
    }
    return;
  }
  images.slice(0, 9).forEach((name, i) => {
    const id = nextNodeId(workflow);
    workflow[id] = { class_type: "LoadImage", inputs: { image: name } };
    node.inputs[`ref_images.ref_image_${i}`] = [id, 0];
  });
  videos.slice(0, 3).forEach((name, i) => {
    const id = nextNodeId(workflow);
    workflow[id] = { class_type: "LoadVideo", inputs: { file: name } };
    node.inputs[`ref_videos.ref_video_${i}`] = [id, 0];
  });
}

async function ensureH3Video(s: Settings, images: unknown[], videos: unknown[]) {
  let fam = videoFamily(s.i2vModel);
  if (!isH3Family(fam)) {
    const cat = await scanComfy(s.comfyUrl, { image: s.t2iModel });
    if (!cat.ok || !isH3Family(videoFamily(cat.picked.video))) {
      throw new Error("这台 Comfy 上没扫到 MiniMax H3。出视频必须用 H3，不要用 Wan。");
    }
    applyModelPick(s, s.t2iModel || cat.picked.image, cat.picked.video, cat);
    fam = videoFamily(s.i2vModel);
  }
  const needRef = videos.length > 0 || images.length > 1;
  if (needRef && fam === "h3_fl2va") {
    const swapped = s.i2vModel.replace(/fl2va/i, "ref2va");
    s.i2vModel = swapped;
    fam = "h3_ref2va";
  }
  applyModelPick(s, s.t2iModel, s.i2vModel);
  return s;
}

async function patchH3Loaders(
  workflow: Record<string, { class_type?: string; inputs: Record<string, unknown> }>,
  comfy: string,
) {
  const support = await pickH3Support(comfy);
  const audioIds = new Set<string>();
  for (const node of Object.values(workflow)) {
    const vae = node.inputs?.vae;
    const audioVae = node.inputs?.audio_vae;
    if (node.class_type === "VAEDecodeAudio" && Array.isArray(vae)) audioIds.add(String(vae[0]));
    if (Array.isArray(audioVae)) audioIds.add(String(audioVae[0]));
  }
  for (const [id, node] of Object.entries(workflow)) {
    if (node.class_type === "CLIPLoader" && node.inputs) {
      if (support.clip) node.inputs.clip_name = support.clip;
      node.inputs.type = "minimax";
      node.inputs.device = "default";
    }
    if (node.class_type === "VAELoader" && node.inputs) {
      if (audioIds.has(id) && support.audioVae) node.inputs.vae_name = support.audioVae;
      else if (support.videoVae) node.inputs.vae_name = support.videoVae;
    }
  }
}

function wireQwenRefs(
  workflow: Record<string, { class_type?: string; inputs: Record<string, unknown> }>,
  images: string[],
) {
  const hit = Object.entries(workflow).find(([, n]) => n.class_type === "TextEncodeQwenImageEditPlus");
  if (!hit) return;
  const node = hit[1];
  for (const key of ["image1", "image2", "image3"]) delete node.inputs[key];
  images.slice(0, 3).forEach((name, i) => {
    const id = nextNodeId(workflow);
    workflow[id] = { class_type: "LoadImage", inputs: { image: name } };
    node.inputs[`image${i + 1}`] = [id, 0];
  });
}

async function patchQwenLoaders(
  workflow: Record<string, { class_type?: string; inputs: Record<string, unknown> }>,
  comfy: string,
  edit: boolean,
) {
  const support = await pickQwenSupport(comfy);
  const unet = edit ? support.editUnet : support.unet;
  const lora = edit ? support.editLora : support.lora;
  for (const node of Object.values(workflow)) {
    if (node.class_type === "UNETLoader" && node.inputs && unet) node.inputs.unet_name = unet;
    if (node.class_type === "CLIPLoader" && node.inputs) {
      if (support.clip) node.inputs.clip_name = support.clip;
      node.inputs.type = "qwen_image";
      node.inputs.device = "default";
    }
    if (node.class_type === "VAELoader" && node.inputs && support.vae) node.inputs.vae_name = support.vae;
    if (node.class_type === "LoraLoaderModelOnly" && node.inputs) {
      if (lora) node.inputs.lora_name = lora;
    }
  }
  if (!lora) {
    const loraId = Object.keys(workflow).find((id) => workflow[id].class_type === "LoraLoaderModelOnly");
    const sample = Object.values(workflow).find((n) => n.class_type === "ModelSamplingAuraFlow");
    const ksampler = Object.values(workflow).find((n) => n.class_type === "KSampler");
    if (loraId && sample && Array.isArray(workflow[loraId].inputs.model)) {
      sample.inputs.model = workflow[loraId].inputs.model;
      delete workflow[loraId];
    }
    if (ksampler?.inputs) {
      ksampler.inputs.steps = 20;
      ksampler.inputs.cfg = 2.5;
    }
  }
}

async function ensureQwenImage(s: Settings, images: unknown[]) {
  let fam = imageFamily(s.t2iModel);
  if (fam === "flux" || !fam) {
    const cat = await scanComfy(s.comfyUrl, { video: s.i2vModel });
    if (cat.ok && cat.picked.image) {
      applyModelPick(s, cat.picked.image, s.i2vModel, cat);
      fam = imageFamily(s.t2iModel);
    }
  }
  if (fam === "flux") {
    throw new Error("这台 Comfy 没有 Flux 的 clip_l / t5xxl。出图请改用 Qwen Image。");
  }
  const edit = isQwenFamily(fam) && images.length > 0;
  if (isQwenFamily(fam)) {
    const custom = /[/\\]data[/\\]workflows[/\\]/.test(s.t2iWorkflow);
    if (!custom) {
      s.t2iWorkflow = path.join(bundledDir, workflowName("t2i", edit ? "qwen_edit" : "qwen"));
      s.t2iMap = edit ? { ...qwenEditMap } : { ...qwenT2iMap };
    }
  }
  return { s, edit: edit || fam === "qwen_edit" };
}

async function runComfy(kind: "t2i" | "i2v", body: Record<string, unknown>) {
  let s = structuredClone(readSettings());
  const comfy = s.comfyUrl.replace(/\/$/, "");
  try {
    const ping = await fetch(`${comfy}/system_stats`);
    if (!ping.ok) throw new Error("down");
  } catch {
    throw new Error("云端没开");
  }
  const images = (body.images as { name: string; url: string }[] | undefined) ?? [];
  const videos = (body.videos as { name: string; url: string }[] | undefined) ?? [];
  if (typeof body.model === "string" && body.model) {
    if (kind === "t2i") applyModelPick(s, body.model, s.i2vModel);
    else applyModelPick(s, s.t2iModel, body.model);
  }
  let qwenEdit = false;
  if (kind === "i2v") s = await ensureH3Video(s, images, videos);
  if (kind === "t2i") {
    const next = await ensureQwenImage(s, images);
    s = next.s;
    qwenEdit = next.edit;
  }

  const file = kind === "t2i" ? s.t2iWorkflow : s.i2vWorkflow;
  const map = kind === "t2i" ? s.t2iMap : s.i2vMap;
  if (!file || !fs.existsSync(file)) {
    throw new Error(kind === "t2i" ? "找不到分镜图工作流" : "找不到镜头工作流");
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const workflow = structuredClone(parsed.prompt ?? parsed) as Record<string, { class_type?: string; inputs: Record<string, unknown> }>;
  patchWorkflowModels(workflow, kind, s);

  const h3 = kind === "i2v" && isH3Family(videoFamily(s.i2vModel));
  if (h3) await patchH3Loaders(workflow, comfy);
  if (kind === "t2i" && isQwenFamily(imageFamily(s.t2iModel))) await patchQwenLoaders(workflow, comfy, qwenEdit);

  const steps = Number(body.steps);
  if (steps > 0) {
    for (const node of Object.values(workflow)) {
      if (node.inputs && "steps" in node.inputs) node.inputs.steps = steps;
    }
  }

  const uploaded: string[] = [];
  for (const img of images) uploaded.push(await uploadToComfy(comfy, img));
  const uploadedVideos: string[] = [];
  for (const vid of videos) uploadedVideos.push(await uploadToComfy(comfy, vid));

  const size = h3
    ? h3Size(body.width, body.height)
    : [nearest(Number(body.width) || 1280, 16), nearest(Number(body.height) || 720, 16)];
  const prompt = h3 ? withH3Tags(String(body.prompt || ""), uploaded.length, uploadedVideos.length) : body.prompt;
  const values: Record<string, unknown> = {
    prompt,
    negative: body.negative ?? "",
    width: size[0],
    height: size[1],
    duration: h3 ? h3Frames(body.duration) : framesOf(body.duration),
    image: uploaded[0],
    ref1: uploaded[1],
    ref2: uploaded[2],
    ref3: uploaded[3],
  };

  for (const node of Object.values(workflow)) {
    if (node.inputs && "seed" in node.inputs) node.inputs.seed = Math.floor(Math.random() * 1e9);
    if (node.inputs && "noise_seed" in node.inputs) node.inputs.noise_seed = Math.floor(Math.random() * 1e9);
  }

  for (const [key, loc] of Object.entries(map)) {
    if (!loc || values[key] == null || values[key] === "") continue;
    const [nodeId, field] = loc.split(":");
    if (!workflow[nodeId]) continue;
    workflow[nodeId].inputs[field] = values[key];
  }

  if (h3) wireH3Refs(workflow, uploaded, uploadedVideos);
  if (qwenEdit) wireQwenRefs(workflow, uploaded);

  const queued = await fetch(`${comfy}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const q = (await queued.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!queued.ok || !q.prompt_id) throw new Error(formatComfyError(q));
  const outputs = await waitHistory(comfy, q.prompt_id);
  return { ok: true, promptId: q.prompt_id, media: await collectOutputs(comfy, outputs) };
}

function formatComfyError(q: { error?: unknown; node_errors?: unknown }) {
  const nodeErr = q.node_errors;
  if (nodeErr && typeof nodeErr === "object") {
    const parts = Object.values(nodeErr as Record<string, { errors?: { message?: string; details?: string }[] }>).flatMap(
      (v) => (v.errors || []).map((e) => [e.message, e.details].filter(Boolean).join("：")),
    );
    if (parts.length) return parts.join("；");
  }
  if (q.error && typeof q.error === "object" && q.error && "message" in q.error) {
    const err = q.error as { message?: string; details?: string };
    return [err.message, err.details].filter(Boolean).join("：") || "Comfy 校验失败";
  }
  return JSON.stringify(q.error || q.node_errors || q);
}

function nearest(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

async function uploadToComfy(comfyUrl: string, img: { name: string; url: string }) {
  const file = img.url.replace(/^\/files\//, "");
  const abs = path.join(uploadDir, file);
  if (!fs.existsSync(abs)) throw new Error(`找不到参考文件 ${img.name}`);
  const buf = fs.readFileSync(abs);
  const form = new FormData();
  form.append("image", new Blob([buf]), img.name || file);
  form.append("overwrite", "true");
  const r = await fetch(`${comfyUrl}/upload/image`, { method: "POST", body: form });
  const data = (await r.json()) as { name?: string };
  if (!data.name) throw new Error("ComfyUI 收图失败，检查云端地址或 SSH 隧道");
  return data.name;
}

async function waitHistory(comfyUrl: string, id: string) {
  for (let i = 0; i < 1800; i++) {
    const r = await fetch(`${comfyUrl}/history/${id}`);
    const data = (await r.json()) as Record<string, { outputs?: Record<string, unknown> }>;
    if (data[id]?.outputs) {
      return data[id].outputs as Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>>;
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error("云端生成超时");
}

async function collectOutputs(
  comfyUrl: string,
  outputs: Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>>,
) {
  const media: { url: string; name: string; kind: "image" | "video" | "audio" }[] = [];
  for (const node of Object.values(outputs)) {
    for (const [key, files] of Object.entries(node)) {
      if (!Array.isArray(files)) continue;
      for (const f of files) {
        if (!f.filename) continue;
        const isAudio = /\.(wav|mp3|flac|ogg|opus|m4a)$/i.test(f.filename) || /audio/i.test(key);
        const isVideo = !isAudio && (/\.(mp4|webm|mov)$/i.test(f.filename) || key.includes("gifs"));
        const view = `${comfyUrl}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || "")}&type=${encodeURIComponent(f.type || "output")}`;
        const r = await fetch(view);
        const buf = Buffer.from(await r.arrayBuffer());
        const destName = `${Date.now()}-${f.filename}`;
        fs.writeFileSync(path.join(uploadDir, destName), buf);
        media.push({ url: `/files/${destName}`, name: f.filename, kind: isAudio ? "audio" : isVideo ? "video" : "image" });
      }
    }
  }
  return media;
}
