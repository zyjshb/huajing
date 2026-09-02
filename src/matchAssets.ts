import type { Asset, ScriptData, Shot } from "./types";

const PLACEHOLDER = /^新(角色|场景|道具)$/;
const NEG_PREFIX = /(没有|不是|并非|不要|别是|还没有|看不到|看不见|未出现|无需|别给|不要给)/;

export type MatchedRef = { name: string; url: string; kind: Asset["kind"]; why: string };

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isPlaceholderAsset(a: Asset) {
  return !a.name?.trim() || PLACEHOLDER.test(a.name.trim());
}

export function extractAtNames(text: string) {
  return [...(text || "").matchAll(/@([^\s@<,，、。；;]+)/g)].map((m) => m[1]);
}

function aliasesOf(name: string) {
  if (name === "彼得库伦") return ["库伦", "老人"];
  if (name === "童年男孩") return ["男孩", "孩子", "小手"];
  if (name === "擎天柱") return ["巨人", "面罩", "胸窗", "四十英尺"];
  if (name === "长头卡车") return ["真车", "车头", "车尾", "驾驶室"];
  if (name === "廉价玩具卡车") return ["玩具卡车", "玩具", "塑料"];
  if (name === "圆红灯") return ["红灯"];
  return [] as string[];
}

function hasTerm(text: string, term: string) {
  if (!term || term.length < 2) return false;
  if (text.includes(`@${term}`)) return true;
  return text.includes(term);
}

function negated(text: string, name: string) {
  const terms = [name, ...aliasesOf(name)];
  for (const t of terms) {
    if (new RegExp(`${NEG_PREFIX.source}${esc(t)}`).test(text)) return true;
  }
  if (name === "擎天柱" && /没有巨人|还没有巨人|街上还没有/.test(text)) return true;
  if (name === "长头卡车" && /没有车|看不清车型|不要给车头|不要清晰/.test(text)) return true;
  if (name === "彼得库伦" && /不是库伦/.test(text)) return true;
  return false;
}

function isHuman(name: string) {
  return !/卡车|擎天柱/.test(name);
}

function emptyOfPeople(text: string) {
  return /没人|录音棚空/.test(text);
}

function sceneMatches(scene: string, name: string) {
  const s = (scene || "").trim();
  if (!s || !name) return false;
  if (s === name) return true;
  const head = s.split(/[，,、\s]/)[0]?.trim() || "";
  if (head === name) return true;
  return s.startsWith(name) && (s.length === name.length || /[夜内外场街楼房]$/.test(s.slice(0, name.length + 2)));
}

function corpus(shot: Shot, extraPrompt = "") {
  const extraAts = extractAtNames(extraPrompt)
    .map((n) => `@${n}`)
    .join(" ");
  return [shot.scene, shot.action, shot.imagePrompt, shot.dialogue, extraAts].filter(Boolean).join("\n");
}

function usable(assets: Asset[]) {
  return (assets || []).filter((a) => a.name && !isPlaceholderAsset(a));
}

function matchOne(shot: Shot, prev: MatchedRef[], assets: Asset[], extraPrompt = ""): MatchedRef[] {
  const listed = usable(assets);
  const text = corpus(shot, extraPrompt);
  const tagged = new Set(extractAtNames(`${shot.imagePrompt || ""} ${shot.videoPrompt || ""} ${extraPrompt}`));
  const hits: MatchedRef[] = [];
  const childhood = /童年|居民楼|房间/.test(shot.scene);
  const yard = /棚外|公路|录音棚/.test(shot.scene);
  const noPeople = emptyOfPeople(`${shot.action} ${shot.imagePrompt}`);

  for (const a of listed) {
    if (negated(text, a.name)) continue;
    if (noPeople && a.kind === "character" && isHuman(a.name)) continue;

    let score = 0;
    let why = "";
    if (tagged.has(a.name)) {
      score += 100;
      why = "@提示词";
    }
    if (a.kind === "scene" && sceneMatches(shot.scene, a.name)) {
      score += 90;
      why = why || "场景栏";
    }
    if (hasTerm(shot.action, a.name) || hasTerm(shot.imagePrompt || "", a.name)) {
      score += 70;
      why = why || "画面点名";
    }
    for (const al of aliasesOf(a.name)) {
      if (!hasTerm(text, al)) continue;
      if (a.name === "长头卡车" && childhood && !/电视/.test(text)) continue;
      if (a.name === "长头卡车" && /玩具|塑料|廉价/.test(text) && !/真车|不是玩具|四十英尺/.test(text)) continue;
      if (a.name === "廉价玩具卡车" && /真车|不是玩具|四十英尺/.test(text)) continue;
      if (a.name === "擎天柱" && childhood) continue;
      if (a.name === "童年男孩" && yard && !/孩子|男孩/.test(text)) continue;
      if (a.name === "彼得库伦" && childhood) continue;
      if (a.name === "圆红灯" && !/红灯/.test(text)) continue;
      score += 55;
      why = why || `别称:${al}`;
      break;
    }
    if (score < 70) continue;
    hits.push({ name: a.name, url: a.url, kind: a.kind, why });
  }

  const inherit =
    prev.filter((p) => p.kind === "character").length > 0 &&
    !noPeople &&
    (/接戏|接\s*\d+|出门|门外|摘耳机|关红灯/.test(`${shot.action}${shot.camera}`) ||
      (shot.scene && prev.some((p) => p.kind === "scene" && p.name === shot.scene) && /他|老人/.test(shot.action)));
  if (inherit) {
    for (const p of prev) {
      if (p.kind !== "character" || !isHuman(p.name)) continue;
      if (hits.some((h) => h.name === p.name)) continue;
      if (negated(text, p.name)) continue;
      if (childhood && p.name === "彼得库伦") continue;
      hits.push({ ...p, why: "接戏" });
    }
  }

  if (listed.some((a) => a.name === "廉价玩具卡车") && listed.some((a) => a.name === "长头卡车")) {
    const toy = /玩具|塑料|廉价/.test(text) && !/真车|不是玩具|四十英尺/.test(text);
    const real = /真车|不是玩具|四十英尺|灯关|驾驶室|车尾/.test(text) || (!childhood && /卡车|格栅/.test(text));
    if (toy) {
      const i = hits.findIndex((h) => h.name === "长头卡车" && h.why !== "@提示词");
      if (i >= 0 && !tagged.has("长头卡车")) hits.splice(i, 1);
    }
    if (real && !toy) {
      const i = hits.findIndex((h) => h.name === "廉价玩具卡车" && h.why !== "@提示词");
      if (i >= 0 && !tagged.has("廉价玩具卡车")) hits.splice(i, 1);
    }
  }

  const scenes = hits.filter((h) => h.kind === "scene");
  const sceneHit = listed.find((a) => a.kind === "scene" && sceneMatches(shot.scene, a.name));
  const keptScene = sceneHit
    ? hits.filter((h) => h.kind !== "scene" || h.name === sceneHit.name)
    : scenes.length <= 1
      ? hits
      : hits.filter((h) => h.kind !== "scene" || h.name === scenes[0].name);
  if (sceneHit && !keptScene.some((h) => h.name === sceneHit.name)) {
    keptScene.unshift({ name: sceneHit.name, url: sceneHit.url, kind: "scene", why: "场景栏" });
  }

  const rank = (k: string) => (k === "character" ? 0 : k === "scene" ? 1 : 2);
  const uniq = keptScene.filter((h, i) => keptScene.findIndex((x) => x.name === h.name) === i);
  return uniq.sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function matchShotAssets(script: ScriptData, shotId?: string, extraPrompt = ""): MatchedRef[] {
  const assets = script.assets || [];
  if (!shotId) return [];
  let prev: MatchedRef[] = [];
  let cur: MatchedRef[] = [];
  for (const shot of script.script.shots || []) {
    cur = matchOne(shot, prev, assets, shot.id === shotId ? extraPrompt : "");
    prev = cur;
    if (shot.id === shotId) return cur.filter((r) => r.url);
  }
  return [];
}

export function matchAllShots(script: ScriptData) {
  const map = new Map<string, MatchedRef[]>();
  let prev: MatchedRef[] = [];
  for (const shot of script.script.shots || []) {
    const cur = matchOne(shot, prev, script.assets || []);
    map.set(shot.id, cur);
    prev = cur;
  }
  return map;
}

export function restampPrompt(text: string, keep: string[], known: string[]) {
  let p = text || "";
  for (const n of known.filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (keep.includes(n)) continue;
    p = p.replace(new RegExp(`\\s*@${esc(n)}`, "g"), "");
  }
  for (const n of keep) {
    if (n && !p.includes(`@${n}`)) p = `${p.trim()} @${n}`;
  }
  return p.replace(/[ \t]{2,}/g, " ").trim();
}

export function retagScript(data: ScriptData): ScriptData {
  const known = usable(data.assets).map((a) => a.name);
  const map = matchAllShots(data);
  return {
    ...data,
    script: {
      ...data.script,
      shots: data.script.shots.map((s) => {
        const keep = (map.get(s.id) || []).map((r) => r.name);
        return {
          ...s,
          imagePrompt: s.imagePrompt ? restampPrompt(s.imagePrompt, keep, known) : s.imagePrompt,
          videoPrompt: restampPrompt(s.videoPrompt || "", keep, known),
        };
      }),
    },
  };
}

export function stampNodePrompt(prompt: string, refs: { name: string }[]) {
  return restampPrompt(
    prompt || "",
    refs.map((r) => r.name).filter(Boolean),
    refs.map((r) => r.name).filter(Boolean),
  );
}
