import React from "react";

// Marketing announcement bar that sits above the nav on every public-
// facing page (Landing, PublicCatalog, PublicPDP). Renders a continuous
// horizontal marquee of catchy operational promises so first-time
// visitors immediately know the value props (zero MOQ, same-day dispatch,
// etc.) without scrolling.
//
// Design choices:
//   • Scrolls away with the page (not sticky) so the nav can keep its
//     own sticky top:0 without stacking conflicts.
//   • Items are duplicated once in the DOM so the keyframe can translate
//     -50% and produce a seamless infinite loop without a visible jump.
//   • Pauses on hover so users can read a specific item.
//   • CSS-only animation — no JS timers, no react-spring, no deps.
//   • All copy is generic (no client brand names, no removed claims like
//     "Made in Delhi" or "eco-friendly inks").

const ITEMS = [
  { icon: "★", text: "ZERO MOQ — order 1 piece or 10,000" },
  { icon: "⚡", text: "SAME-DAY DISPATCH on orders placed by 2 PM" },
  { icon: "✦", text: "DTF PRINTING IN-HOUSE — soft hand-feel · wash-resistant" },
  { icon: "◆", text: "FROM SAMPLE TO SHIP in 48 hours" },
  { icon: "✓", text: "GST-REGISTERED — audit-ready invoicing in one click" },
  { icon: "→", text: "SHOPIFY SYNC — orders flow straight into production" },
  { icon: "●", text: "LIVE PER-PIECE TRACKING — 30+ courier partners" },
  { icon: "✺", text: "NO SETUP FEES · NO HIDDEN COSTS · TRANSPARENT PRICING" },
];

export default function AnnouncementBar() {
  // Render the list twice so the -50% translateX loop is seamless.
  return (
    <>
      <style>{CSS}</style>
      <div className="ann-bar" role="region" aria-label="Aviva announcements">
        <div className="ann-track">
          {[0, 1].map(copy => (
            <div className="ann-row" key={copy} aria-hidden={copy === 1}>
              {ITEMS.map((it, i) => (
                <span className="ann-item" key={`${copy}-${i}`}>
                  <span className="ann-icon" aria-hidden>{it.icon}</span>
                  <span className="ann-text">{it.text}</span>
                  <span className="ann-sep" aria-hidden>·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const CSS = `
.ann-bar {
  width: 100%;
  background: #0a0a0a;
  color: #efefef;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  overflow: hidden;
  position: relative;
  /* Subtle inner top-edge highlight so the bar reads as a discrete
     strip even when the page bg is also near-black. */
  box-shadow: inset 0 -1px 0 rgba(255,255,255,0.04);
}
/* Soft fade-out at both edges so items don't pop in/out hard. */
.ann-bar::before,
.ann-bar::after {
  content: "";
  position: absolute; top: 0; bottom: 0; width: 80px;
  pointer-events: none; z-index: 2;
}
.ann-bar::before { left: 0;  background: linear-gradient(90deg, #0a0a0a, transparent); }
.ann-bar::after  { right: 0; background: linear-gradient(270deg, #0a0a0a, transparent); }

.ann-track {
  display: flex;
  width: max-content;
  /* 32s for a full loop — slow enough to read each item, fast enough
     that the bar feels alive. Pause on hover so users can read. */
  animation: ann-scroll 32s linear infinite;
}
.ann-bar:hover .ann-track { animation-play-state: paused; }
@keyframes ann-scroll {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(-50%, 0, 0); }
}

.ann-row {
  display: flex; align-items: center;
  padding: 9px 0;
  flex-shrink: 0;
}
.ann-item {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 0 26px;
  white-space: nowrap;
  font-weight: 600;
}
.ann-icon {
  color: #efefef;
  opacity: 0.9;
  font-size: 12px;
  line-height: 1;
}
.ann-text { color: #efefef; }
.ann-sep {
  color: rgba(239,239,239,0.35);
  margin-left: 26px;
  font-weight: 400;
}
/* Last item in the row should not show a trailing separator — but
   since we duplicate the row, the separator visually connects the
   loop boundary, so we keep it. Only the very last item of the very
   second copy gets hidden so right-edge readers don't see a stray
   bullet mid-fade. */
.ann-row:last-child .ann-item:last-child .ann-sep { display: none; }

@media (max-width: 720px) {
  .ann-bar { font-size: 10.5px; }
  .ann-item { padding: 0 18px; gap: 6px; }
  .ann-sep { margin-left: 18px; }
  .ann-bar::before, .ann-bar::after { width: 40px; }
}

/* Respect users who prefer reduced motion — freeze the marquee. */
@media (prefers-reduced-motion: reduce) {
  .ann-track { animation: none; }
  .ann-bar { overflow-x: auto; }
}

/* Light-mode invert: catalog + PDP pages force light theme via
   <html data-theme="light">. Flip the bar so it stays high contrast. */
:root[data-theme="light"] .ann-bar {
  background: #0a0a0a;
  color: #efefef;
  /* Bar stays dark on light pages — that's the whole point, it should
     pop against the cream catalog/PDP background. */
}
`;
