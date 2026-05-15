import React from "react";

// Placeholder landing page served at `/`. UI to be designed later — for now
// it's a clean dark splash with a staff-portal entry. The actual dashboard
// lives at /admin and is mounted by main.jsx based on the pathname.
export default function Landing() {
  return (
    <div className="lp">
      <style>{`
        :root { color-scheme: dark; }
        body { margin: 0; }
        .lp {
          min-height: 100vh;
          background: radial-gradient(1200px 600px at 50% -100px, #1b1c1f 0%, #0d0e0f 60%) #0d0e0f;
          color: #efefef;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          display: flex; flex-direction: column;
        }
        .lp-nav {
          padding: 22px 32px;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
          color: #aaa;
        }
        .lp-nav .brand { color: #fff; font-weight: 700; letter-spacing: 0.3em; }
        .lp-nav a {
          color: #aaa; text-decoration: none;
          padding: 8px 14px; border: 1px solid #2a2b2e; border-radius: 999px;
          transition: all 0.15s;
        }
        .lp-nav a:hover { color: #fff; border-color: #4a4b4e; }
        .lp-main {
          flex: 1;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          padding: 48px 24px;
          text-align: center;
        }
        .lp-eyebrow {
          font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase;
          color: #7a7b7e; margin-bottom: 18px;
        }
        .lp-title {
          font-size: clamp(38px, 7vw, 84px); font-weight: 800; line-height: 1.05;
          letter-spacing: -0.02em; margin: 0 0 18px 0;
          color: #fff;
        }
        .lp-sub {
          max-width: 560px; font-size: 16px; line-height: 1.55; color: #aaa;
          margin: 0 0 36px 0;
        }
        .lp-cta {
          display: inline-flex; align-items: center; gap: 10px;
          background: #efefef; color: #0d0e0f;
          padding: 14px 22px; font-size: 13px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          border-radius: 999px; text-decoration: none;
          transition: transform 0.15s;
        }
        .lp-cta:hover { transform: translateY(-1px); }
        .lp-foot {
          padding: 22px 32px;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
          color: #6a6b6e;
          border-top: 1px solid #1a1b1e;
        }
        .lp-foot a { color: #6a6b6e; text-decoration: none; }
        .lp-foot a:hover { color: #aaa; }
        @media (max-width: 600px) {
          .lp-nav, .lp-foot { padding: 16px 18px; flex-direction: column; gap: 12px; }
          .lp-main { padding: 32px 18px; }
        }
      `}</style>

      <header className="lp-nav">
        <div className="brand">AVIVA INTERNATIONAL</div>
        <a href="/admin">Staff login →</a>
      </header>

      <main className="lp-main">
        <div className="lp-eyebrow">Coming soon</div>
        <h1 className="lp-title">AVIVA INTERNATIONAL</h1>
        <p className="lp-sub">
          A new home is on the way. In the meantime, our team continues to print, pack and ship at full speed.
        </p>
        <a href="/admin" className="lp-cta">Staff portal →</a>
      </main>

      <footer className="lp-foot">
        <div>© {new Date().getFullYear()} AVIVA INTERNATIONAL</div>
        <a href="/admin">Staff login</a>
      </footer>
    </div>
  );
}
