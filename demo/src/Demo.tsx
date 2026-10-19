import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  BROWSER_IN,
  BROWSER_OUT,
  CAPTIONS,
  CARD_HOLD,
  CLEAR_AT,
  END,
  LINES,
  SCROLLS,
  TASK_CLICK,
  TERM_IN,
  TITLE,
  VERDICT_A,
  VERDICT_B,
} from "./timeline";

const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Inter, sans-serif";
const MONO = "'SF Mono', Menlo, Monaco, monospace";
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

// ---------------------------------------------------------------- wallpaper

const Wallpaper: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(1200px 800px at 12% 18%, #2e3a8c 0%, transparent 60%), radial-gradient(1000px 760px at 88% 22%, #0f6b6a 0%, transparent 60%), radial-gradient(1300px 900px at 55% 105%, #5b2a86 0%, transparent 62%), linear-gradient(160deg, #10142b 0%, #0b1020 100%)",
    }}
  />
);

// ---------------------------------------------------------------- logo + cards

const Capsule: React.FC<{ size: number; ink?: string }> = ({ size, ink = "#f4f4f5" }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
    <g transform="rotate(-38 60 60)">
      <path d="M60 42 H84 A18 18 0 0 1 84 78 H60 Z" fill={ink} />
      <rect x="18" y="42" width="84" height="36" rx="18" fill="none" stroke={ink} strokeWidth="5" />
      <line x1="60" y1="42" x2="60" y2="78" stroke={ink} strokeWidth="5" />
    </g>
  </svg>
);

const TitleCard: React.FC<{ frame: number }> = ({ frame }) => {
  const inn = ramp(frame, TITLE.from + 2, TITLE.from + 22);
  const outp = 1 - ramp(frame, TITLE.to - 18, TITLE.to);
  const o = inn * outp;
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o }}>
      <div style={{ transform: `translateY(${(1 - inn) * 18}px)`, textAlign: "center", color: "#f4f4f5", fontFamily: SANS }}>
        <Capsule size={150} />
        <div style={{ fontSize: 124, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 8 }}>Placebo</div>
        <div style={{ fontSize: 42, color: "#c7c9d9", marginTop: 6 }}>Clinical trials for AI agent skills</div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ frame: number }> = ({ frame }) => {
  const o = ramp(frame, END.from, END.from + 18);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o }}>
      <div style={{ textAlign: "center", color: "#f4f4f5", fontFamily: SANS, transform: `translateY(${(1 - o) * 16}px)` }}>
        <Capsule size={120} />
        <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: "-0.03em" }}>Placebo</div>
        <div style={{ fontSize: 38, color: "#c7c9d9", marginTop: 4 }}>Find out if a skill actually helps, before you trust it</div>
        <div
          style={{
            display: "inline-block",
            marginTop: 40,
            padding: "18px 34px",
            borderRadius: 16,
            background: "rgba(13,17,23,0.85)",
            border: "1px solid rgba(255,255,255,0.12)",
            fontFamily: MONO,
            fontSize: 34,
            color: "#e6edf3",
          }}
        >
          <span style={{ color: "#3fb950", fontWeight: 700 }}>$ </span>npx placebo-cli doctor
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- window chrome

const Lights: React.FC = () => (
  <div style={{ display: "flex", gap: 9 }}>
    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
      <span key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, display: "block" }} />
    ))}
  </div>
);

const Window: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  dark: boolean;
  title: React.ReactNode;
  barHeight?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ x, y, w, h, dark, title, barHeight = 42, style, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 16,
      overflow: "hidden",
      background: dark ? "#0d1117" : "#f6f5f1",
      boxShadow: "0 50px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
      ...style,
    }}
  >
    <div
      style={{
        height: barHeight,
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 18,
        background: dark ? "#161b22" : "#e9e7e1",
        borderBottom: `1px solid ${dark ? "#21262d" : "#d9d6ce"}`,
        fontFamily: SANS,
        fontSize: 16,
        color: dark ? "#8b949e" : "#6b6b73",
      }}
    >
      <Lights />
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>{title}</div>
      <div style={{ width: 60 }} />
    </div>
    <div style={{ position: "relative", height: h - barHeight }}>{children}</div>
  </div>
);

// ---------------------------------------------------------------- terminal

const COLORS: Record<string, string> = { g: "#3fb950", r: "#ff7b72", y: "#d29922", c: "#39c5cf", bl: "#79c0ff", dim: "#8b949e" };

function Styled({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let color: string | undefined;
  let bold = false;
  text.split(/(\[(?:g|r|y|c|bl|b|dim|\/)\])/).forEach((p, i) => {
    const tag = p.match(/^\[(g|r|y|c|bl|b|dim|\/)\]$/)?.[1];
    if (tag === "/") {
      color = undefined;
      bold = false;
    } else if (tag === "b") bold = true;
    else if (tag) color = COLORS[tag];
    else if (p) parts.push(<span key={i} style={{ color, fontWeight: bold ? 700 : 400 }}>{p}</span>);
  });
  return <>{parts}</>;
}

const plain = (s: string) => s.replace(/\[(?:g|r|y|c|bl|b|dim|\/)\]/g, "");

const TERM = { x: 150, y: 70, w: 1620, h: 880 };
const FONT = 19;
const LH = 28;
const PAD = 26;
const COLS = Math.floor((TERM.w - PAD * 2) / (FONT * 0.602));
const ROWS = Math.floor((TERM.h - 42 - PAD * 2) / LH);

const Terminal: React.FC<{ frame: number }> = ({ frame }) => {
  const session = frame >= CLEAR_AT ? "B" : "A";
  const shown = LINES.filter((l) => l.session === session && frame >= l.at);
  // rows each line occupies (long lines wrap like a real terminal); fractional while appearing
  let rows = 0;
  for (const l of shown) {
    const len = plain(l.text).length + (l.kind === "cmd" ? 2 : 0);
    const r = Math.max(1, Math.ceil(len / COLS));
    rows += r * Math.min(1, (frame - l.at + 1) / 4);
  }
  const scroll = Math.max(0, rows + 1 - ROWS) * LH;
  const verdictAt = session === "A" ? VERDICT_A : VERDICT_B;
  const blink = Math.floor(frame / 16) % 2 === 0;
  const last = shown[shown.length - 1];
  const idle = !last || (last.kind === "out" && frame > last.at + 2) || (last.kind === "cmd" && frame > last.typeEnd + 4);
  return (
    <div style={{ position: "absolute", inset: PAD, overflow: "hidden", fontFamily: MONO, fontSize: FONT, lineHeight: `${LH}px`, color: "#e6edf3" }}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        {shown.map((l, i) => {
          const isVerdict = l.text.includes("[b]VERDICT[/]");
          const glow = isVerdict ? ramp(frame, verdictAt, verdictAt + 12) : 0;
          if (l.kind === "cmd") {
            const n = Math.min(l.text.length, Math.floor(((frame - l.at) / Math.max(1, l.typeEnd - l.at)) * l.text.length));
            const typing = frame <= l.typeEnd + 3;
            return (
              <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: "#3fb950", fontWeight: 700 }}>{l.prompt === "$" ? "$ " : "  "}</span>
                {l.text.slice(0, n)}
                {typing && <span style={{ background: "#e6edf3", color: "#0d1117", opacity: 0.85 }}> </span>}
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                opacity: Math.min(1, (frame - l.at + 1) / 3),
                background: glow ? `rgba(${session === "A" ? "255,123,114" : "121,192,255"},${0.14 * glow})` : undefined,
                borderRadius: 6,
                margin: glow ? "0 -10px" : undefined,
                padding: glow ? "0 10px" : undefined,
              }}
            >
              {l.text ? <Styled text={l.text} /> : " "}
            </div>
          );
        })}
        {idle && (
          <div>
            <span style={{ color: "#3fb950", fontWeight: 700 }}>$ </span>
            <span style={{ background: blink ? "#e6edf3" : "transparent", opacity: 0.85 }}> </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- browser with the real report

const BROWSER = { x: 140, y: 64, w: 1640, h: 892, bar: 50 };
const IMG_W = 2880;
const PX = BROWSER.w / IMG_W; // image px to screen px
const CSS = BROWSER.w / 1440; // report css px to screen px
const scrollFor = (cssTop: number) => cssTop * CSS - 22;

function reportScroll(frame: number): number {
  let s = 0;
  for (const sc of SCROLLS) {
    const target = scrollFor(sc.cssTop);
    s = interpolate(frame, [sc.from, sc.to], [s, target], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
    if (frame < sc.to) break;
  }
  return s;
}

const Browser: React.FC<{ frame: number }> = ({ frame }) => {
  const scroll = reportScroll(frame);
  const open = frame >= TASK_CLICK;
  return (
    <Window
      x={0}
      y={0}
      w={BROWSER.w}
      h={BROWSER.h}
      dark={false}
      barHeight={BROWSER.bar}
      title={
        <div
          style={{
            width: 760,
            height: 30,
            borderRadius: 8,
            background: "#ffffff",
            border: "1px solid #d9d6ce",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 15,
            color: "#52525b",
            fontFamily: SANS,
          }}
        >
          <span style={{ color: "#a1a1aa" }}>file://</span>~/project/.placebo/trials/t_launch1/report.html
        </div>
      }
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#f6f5f1" }}>
        <Img
          src={staticFile(open ? "report-open.png" : "report.png")}
          style={{ position: "absolute", left: 0, top: -scroll, width: IMG_W * PX }}
        />
      </div>
    </Window>
  );
};

// ---------------------------------------------------------------- cursor

type Key = { f: number; x: number; y: number };
// Screen coordinates, read off rendered stills. Every move is bracketed by holds.
const CURSOR: Key[] = [
  { f: BROWSER_IN + 10, x: 1460, y: 860 },
  { f: CARD_HOLD.from + 6, x: 1460, y: 860 },
  { f: CARD_HOLD.from + 30, x: 560, y: 345 },
  { f: CARD_HOLD.from + 44, x: 560, y: 345 },
  { f: CARD_HOLD.from + 70, x: 990, y: 600 },
  { f: SCROLLS[0]!.from + 2, x: 990, y: 600 },
  { f: SCROLLS[0]!.to + 10, x: 990, y: 600 },
  { f: SCROLLS[0]!.to + 40, x: 1250, y: 470 },
  { f: SCROLLS[1]!.from, x: 1250, y: 470 },
  { f: SCROLLS[1]!.to + 30, x: 1300, y: 345 },
  { f: SCROLLS[2]!.from, x: 1300, y: 345 },
  { f: SCROLLS[2]!.to + 4, x: 1300, y: 345 },
  { f: TASK_CLICK - 2, x: 660, y: 270 },
  { f: BROWSER_OUT, x: 660, y: 270 },
];

function cursorAt(frame: number): { x: number; y: number } {
  if (frame <= CURSOR[0]!.f) return CURSOR[0]!;
  for (let i = 1; i < CURSOR.length; i++) {
    const a = CURSOR[i - 1]!;
    const b = CURSOR[i]!;
    if (frame <= b.f) {
      const p = interpolate(frame, [a.f, b.f], [0, 1], { ...clamp, easing: Easing.bezier(0.33, 0, 0.15, 1) });
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
  }
  return CURSOR[CURSOR.length - 1]!;
}

const Cursor: React.FC<{ frame: number }> = ({ frame }) => {
  const o = ramp(frame, BROWSER_IN + 10, BROWSER_IN + 20) * (1 - ramp(frame, BROWSER_OUT - 6, BROWSER_OUT + 4));
  if (o <= 0) return null;
  const { x, y } = cursorAt(frame);
  const click = frame - TASK_CLICK;
  const ripple = click >= 0 && click < 16 ? click / 16 : -1;
  const dip = click >= 0 && click < 5 ? 2 : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y + dip, opacity: o, pointerEvents: "none" }}>
      {ripple >= 0 && (
        <div
          style={{
            position: "absolute",
            left: -26 * (0.4 + ripple),
            top: -26 * (0.4 + ripple),
            width: 52 * (0.4 + ripple),
            height: 52 * (0.4 + ripple),
            borderRadius: "50%",
            border: "3px solid rgba(59,91,219,0.8)",
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width="30" height="40" viewBox="0 0 30 40" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.35))" }} aria-hidden>
        <path d="M2 2 L2 31 L9.5 24 L14.5 36 L19.5 34 L14.5 22.5 L25 22.5 Z" fill="#111" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------- captions

const Caption: React.FC<{ frame: number }> = ({ frame }) => {
  const c = CAPTIONS.find((k) => frame >= k.from && frame < k.to + 10);
  if (!c) return null;
  const o = ramp(frame, c.from, c.from + 8) * (1 - ramp(frame, c.to, c.to + 10));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 982, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          padding: "14px 30px",
          borderRadius: 999,
          background: "rgba(20,22,32,0.88)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#f4f4f5",
          fontFamily: SANS,
          fontSize: 31,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          transform: `translateY(${(1 - o) * 8}px)`,
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- composition

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const termIn = ramp(frame, TERM_IN, TERM_IN + 22);
  const termOut = 1 - ramp(frame, END.from - 4, END.from + 14);
  const browserIn = ramp(frame, BROWSER_IN, BROWSER_IN + 22);
  const browserOut = ramp(frame, BROWSER_OUT, BROWSER_OUT + 18);
  const browserShown = browserIn * (1 - browserOut);
  const termBehind = browserShown; // the terminal recedes while the browser is in front
  return (
    <AbsoluteFill style={{ background: "#0b1020" }}>
      <Wallpaper />
      <TitleCard frame={frame} />
      {termIn * termOut > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: termIn * termOut,
            transform: `translateY(${(1 - termIn) * 40}px) scale(${1 - 0.04 * termBehind})`,
            filter: termBehind > 0 ? `brightness(${1 - 0.35 * termBehind})` : undefined,
          }}
        >
          <Window
            x={TERM.x}
            y={TERM.y}
            w={TERM.w}
            h={TERM.h}
            dark
            title={<span>{frame >= CLEAR_AT ? "zsh · ~/project · placebo trial --baseline" : "zsh · ~/project · placebo trial"}</span>}
          >
            <Terminal frame={frame} />
          </Window>
        </div>
      )}
      {browserShown > 0 && (
        <div
          style={{
            position: "absolute",
            left: BROWSER.x,
            top: BROWSER.y,
            opacity: browserShown,
            transform: `translateY(${(1 - browserIn) * 60 + browserOut * 50}px) scale(${0.97 + 0.03 * browserIn})`,
          }}
        >
          <Browser frame={frame} />
        </div>
      )}
      <Cursor frame={frame} />
      <Caption frame={frame} />
      <EndCard frame={frame} />
    </AbsoluteFill>
  );
};
