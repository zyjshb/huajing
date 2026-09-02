import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Clapperboard, Image as ImageIcon, Music, Plus, Settings2, Type, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BatchSheet } from "./BatchSheet";
import { Generator } from "./Generator";
import { LlmPicker } from "./LlmPicker";
import { Lightbox } from "./Lightbox";
import { ScriptStudio } from "./ScriptStudio";
import { HistoryPanel, HistoryButton } from "./HistoryPanel";
import { SettingsModal } from "./Settings";
import { comfyStatus } from "./api";
import { nodeTypes } from "./nodes";
import { hydrateCanvas, labels, useStudio, type StudioNode } from "./store";
import type { NodeKind } from "./types";

const kinds: NodeKind[] = ["text", "image", "video", "audio", "script"];
const icons = { text: Type, image: ImageIcon, video: Video, audio: Music, script: Clapperboard };

function orderKinds(from?: NodeKind): NodeKind[] {
  if (from === "text") return ["script", "image", "video", "text", "audio"];
  if (from === "script") return ["image", "video", "text", "audio", "script"];
  if (from === "image") return ["video", "audio", "image", "text", "script"];
  if (from === "video") return ["audio", "image", "video", "text", "script"];
  return kinds;
}

function CanvasInner() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const onNodesChange = useStudio((s) => s.onNodesChange);
  const onEdgesChange = useStudio((s) => s.onEdgesChange);
  const onConnect = useStudio((s) => s.onConnect);
  const addNode = useStudio((s) => s.addNode);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const [zoom, setZoom] = useState(100);
  const [space, setSpace] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number; flow: { x: number; y: number }; from?: string; fromKind?: NodeKind } | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || !nodes.length) return;
    fitted.current = true;
    const t = window.setTimeout(() => fitView({ padding: 0.22, maxZoom: 1 }), 80);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const place = (kind: NodeKind) => {
    if (!picker) return;
    if (picker.from) useStudio.getState().addConnected(picker.from, kind, picker.flow);
    else addNode(kind, picker.flow);
    setPicker(null);
  };

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const files = e.dataTransfer.files;
      if (!files?.length) {
        const kind = e.dataTransfer.getData("kind") as NodeKind;
        if (kind) addNode(kind, pos);
        return;
      }
      const scripts = Array.from(files).filter((f) => /\.(txt|json|md)$/i.test(f.name));
      if (scripts.length) {
        for (const f of scripts) useStudio.getState().importScript(await f.text(), pos);
        return;
      }
      const { uploadFiles } = await import("./api");
      const uploaded = await uploadFiles(files);
      uploaded.forEach((a, i) => {
        const mime = a.mime || "";
        const kind: NodeKind = mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image";
        addNode(kind, { x: pos.x + i * 40, y: pos.y + i * 40 }, { title: a.name, url: a.url } as never);
      });
    },
    [addNode, screenToFlowPosition],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: { toNode?: unknown; fromNode?: { id: string } | null }) => {
      if (state.toNode || !state.fromNode) return;
      const fromId = state.fromNode.id;
      const ev = "changedTouches" in event ? event.changedTouches[0] : event;
      const target = event.target as HTMLElement;
      if (!target?.classList?.contains("react-flow__pane")) return;
      const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const src = useStudio.getState().nodes.find((n) => n.id === fromId);
      setPicker({ x: ev.clientX, y: ev.clientY, flow, from: fromId, fromKind: src?.data.kind });
    },
    [screenToFlowPosition],
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect as (c: Connection) => void}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={(_, n) => {
          if (n.data.kind !== "script") return;
          if (n.data.script.shots.length) useStudio.getState().setScriptFull(n.id);
          else void useStudio.getState().parseOrWriteScript(n.id);
        }}
        onMove={(_, vp) => setZoom(Math.round(vp.zoom * 100))}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={onDrop}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setPicker({
            x: e.clientX,
            y: e.clientY,
            flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          });
        }}
        onDoubleClick={(e) => {
          const t = e.target as HTMLElement;
          if (!t.classList.contains("react-flow__pane")) return;
          setPicker({
            x: e.clientX,
            y: e.clientY,
            flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          });
        }}
        minZoom={0.12}
        defaultViewport={{ x: 80, y: 40, zoom: 1 }}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#3d5f8a", strokeWidth: 1.6 } }}
        connectionLineStyle={{ stroke: "#5b9dff", strokeWidth: 1.6 }}
        panOnDrag={space ? true : [1, 2]}
        selectionOnDrag={!space}
        multiSelectionKeyCode="Shift"
        panOnScroll
        zoomOnScroll
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} color="#262830" />
        <MiniMap pannable zoomable maskColor="rgba(8,8,10,.78)" nodeColor="#3a3d48" />
      </ReactFlow>
      <div className="zoom-readout">
        <button type="button" onClick={() => zoomOut()}>−</button>
        <span>{zoom}%</span>
        <button type="button" onClick={() => zoomIn()}>+</button>
        <button type="button" onClick={() => fitView({ maxZoom: 1 })}>适应</button>
      </div>
      {picker ? (
        <div className="picker" style={{ left: picker.x, top: picker.y }} onMouseLeave={() => setPicker(null)}>
          <b>{picker.from ? (picker.fromKind === "text" ? "接到脚本生成器" : "接到新节点") : "添加节点"}</b>
          {orderKinds(picker.fromKind).map((k) => {
            const Ico = icons[k];
            return (
              <button key={k} type="button" className={k === orderKinds(picker.fromKind)[0] && picker.from ? "rec" : ""} onClick={() => place(k)}>
                <Ico size={14} /> {labels[k]}
                {k === orderKinds(picker.fromKind)[0] && picker.from ? <em>推荐</em> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  const bible = useStudio((s) => s.bible);
  const setBible = useStudio((s) => s.setBible);
  const busy = useStudio((s) => s.busy);
  const toast = useStudio((s) => s.toast);
  const setSettingsOpen = useStudio((s) => s.setSettingsOpen);
  const nodes = useStudio((s) => s.nodes);
  const scriptFull = useStudio((s) => s.scriptFull);
  const scriptNode = useMemo(
    () => nodes.find((n) => n.data.kind === "script" && n.data.script.shots.length),
    [nodes],
  );
  const [cloud, setCloud] = useState("Comfy");
  const [plus, setPlus] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hydrateCanvas().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    comfyStatus().then((r) => setCloud(r.ok ? "Comfy on" : "Comfy off"));
  }, []);

  if (!ready) {
    return (
      <div className="app">
        <section className="stage">
          <div className="empty-hint">
            <h2>Shotfield</h2>
            <p>Loading…</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`app ${scriptFull ? "studio-on" : ""}`}>
      <header className="top">
        <div className="left">
          <input className="ws" value={bible.title} onChange={(e) => setBible({ title: e.target.value })} placeholder="Untitled" />
          <button type="button" className="ghost" onClick={() => useStudio.getState().newCanvas()}>
            New
          </button>
          <HistoryButton />
        </div>
        <div className="actions">
          {scriptNode && !scriptFull ? (
            <div className="script-tools">
              <button type="button" onClick={() => useStudio.getState().setScriptFull(scriptNode.id)}>
                Open script
              </button>
              {scriptNode.data.kind === "script" && scriptNode.data.promptsReady ? (
                <>
                  <button type="button" className="primary" onClick={() => useStudio.getState().armBatch(scriptNode.id, "boards")}>
                    Batch boards
                  </button>
                  <button type="button" className="primary" onClick={() => useStudio.getState().armBatch(scriptNode.id, "videos")}>
                    Batch video
                  </button>
                </>
              ) : null}
              {scriptNode.data.kind === "script" ? (
                <button type="button" onClick={() => useStudio.getState().armBatch(scriptNode.id, "audios")}>
                  Batch voice
                </button>
              ) : null}
            </div>
          ) : null}
          {busy ? <span className="busy">{busy}</span> : <span className="pill">{cloud}</span>}
          <LlmPicker />
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} />
            Settings
          </button>
        </div>
      </header>
      <section className="stage">
        <ReactFlowProvider>
          <CanvasInner />
        </ReactFlowProvider>
        <div className="dock">
          <button type="button" className="plus" onClick={() => setPlus((v) => !v)}>
            <Plus size={18} />
          </button>
          {plus ? (
            <div className="add-menu">
              {kinds.map((k) => {
                const Ico = icons[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const id = useStudio.getState().addNode(k, { x: 160 + Math.random() * 80, y: 140 + Math.random() * 60 });
                      useStudio.getState().selectOnly(id);
                      setPlus(false);
                    }}
                  >
                    <Ico size={14} /> {labels[k]}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {nodes.length ? <Generator /> : null}
        {scriptFull ? <ScriptStudio id={scriptFull} /> : null}
        {!nodes.length ? (
          <div className="empty-hint">
            <h2>Shotfield</h2>
            <p>Empty canvas. Click Start from a script, or drop a txt. New canvas anytime from the top left.</p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const play = useStudio.getState().addNode("text", { x: 80, y: 140 });
                useStudio.getState().addConnected(play, "script", { x: 520, y: 140 });
              }}
            >
              Start from a script
            </button>
            <p className="hint">Or drag a txt onto the canvas. Pull a script node from the + on the right. Past projects live in History.</p>
          </div>
        ) : null}
      </section>
      <SettingsModal />
      <HistoryPanel />
      <BatchSheet />
      <Lightbox />
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

