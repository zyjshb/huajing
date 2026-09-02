export type ImageFamily = "qwen" | "qwen_edit" | "flux" | "sdxl";
export type VideoFamily = "h3_ref2va" | "h3_fl2va" | "wan22_14b" | "wan22_5b";

export function isH3Family(family: string | null | undefined) {
  return family === "h3_ref2va" || family === "h3_fl2va";
}

export function isQwenFamily(family: string | null | undefined) {
  return family === "qwen" || family === "qwen_edit";
}

export type ModelPick = {
  file: string;
  label: string;
  family: ImageFamily | VideoFamily;
  folder: "checkpoints" | "diffusion_models";
};

export type ComfyCatalog = {
  ok: boolean;
  error?: string;
  image: ModelPick[];
  video: ModelPick[];
  extras: string[];
  picked: { image: string; video: string };
};

export function imageFamily(file: string): ImageFamily | null {
  const n = file.toLowerCase().replace(/\\/g, "/");
  if (/flux2|klein|nvfp4|svdq|nunchaku|layered/.test(n)) return null;
  if (/qwen_image_edit/.test(n)) return "qwen_edit";
  if (/qwen_image/.test(n) && !/edit|control/.test(n)) return "qwen";
  if (/flux/.test(n) && /(dev|schnell)/.test(n) && !/fill|canny|kontext|depth|krea/.test(n)) return "flux";
  if (/pony/.test(n)) return "sdxl";
  if (/juggernaut/.test(n)) return "sdxl";
  if (/dreamshaperxl|dreamshaperxl_/.test(n)) return "sdxl";
  if (/sd_xl_base_1\.0\.safetensors$/.test(n)) return "sdxl";
  return null;
}

export function videoFamily(file: string): VideoFamily | null {
  const n = file.toLowerCase().replace(/\\/g, "/");
  if (/minimax_h3|minimax-h3/.test(n)) {
    if (/lora|turbo/.test(n)) return null;
    if (/ref2va/.test(n)) return "h3_ref2va";
    if (/fl2va/.test(n)) return "h3_fl2va";
    return null;
  }
  if (/low_noise/.test(n)) return null;
  if (/fun[_-]|control|inpaint|animate|s2v|vace|humo|camera|flf2v|nvfp4/.test(n)) return null;
  if (/t2v/.test(n) && !/ti2v/.test(n)) return null;
  if (/wan2\.2.*i2v.*high|wan2\.2_i2v_high/.test(n)) return "wan22_14b";
  if (/ti2v.*5b|wan2\.2_ti2v_5b/.test(n)) return "wan22_5b";
  return null;
}

export function prettyLabel(file: string, family: string) {
  const base = file.replace(/^.*[/\\]/, "").replace(/\.(safetensors|ckpt|pt)$/i, "");
  if (family === "qwen") return `Qwen Image · ${base}`;
  if (family === "qwen_edit") return `Qwen 多图参考 · ${base}`;
  if (family === "flux") return `Flux · ${base}`;
  if (family === "sdxl") return /pony/i.test(base) ? `Pony · ${base}` : `SDXL · ${base}`;
  if (family === "h3_ref2va") return `MiniMax H3 参考 · ${base}`;
  if (family === "h3_fl2va") return `MiniMax H3 首尾帧 · ${base}`;
  if (family === "wan22_14b") return `Wan 2.2 14B · ${base}`;
  if (family === "wan22_5b") return `Wan 2.2 5B · ${base}`;
  return base;
}

function dedupe(files: string[]) {
  const by = new Map<string, string>();
  for (const f of files) {
    const key = f.replace(/^.*[/\\]/, "").toLowerCase();
    const prev = by.get(key);
    const depth = f.split(/[/\\]/).length;
    if (!prev || depth < prev.split(/[/\\]/).length) by.set(key, f);
    else if (depth === prev.split(/[/\\]/).length && /fp8/.test(f) && !/fp8/.test(prev)) by.set(key, f);
  }
  return [...by.values()];
}

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (raw && typeof raw === "object" && Array.isArray((raw as { files?: unknown }).files)) {
    return ((raw as { files: unknown[] }).files).filter((x): x is string => typeof x === "string");
  }
  return [];
}

async function folder(comfy: string, name: string) {
  const r = await fetch(`${comfy}/models/${name}`);
  if (!r.ok) return [] as string[];
  return parseList(await r.json());
}

export function pairLow(high: string, diffusion: string[]) {
  const want = high.replace(/high_noise/i, "low_noise").replace(/HIGH/g, "LOW").replace(/-HIGH_/g, "-LOW_");
  const base = want.replace(/^.*[/\\]/, "").toLowerCase();
  const hit = diffusion.find((f) => f.replace(/^.*[/\\]/, "").toLowerCase() === base);
  return hit || want;
}

export async function scanComfy(comfyUrl: string, current?: { image?: string; video?: string }): Promise<ComfyCatalog> {
  const comfy = comfyUrl.replace(/\/$/, "");
  try {
    const [ckpts, diffs] = await Promise.all([folder(comfy, "checkpoints"), folder(comfy, "diffusion_models")]);
    const image: ModelPick[] = [];
    const seen = new Set<string>();
    const pushImg = (file: string, folder: ModelPick["folder"]) => {
      const family = imageFamily(file);
      if (!family) return;
      const key = file.replace(/^.*[/\\]/, "").toLowerCase();
      if (family === "flux" && folder === "checkpoints") return;
      if (seen.has(key) && family === "sdxl") return;
      if (seen.has(`${family}:${key}`)) return;
      seen.add(`${family}:${key}`);
      image.push({ file, label: prettyLabel(file, family), family, folder });
    };
    for (const f of dedupe(diffs)) pushImg(f, "diffusion_models");
    for (const f of dedupe(ckpts)) pushImg(f, "checkpoints");

    const video: ModelPick[] = [];
    const vseen = new Set<string>();
    for (const f of dedupe(diffs)) {
      const family = videoFamily(f);
      if (!family) continue;
      const key = f.replace(/^.*[/\\]/, "").toLowerCase();
      if (vseen.has(key)) continue;
      vseen.add(key);
      video.push({ file: f, label: prettyLabel(f, family), family, folder: "diffusion_models" });
    }

    const extras: string[] = [];
    const keepVideo = current?.video && isH3Family(videoFamily(current.video)) ? current.video : undefined;
    const curImgFam = current?.image ? imageFamily(current.image) : null;
    const keepImage = curImgFam && curImgFam !== "flux" ? current?.image : undefined;
    if (!video.some((m) => isH3Family(m.family))) extras.push("没扫到 MiniMax H3，本片出不了镜头");
    else if (video.some((m) => m.family.startsWith("wan"))) extras.push("Wan 只作备选，出视频默认 MiniMax H3");
    extras.push("出图用 Qwen Image（可连最多 3 张参考）。H3 出视频会把资产图/参考视频一起喂进去。");
    if (image.some((m) => m.family === "flux")) extras.push("这台没有 Flux 的 clip_l / t5xxl，选 Flux 会校验失败");

    const picked = {
      image: pickBest(image, keepImage, ["qwen", "sdxl", "flux"]),
      video: pickBest(video, keepVideo, ["h3_ref2va", "h3_fl2va", "wan22_14b", "wan22_5b"]),
    };
    return { ok: true, image, video, extras, picked };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "扫模型失败",
      image: [],
      video: [],
      extras: [],
      picked: { image: current?.image || "", video: current?.video || "" },
    };
  }
}

function h3Score(file: string) {
  const n = file.replace(/\\/g, "/");
  let s = 0;
  if (!n.includes("/")) s += 10;
  if (/pruned_int8/.test(n)) s += 8;
  else if (/int8/.test(n)) s += 5;
  if (/bf16/.test(n)) s -= 3;
  return s;
}

function pickBest(list: ModelPick[], current: string | undefined, prefer: string[]) {
  if (current && list.some((m) => m.file === current)) return current;
  const curBase = current?.replace(/^.*[/\\]/, "").toLowerCase();
  if (curBase) {
    const hit = list.find((m) => m.file.replace(/^.*[/\\]/, "").toLowerCase() === curBase);
    if (hit) return hit.file;
  }
  for (const fam of prefer) {
    const group = list.filter((m) => m.family === fam);
    if (!group.length) continue;
    if (isH3Family(fam)) {
      group.sort((a, b) => h3Score(b.file) - h3Score(a.file));
      return group[0].file;
    }
    if (isQwenFamily(fam)) {
      group.sort((a, b) => qwenScore(b.file) - qwenScore(a.file));
      return group[0].file;
    }
    const fp8 = group.find((m) => /fp8/.test(m.file) && !/\//.test(m.file.replace(/\\/g, "/")));
    if (fp8) return fp8.file;
    return group[0].file;
  }
  return list[0]?.file || "";
}

function qwenScore(file: string) {
  const n = file.replace(/\\/g, "/").toLowerCase();
  let s = 0;
  if (!n.includes("/")) s += 8;
  if (/2512/.test(n)) s += 10;
  if (/2509/.test(n)) s += 6;
  if (/fp8/.test(n) && /scaled/.test(n)) s += 6;
  else if (/fp8/.test(n)) s += 3;
  if (/4steps|distill/.test(n)) s -= 4;
  return s;
}

export function workflowName(kind: "t2i" | "i2v", family: string) {
  if (kind === "t2i") {
    if (family === "qwen_edit") return "镜场_Qwen参考_API.json";
    if (family === "qwen") return "镜场_Qwen出图_API.json";
    return family === "flux" ? "镜场_分镜图_API.json" : "镜场_4060_分镜图_API.json";
  }
  if (family === "h3_ref2va") return "镜场_H3_参考_API.json";
  if (family === "h3_fl2va") return "镜场_H3_镜头_API.json";
  return family === "wan22_14b" ? "镜场_镜头_API.json" : "镜场_4060_镜头_API.json";
}

function pickFile(list: string[], tests: ((f: string) => boolean)[]) {
  const files = list.map((f) => f.replace(/\\/g, "/"));
  for (const test of tests) {
    const hit = files.find(test);
    if (hit) return hit;
  }
  return "";
}

export async function pickH3Support(comfyUrl: string) {
  const comfy = comfyUrl.replace(/\/$/, "");
  const [clips, vaes] = await Promise.all([folder(comfy, "text_encoders"), folder(comfy, "vae")]);
  return {
    clip: pickFile(clips, [
      (f) => /qwen3vl_32b_minimax_h3_nvfp4_awq/.test(f) && !f.includes("/"),
      (f) => /qwen3vl_32b_minimax_h3_nvfp4_awq/.test(f),
      (f) => /qwen3vl_32b_minimax_h3_int8/.test(f) && !f.includes("/"),
      (f) => /qwen3vl_32b_minimax_h3/.test(f) && !f.includes("/"),
      (f) => /qwen3vl_32b_minimax_h3/.test(f),
    ]),
    videoVae: pickFile(vaes, [
      (f) => /minimax_h3_video_vae/.test(f) && !f.includes("/"),
      (f) => /minimax_h3_video_vae/.test(f),
    ]),
    audioVae: pickFile(vaes, [
      (f) => /minimax_h3_audio_vae/.test(f) && !f.includes("/"),
      (f) => /minimax_h3_audio_vae/.test(f),
    ]),
  };
}

export async function pickQwenSupport(comfyUrl: string) {
  const comfy = comfyUrl.replace(/\/$/, "");
  const [clips, vaes, diffs, loras] = await Promise.all([
    folder(comfy, "text_encoders"),
    folder(comfy, "vae"),
    folder(comfy, "diffusion_models"),
    folder(comfy, "loras"),
  ]);
  return {
    clip: pickFile(clips, [
      (f) => /qwen_2\.5_vl_7b_fp8_scaled/.test(f) && !f.includes("/"),
      (f) => /qwen_2\.5_vl_7b/.test(f),
    ]),
    vae: pickFile(vaes, [
      (f) => /qwen_image_vae/.test(f) && !f.includes("/"),
      (f) => /qwen_image_vae/.test(f),
    ]),
    unet: pickFile(diffs, [
      (f) => /qwen_image_2512_fp8_e4m3fn_scaled_comfyui/.test(f) && !/4steps/.test(f) && !f.includes("/"),
      (f) => /qwen_image_2512_fp8/.test(f) && !/4steps/.test(f),
      (f) => /qwen_image_fp8/.test(f) && !/edit|layered/.test(f),
    ]),
    editUnet: pickFile(diffs, [
      (f) => /qwen_image_edit_2509_fp8_e4m3fn_scaled/.test(f) && !f.includes("/"),
      (f) => /qwen_image_edit_2509_fp8/.test(f),
      (f) => /qwen_image_edit_2511_fp8/.test(f) && !/nvfp4/.test(f),
      (f) => /qwen_image_edit_fp8/.test(f),
    ]),
    lora: pickFile(loras, [
      (f) => /Qwen-Image-2512-Lightning-4steps-V1\.0-bf16/.test(f) && !f.includes("/"),
      (f) => /Qwen-Image-2512-Lightning-4steps/.test(f),
      (f) => /Qwen-Image-Lightning-4steps-V2\.0-bf16/.test(f),
    ]),
    editLora: pickFile(loras, [
      (f) => /Qwen-Image-Edit-2509-Lightning-4steps-V1\.0-bf16/.test(f) && !f.includes("/"),
      (f) => /Qwen-Image-Edit-2509-Lightning-4steps/.test(f),
      (f) => /Qwen-Image-Edit-2511-Lightning-4steps/.test(f),
    ]),
  };
}
