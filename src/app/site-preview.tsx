"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoPayload } from "./demo/demo-client";

type Props = {
  payload: DemoPayload;
  themes: readonly string[];
  onSelectTheme: (name: DemoPayload["template"]) => void;
};

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;
const FRAME_HEIGHT = 820;

/** A live, scrollable view of the whole generated website. It reuses the real theme code through /demo,
 *  so choosing a theme here shows exactly the design the published site will have. */
export function SitePreview({ payload, themes, onSelectTheme }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [available, setAvailable] = useState(DESKTOP_WIDTH);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const latest = useRef(payload);

  useEffect(() => { latest.current = payload; }, [payload]);

  useEffect(() => {
    const post = () => frameRef.current?.contentWindow?.postMessage({ type: "forme-demo", payload: latest.current }, window.location.origin);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === "forme-demo-ready") { readyRef.current = true; post(); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    const id = window.setTimeout(() => frameRef.current?.contentWindow?.postMessage({ type: "forme-demo", payload }, window.location.origin), 250);
    return () => window.clearTimeout(id);
  }, [payload]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const innerWidth = device === "desktop" ? DESKTOP_WIDTH : MOBILE_WIDTH;
  const scale = Math.min(1, available / innerWidth);
  const address = `${(payload.name || "your-publication").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.site`;

  return (
    <div className="live">
      <div className="live-controls">
        <div className="live-tabs" role="group" aria-label="Choose a theme to preview">
          {themes.map((name) => (
            <button key={name} type="button" className={payload.template === name ? "on" : ""} aria-pressed={payload.template === name} onClick={() => onSelectTheme(name as DemoPayload["template"])}>{name}</button>
          ))}
        </div>
        <div className="live-device" role="group" aria-label="Preview size">
          <button type="button" className={device === "desktop" ? "on" : ""} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
          <button type="button" className={device === "mobile" ? "on" : ""} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile</button>
        </div>
      </div>

      <div className="live-stage" ref={stageRef}>
        <div className={`live-window ${device}`} style={{ width: innerWidth * scale }}>
          <div className="live-bar"><i /><i /><i /><span>{address}</span></div>
          <div className="live-viewport" style={{ height: FRAME_HEIGHT * scale }}>
            <iframe
              ref={frameRef}
              src="/demo"
              title={`Live preview of the ${payload.template} theme`}
              style={{ width: innerWidth, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      </div>
      <p className="live-note">This is the real site design. Scroll inside the frame to see the whole page, and change the theme or your details above to watch it update.</p>
    </div>
  );
}
