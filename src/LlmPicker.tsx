import { useEffect, useState } from "react";
import { groupLlmOptions, PROVIDER_META, type LlmProvider } from "./models";
import { useStudio } from "./store";

export function LlmPicker({ className }: { className?: string }) {
  const catalog = useStudio((s) => s.catalog);
  const extras = catalog.customLlms || [];
  const groups = groupLlmOptions(extras);
  const value = `${catalog.llmProvider}:${catalog.llmModel}`;
  const known = groups.some((g) => g.items.some((p) => `${p.provider}:${p.model}` === value));
  const [custom, setCustom] = useState(!known);
  const [provider, setProvider] = useState<LlmProvider>((catalog.llmProvider as LlmProvider) || "deepseek");
  const [model, setModel] = useState(catalog.llmModel || "");

  useEffect(() => {
    setProvider((catalog.llmProvider as LlmProvider) || "deepseek");
    setModel(catalog.llmModel || "");
    const hit = groupLlmOptions(catalog.customLlms || []).some(
      (g) => g.items.some((p) => p.provider === catalog.llmProvider && p.model === catalog.llmModel),
    );
    setCustom(!hit);
  }, [catalog.llmProvider, catalog.llmModel, catalog.customLlms]);

  const apply = (p: LlmProvider, m: string, remember = false) => {
    const modelId = m.trim();
    if (!modelId) return;
    void useStudio.getState().setLlm({ provider: p, model: modelId, remember });
    setCustom(false);
  };

  return (
    <div className={className || "llm-pick"}>
      <span>大模型</span>
      <select
        value={known ? value : "custom"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") {
            setCustom(true);
            return;
          }
          const [p, ...rest] = v.split(":");
          apply(p as LlmProvider, rest.join(":"));
        }}
        title={catalog.llmModel}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((p) => (
              <option key={`${p.provider}:${p.model}`} value={`${p.provider}:${p.model}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="custom">{known ? "自定义模型 ID…" : `当前 ${catalog.llmModel}`}</option>
      </select>
      {custom ? (
        <div className="llm-custom">
          <select value={provider} onChange={(e) => setProvider(e.target.value as LlmProvider)}>
            {(Object.keys(PROVIDER_META) as LlmProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_META[p].label}
              </option>
            ))}
          </select>
          <input
            value={model}
            placeholder="模型 ID，如 deepseek-v4-flash"
            onChange={(e) => setModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply(provider, model, true);
            }}
          />
          <button type="button" className="primary" onClick={() => apply(provider, model, true)}>
            用这个
          </button>
        </div>
      ) : null}
    </div>
  );
}
