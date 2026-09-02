export type LlmProvider = "gemini" | "openai" | "anthropic" | "deepseek" | "openrouter" | "grok" | "doubao" | "qwen";

export type CatalogPick = { file: string; label: string; family: string };

export type CustomLlm = { provider: LlmProvider; model: string; label: string };

export const LLM_PRESETS: CustomLlm[] = [
  { provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { provider: "deepseek", model: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { provider: "openai", model: "gpt-4.1", label: "ChatGPT 4.1" },
  { provider: "openai", model: "gpt-4o", label: "ChatGPT 4o" },
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { provider: "grok", model: "grok-4", label: "Grok 4" },
  { provider: "grok", model: "grok-3", label: "Grok 3" },
  { provider: "doubao", model: "doubao-seed-1-6-250615", label: "豆包 Seed 1.6" },
  { provider: "qwen", model: "qwen-plus", label: "通义千问 Plus" },
  { provider: "qwen", model: "qwen-max", label: "通义千问 Max" },
  { provider: "anthropic", model: "claude-sonnet-4-5", label: "Claude Sonnet" },
  { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", label: "OpenRouter Claude" },
];

export function isLlmProvider(v: string): v is LlmProvider {
  return v in PROVIDER_META;
}

export function llmKey(provider: string, model: string) {
  return `${provider}:${model}`;
}

export function mergeLlmOptions(extra: CustomLlm[] = []) {
  const seen = new Set(LLM_PRESETS.map((p) => llmKey(p.provider, p.model)));
  const rest = extra.filter((p) => {
    const k = llmKey(p.provider, p.model);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...LLM_PRESETS, ...rest];
}

export function groupLlmOptions(extra: CustomLlm[] = []) {
  const groups: { label: string; items: CustomLlm[] }[] = [];
  for (const p of mergeLlmOptions(extra)) {
    const label = PROVIDER_META[p.provider]?.label || p.provider;
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(p);
    else groups.push({ label, items: [p] });
  }
  return groups;
}

export const IMAGE_API_MODELS: CatalogPick[] = [
  { file: "api:openai:gpt-image-1", label: "ChatGPT · gpt-image-1", family: "api" },
  { file: "api:openai:dall-e-3", label: "ChatGPT · DALL·E 3", family: "api" },
  { file: "api:gemini:gemini-2.5-flash-image", label: "Gemini · 出图", family: "api" },
  { file: "api:grok:grok-2-image", label: "Grok · grok-2-image", family: "api" },
  { file: "api:doubao:doubao-seedream-4-0-250828", label: "豆包 · Seedream", family: "api" },
  { file: "api:qwen:qwen-image-plus", label: "通义千问 · 出图", family: "api" },
];

export const TTS_PRESETS: { provider: string; voice: string; label: string }[] = [
  { provider: "qwen", voice: "clone", label: "仿声 · 参考音频（本机 / 千问 / MiniMax）" },
  { provider: "openai", voice: "onyx", label: "ChatGPT · onyx 沉稳男声（预设，不是仿声）" },
  { provider: "openai", voice: "echo", label: "ChatGPT · echo" },
  { provider: "openai", voice: "nova", label: "ChatGPT · nova" },
  { provider: "qwen", voice: "longxiaochun", label: "千问 CosyVoice · 龙小淳" },
  { provider: "qwen", voice: "longcheng", label: "千问 CosyVoice · 龙橙" },
];

export const PROVIDER_META: Record<LlmProvider, { label: string; keyHint: string; baseHint: string }> = {
  openai: {
    label: "ChatGPT",
    keyHint: "OpenAI API Key",
    baseHint: "https://api.openai.com/v1",
  },
  gemini: {
    label: "Gemini",
    keyHint: "Google AI Studio API Key",
    baseHint: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  grok: {
    label: "Grok",
    keyHint: "xAI API Key",
    baseHint: "https://api.x.ai/v1",
  },
  doubao: {
    label: "豆包",
    keyHint: "火山方舟 ARK API Key",
    baseHint: "https://ark.cn-beijing.volces.com/api/v3",
  },
  qwen: {
    label: "通义千问",
    keyHint: "阿里云 DashScope API Key",
    baseHint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  anthropic: {
    label: "Claude",
    keyHint: "Anthropic API Key",
    baseHint: "https://api.anthropic.com",
  },
  deepseek: {
    label: "DeepSeek",
    keyHint: "DeepSeek API Key",
    baseHint: "https://api.deepseek.com/v1",
  },
  openrouter: {
    label: "OpenRouter",
    keyHint: "一把钥匙切 GPT / Claude / Gemini",
    baseHint: "https://openrouter.ai/api/v1",
  },
};

export function parseApiModel(file: string) {
  if (!file?.startsWith("api:")) return null;
  const [, provider, ...rest] = file.split(":");
  return { provider, model: rest.join(":") };
}

export function llmPresetValue(provider: string, model: string) {
  const hit = LLM_PRESETS.find((p) => p.provider === provider && p.model === model);
  return hit ? `${hit.provider}:${hit.model}` : `custom:${provider}:${model}`;
}
