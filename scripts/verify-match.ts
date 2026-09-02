import fs from "node:fs";
import { matchAllShots } from "../src/matchAssets.ts";
import type { ScriptData } from "../src/types.ts";

const expect: Record<string, string[]> = {
  "01": ["童年居民楼"],
  "02": ["童年房间"],
  "03": ["童年男孩", "童年房间"],
  "04": ["长头卡车", "童年房间"],
  "05": ["廉价玩具卡车", "童年房间"],
  "06": ["童年男孩", "廉价玩具卡车", "童年房间"],
  "07": ["童年男孩", "童年房间"],
  "08": ["未来街道"],
  "09": ["童年男孩", "童年房间"],
  "10": ["廉价玩具卡车", "童年房间"],
  "11": ["童年男孩", "童年房间"],
  "12": ["童年房间"],
  "13": ["童年男孩", "童年房间"],
  "14": ["未来街道"],
  "15": ["廉价玩具卡车", "童年房间"],
  "16": ["长头卡车", "棚外夜场"],
  "17": ["长头卡车", "棚外夜场"],
  "18": ["彼得库伦", "录音棚内", "话筒", "耳机", "圆红灯"],
  "19": ["彼得库伦", "录音棚内", "耳机"],
  "20": ["彼得库伦", "录音棚内", "圆红灯"],
  "21": ["彼得库伦", "棚外夜场"],
  "22": ["彼得库伦", "长头卡车", "棚外夜场"],
  "23": ["彼得库伦", "棚外夜场"],
  "24": ["长头卡车", "棚外夜场"],
  "25": ["长头卡车", "棚外夜场"],
  "26": ["长头卡车", "棚外夜场"],
  "27": ["长头卡车", "棚外夜场"],
  "28": ["长头卡车", "棚外夜场"],
  "29": ["擎天柱", "棚外夜场"],
  "30": ["擎天柱", "棚外夜场"],
  "31": ["彼得库伦", "棚外夜场"],
  "32": ["擎天柱", "棚外夜场"],
  "33": ["彼得库伦", "擎天柱", "棚外夜场"],
  "34": ["彼得库伦", "擎天柱", "棚外夜场"],
  "35": ["彼得库伦", "擎天柱", "棚外夜场"],
  "36": ["彼得库伦", "擎天柱", "棚外夜场"],
  "37": ["彼得库伦", "擎天柱", "棚外夜场"],
  "38": ["擎天柱", "棚外夜场"],
  "39": ["彼得库伦", "长头卡车", "棚外夜场"],
  "40": ["彼得库伦", "棚外夜场"],
  "41": ["长头卡车", "棚外夜场"],
  "42": ["彼得库伦", "棚外夜场"],
  "43": ["黎明公路"],
  "44": ["童年居民楼"],
  "45": ["童年男孩", "童年房间"],
  "46": ["未来街道"],
  "47": ["童年男孩", "童年房间"],
  "48": ["未来街道"],
  "49": ["录音棚内", "圆红灯"],
  "50": ["棚外夜场"],
};

const canvas = JSON.parse(fs.readFileSync(new URL("../data/canvas.json", import.meta.url), "utf8"));
const node = canvas.nodes.find((n: { data?: { kind?: string } }) => n.data?.kind === "script");
const data = node.data as ScriptData;
const map = matchAllShots(data);

let ok = 0;
const misses: string[] = [];
for (const [id, want] of Object.entries(expect)) {
  const got = (map.get(id) || []).map((r) => r.name).sort();
  const need = [...want].sort();
  const extra = got.filter((n) => !need.includes(n));
  const missing = need.filter((n) => !got.includes(n));
  if (!extra.length && !missing.length) ok += 1;
  else misses.push(`镜${id} 多了[${extra.join(" ")}] 少了[${missing.join(" ")}] 实际[${got.join(" ")}]`);
}
const total = Object.keys(expect).length;
console.log(`${ok}/${total} 全对 ${(ok / total * 100).toFixed(1)}%`);
for (const line of misses) console.log(line);
