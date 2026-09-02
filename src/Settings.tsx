import { useEffect, useState } from "react";
import { comfyStatus, getComfyModels, getSettings, pickComfyModels, saveSettings, uploadFiles, uploadWorkflow } from "./api";
import { IMAGE_API_MODELS, LLM_PRESETS, PROVIDER_META, TTS_PRESETS, type LlmProvider } from "./models";
import { useStudio } from "./store";

const providers = Object.keys(PROVIDER_META) as LlmProvider[];

type PickOpt = { file: string; label: string; family: string };

export function SettingsModal() {
  const open = useStudio((s) => s.settingsOpen);
  const setSettingsOpen = useStudio((s) => s.setSettingsOpen);
  const setToast = useStudio((s) => s.setToast);
  const bible = useStudio((s) => s.bible);
  const setBible = useStudio((s) => s.setBible);
  const [keys, setKeys] = useState<Record<LlmProvider, string>>({
    gemini: "",
    openai: "",
    grok: "",
    doubao: "",
    qwen: "",
    anthropic: "",
    deepseek: "",
    openrouter: "",
  });
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [comfy, setComfy] = useState("检测中");
  const [imageModels, setImageModels] = useState<PickOpt[]>([]);
  const [videoModels, setVideoModels] = useState<PickOpt[]>([]);
  const [t2iModel, setT2iModel] = useState("");
  const [i2vModel, setI2vModel] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [llmProvider, setLlmProvider] = useState("deepseek");
  const [llmModel, setLlmModel] = useState("deepseek-v4-flash");
  const [llmCustom, setLlmCustom] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("clone");
  const [ttsBackend, setTtsBackend] = useState("auto");
  const [ttsRefUrl, setTtsRefUrl] = useState("");
  const [ttsRefText, setTtsRefText] = useState("");
  const [minimaxKey, setMinimaxKey] = useState("");
  const [ttsHint, setTtsHint] = useState("");
  const [scanHint, setScanHint] = useState("先连 Comfy 扫本机，或直接选云端出图");

  const scan = async () => {
    setScanHint("正在扫机器上的模型…");
    const cat = await getComfyModels();
    if (!cat.ok) {
      setScanHint(cat.error || "没扫到。先确认 Comfy 已连");
      setImageModels([]);
      setVideoModels([]);
      return;
    }
    setImageModels(cat.image || []);
    setVideoModels(cat.video || []);
    setT2iModel(cat.t2iModel || "");
    setI2vModel(cat.i2vModel || "");
    setExtras(cat.extras || []);
    setTtsHint(cat.tts?.ok ? cat.tts.label : cat.tts?.error || "");
    setScanHint(`扫到 ${cat.image?.length || 0} 个出图、${cat.video?.length || 0} 个出视频，已自动对上能跑的。`);
  };

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      setKeys({
        gemini: s.keys?.gemini || "",
        openai: s.keys?.openai || "",
        grok: s.keys?.grok || "",
        doubao: s.keys?.doubao || "",
        qwen: s.keys?.qwen || "",
        anthropic: s.keys?.anthropic || "",
        deepseek: s.keys?.deepseek || "",
        openrouter: s.keys?.openrouter || "",
      });
      setComfyUrl(s.comfyUrl || "http://127.0.0.1:8188");
      setT2iModel(s.t2iModel || "");
      setI2vModel(s.i2vModel || "");
      setLlmProvider(s.llmProvider || "deepseek");
      setLlmModel(s.llmModel || "deepseek-v4-flash");
      setLlmCustom(!LLM_PRESETS.some((p) => p.provider === (s.llmProvider || "deepseek") && p.model === (s.llmModel || "deepseek-v4-flash")));
      setTtsVoice(s.ttsVoice || "clone");
      setTtsBackend(s.ttsBackend || "auto");
      setTtsRefUrl(s.ttsRefUrl || "");
      setTtsRefText(s.ttsRefText || "");
      setMinimaxKey(s.keys?.minimax || "");
    });
    comfyStatus().then((r) => {
      setComfy(r.ok ? "已连" : "未连上");
      if (r.ok) void scan();
      else setScanHint("Comfy 未连上，连上后再扫模型");
    });
  }, [open]);

  if (!open) return null;

  const imgFam = imageModels.find((m) => m.file === t2iModel)?.family;
  const vidFam = videoModels.find((m) => m.file === i2vModel)?.family;

  return (
    <div className="modal-bg" onClick={() => setSettingsOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>模型与云端</h2>
        <p className="hint">画布在本机。出图可选本机 Comfy，或填 Key 走 ChatGPT / Gemini / Grok / 豆包 / 千问。出视频默认 MiniMax H3。配音可本机 GPT-SoVITS / IndexTTS，或云端仿声。</p>
        <h3>项目</h3>
        <label>
          片名
          <input value={bible.title} onChange={(e) => setBible({ title: e.target.value })} />
        </label>
        <div className="row">
          <label>
            画幅
            <select value={bible.aspect} onChange={(e) => setBible({ aspect: e.target.value as typeof bible.aspect })}>
              <option>16:9</option>
              <option>9:16</option>
              <option>1:1</option>
            </select>
          </label>
          <label>
            默认秒数
            <input type="number" value={bible.duration} onChange={(e) => setBible({ duration: Number(e.target.value) || 6 })} />
          </label>
        </div>
        <label>
          画风
          <textarea value={bible.style} onChange={(e) => setBible({ style: e.target.value })} />
        </label>
        <label>
          禁令
          <textarea value={bible.forbid} onChange={(e) => setBible({ forbid: e.target.value })} />
        </label>
        <h3>剧本 / 提示词用的大模型</h3>
        <div className="row">
          <label>
            预设
            <select
              value={llmCustom || !LLM_PRESETS.some((p) => p.provider === llmProvider && p.model === llmModel) ? "custom" : `${llmProvider}:${llmModel}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") {
                  setLlmCustom(true);
                  return;
                }
                const [p, ...rest] = v.split(":");
                setLlmCustom(false);
                setLlmProvider(p);
                setLlmModel(rest.join(":"));
              }}
            >
              {LLM_PRESETS.map((p) => (
                <option key={`${p.provider}:${p.model}`} value={`${p.provider}:${p.model}`}>
                  {p.label}
                </option>
              ))}
              <option value="custom">自定义</option>
            </select>
          </label>
          <label>
            服务商
            <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_META[p].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            模型 ID
            <input
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value);
                setLlmCustom(true);
              }}
              placeholder="deepseek-v4-flash 或中转站给的名字"
            />
          </label>
        </div>
        <p className="hint">
          拆剧本、合成提示词、H3 优化都走这里。顶部下拉也能换。DeepSeek 官网是 <code>deepseek-v4-flash</code> / <code>deepseek-v4-pro</code>；中转站如果叫 deepseek-v4-pro-flash，把那串原样贴进模型 ID。换完点保存，并在下面贴对应 Key。
        </p>
        <h3>API Key</h3>
        {providers.map((p) => (
          <label key={p}>
            {PROVIDER_META[p].label}
            <input
              value={keys[p]}
              placeholder={PROVIDER_META[p].keyHint}
              onChange={(e) => setKeys((k) => ({ ...k, [p]: e.target.value }))}
            />
          </label>
        ))}
        <h3>
          Comfy <b className="pill">{comfy}</b>
        </h3>
        <label>
          地址（隧道一般是 http://127.0.0.1:8188）
          <input value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} placeholder="http://127.0.0.1:8188" />
        </label>
        <div className="row">
          <label>
            出图模型
            <select
              value={t2iModel}
              onChange={async (e) => {
                const v = e.target.value;
                setT2iModel(v);
                await pickComfyModels({ t2iModel: v });
                setToast("出图模型已换");
              }}
            >
              {!imageModels.length && !IMAGE_API_MODELS.length ? <option value="">先连上再扫，或选云端</option> : null}
              <optgroup label="云端出图（填 Key）">
                {IMAGE_API_MODELS.map((m) => (
                  <option key={m.file} value={m.file}>{m.label}</option>
                ))}
              </optgroup>
              {imageModels.some((m) => m.family === "qwen") ? (
                <optgroup label="Qwen Image">
                  {imageModels.filter((m) => m.family === "qwen").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {imageModels.some((m) => m.family === "qwen_edit") ? (
                <optgroup label="Qwen 多图参考">
                  {imageModels.filter((m) => m.family === "qwen_edit").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {imageModels.some((m) => m.family === "flux") ? (
                <optgroup label="Flux（这台缺 CLIP）">
                  {imageModels.filter((m) => m.family === "flux").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {imageModels.some((m) => m.family === "sdxl") ? (
                <optgroup label="Pony / SDXL">
                  {imageModels.filter((m) => m.family === "sdxl").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <label>
            出视频模型
            <select
              value={i2vModel}
              onChange={async (e) => {
                const v = e.target.value;
                setI2vModel(v);
                await pickComfyModels({ i2vModel: v });
                setToast("出视频模型已换");
              }}
            >
              {!videoModels.length ? <option value="">先连上再扫</option> : null}
              {videoModels.some((m) => m.family === "h3_ref2va") ? (
                <optgroup label="MiniMax H3 参考生视频">
                  {videoModels.filter((m) => m.family === "h3_ref2va").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {videoModels.some((m) => m.family === "h3_fl2va") ? (
                <optgroup label="MiniMax H3 首尾帧">
                  {videoModels.filter((m) => m.family === "h3_fl2va").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {videoModels.some((m) => m.family === "wan22_14b") ? (
                <optgroup label="Wan 2.2 14B（备选）">
                  {videoModels.filter((m) => m.family === "wan22_14b").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {videoModels.some((m) => m.family === "wan22_5b") ? (
                <optgroup label="Wan 2.2 5B（备选）">
                  {videoModels.filter((m) => m.family === "wan22_5b").map((m) => (
                    <option key={m.file} value={m.file}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        </div>
        <p className="hint">
          {scanHint}
          {imgFam ? ` 出图走 ${imgFam === "qwen" || imgFam === "qwen_edit" ? "Qwen Image" : imgFam === "flux" ? "Flux" : "Pony/SDXL"}。` : ""}
          {vidFam ? ` 视频走 ${vidFam === "h3_ref2va" ? "MiniMax H3 参考" : vidFam === "h3_fl2va" ? "MiniMax H3 首尾帧" : vidFam === "wan22_14b" ? "Wan 14B" : "Wan 5B"}。` : ""}
        </p>
        {extras.length ? <p className="hint">{extras.join(" · ")}</p> : null}
        <h3>配音 / 仿声</h3>
        <p className="hint">像 GPT-SoVITS：上传 3–15 秒清晰人声，再写这段音频里说的原文。有台词的镜头会自动铺配音节点。本机优先 Comfy（GPT-SoVITS / IndexTTS），没有就走千问复刻或 MiniMax。</p>
        <label>
          后端
          <select value={ttsBackend} onChange={(e) => setTtsBackend(e.target.value)}>
            <option value="auto">自动：本机仿声，不行再云端</option>
            <option value="comfy">只走本机 Comfy</option>
            <option value="cloud">只走云端</option>
          </select>
        </label>
        <label>
          默认音色
          <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
            {TTS_PRESETS.map((t) => (
              <option key={`${t.provider}:${t.voice}`} value={t.voice}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="file">
          {ttsRefUrl ? "已有参考音频，点此更换" : "上传仿声参考音频"}
          <input
            type="file"
            accept="audio/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const [a] = await uploadFiles([f]);
              if (a?.url) {
                setTtsRefUrl(a.url);
                setToast("参考音频已上传");
              }
            }}
          />
        </label>
        {ttsRefUrl ? <audio src={ttsRefUrl} controls style={{ width: "100%" }} /> : null}
        <label>
          参考音频里说的原文（GPT-SoVITS 建议填）
          <input value={ttsRefText} onChange={(e) => setTtsRefText(e.target.value)} placeholder="这段录音实际说了什么" />
        </label>
        <label>
          MiniMax 语音 Key（可选，云端仿声）
          <input value={minimaxKey} placeholder="MiniMax API Key" onChange={(e) => setMinimaxKey(e.target.value)} />
        </label>
        {ttsHint ? <p className="hint">{ttsHint}</p> : <p className="hint">本机没扫到仿声节点也没关系，云端千问 / MiniMax 也能仿。</p>}
        <div className="row">
          <button type="button" onClick={() => void scan()}>重新扫描</button>
          <label className="file">
            换出图工作流
            <input type="file" accept="application/json" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await uploadWorkflow("t2i", f);
              setToast("出图工作流已换");
            }} />
          </label>
        </div>
        <label className="file">
          换视频工作流
          <input type="file" accept="application/json" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await uploadWorkflow("i2v", f);
            setToast("视频工作流已换");
          }} />
        </label>
        <footer>
          <button
            className="primary"
            onClick={async () => {
              await saveSettings({
                keys: { ...keys, minimax: minimaxKey },
                comfyUrl,
                t2iModel,
                i2vModel,
                llmProvider,
                llmModel,
                customLlms: (() => {
                  const extras = [...(useStudio.getState().catalog.customLlms || [])];
                  const hit = LLM_PRESETS.some((p) => p.provider === llmProvider && p.model === llmModel);
                  const dup = extras.some((p) => p.provider === llmProvider && p.model === llmModel);
                  if (!hit && !dup && llmModel.trim()) extras.push({ provider: llmProvider as LlmProvider, model: llmModel.trim(), label: llmModel.trim() });
                  return extras;
                })(),
                ttsProvider: ttsVoice === "clone" || /long/.test(ttsVoice) ? "qwen" : "openai",
                ttsVoice,
                ttsBackend,
                ttsRefUrl,
                ttsRefText,
              });
              await pickComfyModels({ t2iModel, i2vModel });
              await useStudio.getState().loadCatalog();
              const st = await comfyStatus();
              setComfy(st.ok ? "已连" : "未连上");
              setToast(st.ok ? "已保存，Comfy 已连" : "已保存，Comfy 还没连上");
              setSettingsOpen(false);
            }}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
