import { emptyScript, emptyShot, type Asset, type ScriptPayload, type Shot } from "./types";

export function parseScript(raw: string): ScriptPayload {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("空文件");
  const json = tryJson(text);
  if (json) return normalize(json);
  return normalize(fromPlain(text));
}

function tryJson(text: string): Partial<ScriptPayload> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(body.slice(start, end + 1)) as Partial<ScriptPayload> & { shots?: unknown };
    if (obj && (Array.isArray(obj.shots) || obj.title || obj.logline)) return obj;
  } catch {
    return null;
  }
  return null;
}

function fromPlain(text: string): ScriptPayload {
  const title = (text.match(/^片名[：:]\s*(.+)$/m) || [])[1] || firstLine(text);
  const aspect = ((text.match(/^画幅[：:]\s*(.+)$/m) || [])[1] || "16:9").trim();
  const style = ((text.match(/^画风[：:]\s*(.+)$/m) || [])[1] || "").trim();
  const logline = ((text.match(/^(?:梗|简介|logline)[：:]\s*(.+)$/m) || [])[1] || "").trim();
  const blocks = text.split(/\n(?=镜\s*\d+)/);
  const shots: Shot[] = [];
  for (const block of blocks) {
    const head = block.match(/镜\s*(\d+)\s+(\S+)?\s*(\d+)?s?/);
    if (!head) continue;
    const id = head[1].padStart(2, "0");
    shots.push({
      ...emptyShot(id),
      time: pick(block, /时间[：:]\s*(.+)/) || head[2] || "",
      duration: Number(pick(block, /时长[：:]\s*(\d+)/) || head[3] || 5),
      scene: pick(block, /场景[：:]\s*(.+)/),
      action: pick(block, /画面[：:]\s*([\s\S]+?)(?=\n(?:入|出|运镜|对白|生图|视频|景别|光影|音效)[：:]|$)/) || rest(block),
      shotScale: pick(block, /景别[：:]\s*(.+)/),
      lighting: pick(block, /光影[：:]\s*(.+)/),
      dialogue: pick(block, /对白[：:]\s*(.+)/),
      sfx: pick(block, /音效[：:]\s*(.+)/),
      camera: pick(block, /运镜[：:]\s*(.+)/),
      carryIn: pick(block, /入[：:]\s*(.+)/),
      carryOut: pick(block, /出[：:]\s*(.+)/),
      imagePrompt: "",
      videoPrompt: "",
    });
  }
  if (!shots.length) throw new Error("剧本还没拆成镜头。接到脚本生成器后点「生成脚本」");
  return { title, logline, style, aspect, shots };
}

function normalize(raw: Partial<ScriptPayload>): ScriptPayload {
  const base = emptyScript();
  const shots = (raw.shots || []).map((s, i) => {
    const id = String(s.id || i + 1).padStart(2, "0");
    return {
      ...emptyShot(id),
      time: s.time || "",
      duration: Number(s.duration) || 5,
      scene: s.scene || "",
      action: s.action || "",
      shotScale: s.shotScale || "",
      lighting: s.lighting || "",
      dialogue: s.dialogue || "",
      sfx: s.sfx || "",
      camera: s.camera || "",
      carryIn: s.carryIn || "",
      carryOut: s.carryOut || "",
      imagePrompt: s.imagePrompt || "",
      videoPrompt: s.videoPrompt || "",
    };
  });
  if (!shots.length) throw new Error("剧本里没有镜头");
  return {
    title: raw.title || base.title,
    logline: raw.logline || "",
    style: raw.style || "",
    aspect: raw.aspect || "16:9",
    shots,
  };
}

export function extractAssets(raw: string, script: ScriptPayload): { globalStyle: string; assets: Asset[] } {
  const assets: Asset[] = [];
  const seen = new Set<string>();
  const push = (kind: Asset["kind"], name: string, prompt: string) => {
    const key = `${kind}:${name}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    assets.push({
      id: `a${kind.slice(0, 1)}${assets.length + 1}`,
      kind,
      name,
      prompt,
      url: "",
      status: "idle",
    });
  };
  const preamble = raw.split(/\n(?=镜\s*\d+)/)[0] || raw.slice(0, 1200);
  for (const name of headerList(preamble, "角色")) push("character", name, characterPrompt(name));
  for (const name of headerList(preamble, "场景")) push("scene", name, scenePrompt(name));
  for (const name of headerList(preamble, "道具")) push("prop", name, propPrompt(name));
  for (const m of raw.matchAll(/([\u4e00-\u9fa5]{2,8})（(\d{2})）/g)) {
    const age = Number(m[2]);
    if (age < 21) continue;
    const name = m[1].replace(/^(?:前女友|前男友|女友|男友|同事|现任)/, "") || m[1];
    push("character", name, `${name}，${age}岁成年，短剧定妆。白底角色设定，左侧近景头像占三分之一，右侧全身正侧背三视图。`);
  }
  for (const shot of script.shots) {
    const scene = shot.scene.split(/[，,、]/)[0]?.trim();
    if (scene) push("scene", scene, scenePrompt(scene));
  }
  if (/房卡/.test(raw)) push("prop", "房卡", "酒店房卡，特写，白色背景，产品图。");
  const globalStyle = (raw.match(/^画风[：:]\s*(.+)$/m) || [])[1] || script.style || "";
  return { globalStyle, assets };
}

function headerList(head: string, label: string) {
  const m = head.match(new RegExp(`^${label}[：:]\\s*(.+)$`, "m"));
  if (!m) return [];
  return m[1]
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function characterPrompt(name: string) {
  if (/库伦/.test(name)) {
    return "禁止生成脸。只上传真照片：面部、全身正面、剧照。晚年，白发，深色大衣，简单衬衫。不要年轻脸，不要颁奖礼服，不要换脸。";
  }
  if (/男孩|孩子/.test(name)) {
    return "用户用 Flux 或 ChatGPT 出一张东亚男孩定妆（约八到十岁，家居夜戏），出了就锁同一张。不是库伦小时候。不要动漫。需要：面部.jpg、三视图.jpg。";
  }
  if (/擎天柱/.test(name)) {
    return "用户出图。好莱坞真人电影擎天柱，四十英尺金属巨人，红蓝甲，胸前挡风玻璃窗，银面罩，蓝色光眼，空双手。不要玩具身体。灰底三视图。";
  }
  if (/卡车/.test(name)) {
    return "用户出图。真人电影长头红色重型拖车头，夜戏金属体积。灯关、灯亮各一张。一眼是电影里那台车，不要玩具。";
  }
  return `${name}，定妆。白底或灰底，左侧近景头像，右侧全身正侧背三视图。用户出图后上传。`;
}

function scenePrompt(name: string) {
  if (/居民楼/.test(name)) return "16:9 空镜。东亚城市居民楼夜到将亮，一扇暖窗。不要霓虹广告字。斯皮尔伯格远景。用户出图。";
  if (/房间/.test(name)) return "16:9 空镜。小房间，CRT 暖暗，地板能放玩具。不要现代液晶、不要动漫。用户出图。";
  if (/录音棚|棚内/.test(name)) return "16:9 空镜。小配音棚，钨丝，吸音棉。话筒、耳机、圆红灯无字母。安静。用户出图。";
  if (/空场|棚外/.test(name)) return "16:9 空镜。货运空场，湿沥青，一层小楼一扇暖窗。维伦纽瓦，车灯可作主光。用户出图。";
  if (/公路/.test(name)) return "16:9 空镜。空场连出去的路，黎明或薄雾，尾灯可以很小。用户出图。";
  if (/未来|街道/.test(name)) return "16:9 空镜。同一类街，雾，灯很远。不要清晰的彼得比尔特车头特写。用户出图。";
  return `${name}，16:9 空镜，无人物，电影布景。用户出图后上传。`;
}

function propPrompt(name: string) {
  if (/玩具/.test(name)) return "廉价塑料玩具卡车，故意不像电影。特写产品图。用户出图。";
  if (/话筒/.test(name)) return "配音棚话筒，特写，钨丝，无台标无字。用户出图或实拍。";
  if (/耳机/.test(name)) return "监听耳机，特写。用户出图或实拍。";
  if (/红灯/.test(name)) return "录音棚圆红灯，无字母。亮、灭各一张。用户出图或实拍。";
  return `${name}，特写，产品图。用户出图后上传。`;
}

function pick(block: string, re: RegExp) {
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function rest(block: string) {
  return block.replace(/^镜[^\n]*\n?/, "").trim();
}

function firstLine(text: string) {
  return text.split(/\n/).find((l) => l.trim())?.slice(0, 40) || "导入剧本";
}

export function looksLikeScript(text: string) {
  const t = text.trim();
  if (t.length < 20) return false;
  if (/"shots"\s*:/.test(t) && t.includes("{")) return true;
  if (/镜\s*\d+/.test(t) && /画面|场景|生图|视频|景别/.test(t)) return true;
  return false;
}
