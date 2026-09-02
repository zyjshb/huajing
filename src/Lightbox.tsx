import { useEffect, useState } from "react";
import { useStudio } from "./store";

export function Lightbox() {
  const preview = useStudio((s) => s.preview);
  const setPreview = useStudio((s) => s.setPreview);
  const [scale, setScale] = useState(1);
  useEffect(() => setScale(1), [preview?.url]);
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, setPreview]);
  if (!preview) return null;
  return (
    <div className="lightbox" onClick={() => setPreview(null)}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <b>{preview.title}</b>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((n) => Math.max(0.4, n - 0.25))}>−</button>
        <button type="button" onClick={() => setScale((n) => Math.min(4, n + 0.25))}>+</button>
        <button type="button" onClick={() => setPreview(null)}>关闭</button>
      </div>
      <div
        className="lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          setScale((n) => Math.min(4, Math.max(0.4, n + (e.deltaY > 0 ? -0.12 : 0.12))));
        }}
      >
        {preview.kind === "video" ? (
          <video src={preview.url} controls autoPlay style={{ transform: `scale(${scale})` }} />
        ) : (
          <img src={preview.url} alt={preview.title} style={{ transform: `scale(${scale})` }} />
        )}
      </div>
    </div>
  );
}
