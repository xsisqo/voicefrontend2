// frontend/share-card.js
// VoiceSafe — Share Card (no dependencies)
// Creates a shareable image (PNG) with results + link.

(function () {
  const BRAND = "VoiceSafe";
  const BRAND_URL = "https://voicesafe.ai";

  function clamp(n, a, b) {
    n = Number(n);
    if (Number.isNaN(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function pickFromWindow() {
    // You can set this from your existing analyze code if you want later:
    // window.__voicesafe_share = { scam: 39, ai: 2, stress: 28, shareUrl: "..." }
    const d = window.__voicesafe_share;
    if (!d) return null;
    return {
      scam: clamp(d.scam ?? d.scamScore ?? 0, 0, 100),
      ai: clamp(d.ai ?? d.aiVoice ?? d.aiVoiceProbability ?? 0, 0, 100),
      stress: clamp(d.stress ?? 0, 0, 100),
      shareUrl: String(d.shareUrl || d.url || BRAND_URL),
    };
  }

  function pickFromDOM() {
    // Try best-effort parsing from the page (works even without edits)
    // Looks for numbers near labels.
    const text = document.body.innerText || "";
    const grab = (label) => {
      // e.g. "Scam score 39%" or "AI voice probability 2%"
      const re = new RegExp(`${label}[^0-9]{0,40}([0-9]{1,3})\\s*%`, "i");
      const m = text.match(re);
      return m ? clamp(m[1], 0, 100) : null;
    };

    const scam = grab("Scam score") ?? grab("Scam") ?? 0;
    const ai = grab("AI voice probability") ?? grab("AI voice") ?? 0;
    const stress = grab("Stress level") ?? grab("Stress") ?? 0;

    // Try to find a share link in DOM (button or input), else use current url
    let shareUrl = "";
    const shareLinkEl =
      document.querySelector('[data-share-link]') ||
      document.querySelector("#shareLink") ||
      document.querySelector('input[name="shareLink"]');

    if (shareLinkEl && shareLinkEl.value) shareUrl = shareLinkEl.value;
    if (!shareUrl) shareUrl = window.location.href || BRAND_URL;

    return { scam, ai, stress, shareUrl };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawBar(ctx, x, y, w, h, pct) {
    // background
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x, y, w, h);
    // fill
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x, y, (w * pct) / 100, h);
    ctx.globalAlpha = 1;
  }

  function fitText(ctx, text, maxWidth, baseSize, minSize) {
    let size = baseSize;
    ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    while (ctx.measureText(text).width > maxWidth && size > minSize) {
      size -= 1;
      ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    }
    return size;
  }

  function makeCard(data) {
    const W = 1080;
    const H = 1350;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background (dark gradient)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#0a0f1c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Top glow
    const g2 = ctx.createRadialGradient(W * 0.5, 140, 10, W * 0.5, 140, 600);
    g2.addColorStop(0, "rgba(255,214,102,0.20)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, 600);

    // Card container
    const pad = 70;
    const cardX = pad;
    const cardY = 150;
    const cardW = W - pad * 2;
    const cardH = H - 260;

    ctx.save();
    roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Header
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "800 54px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(`${BRAND} Report`, cardX + 48, cardY + 92);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("AI risk signals for scam calls/messages", cardX + 48, cardY + 135);

    // Scores
    const left = cardX + 48;
    let y = cardY + 220;

    function scoreBlock(title, value, hint) {
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.font = "700 32px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(title, left, y);

      ctx.fillStyle = "rgba(255,214,102,0.95)";
      ctx.font = "900 72px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(`${Math.round(value)}%`, left, y + 82);

      // bar
      const bx = left;
      const by = y + 112;
      const bw = cardW - 96;
      const bh = 18;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      drawBar(ctx, bx, by, bw, bh, clamp(value, 0, 100));

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 26px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(hint, left, y + 170);

      y += 240;
    }

    scoreBlock("Scam score", data.scam, "Higher = more suspicious. Verify via official channels.");
    scoreBlock("AI voice probability", data.ai, "Higher = more likely synthetic / generated voice.");
    scoreBlock("Stress level", data.stress, "Higher = elevated stress signal in voice.");

    // Footer info
    const footerY = cardY + cardH - 190;
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "600 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Share link:", left, footerY);

    const url = (data.shareUrl || BRAND_URL).replace(/\s+/g, "");
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const size = fitText(ctx, url, cardW - 96, 30, 22);
    ctx.font = `600 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(url, left, footerY + 46);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 22px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("VoiceSafe provides advisory signals (not biometric identity verification).", left, footerY + 92);

    // Small brand bottom
    ctx.fillStyle = "rgba(255,214,102,0.95)";
    ctx.font = "800 26px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("voicesafe.ai", left, footerY + 140);

    return canvas;
  }

  async function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
  }

  async function shareImage(blob, text, url) {
    const file = new File([blob], "voicesafe-report.png", { type: "image/png" });

    // Prefer native share with image
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "VoiceSafe Report",
        text,
        url,
        files: [file],
      });
      return;
    }

    // Fallback: download image
    const a = document.createElement("a");
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = "voicesafe-report.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1500);

    // Also copy link fallback
    try {
      await navigator.clipboard.writeText(url);
      alert("Share card downloaded. Link copied to clipboard.");
    } catch {
      alert("Share card downloaded.");
    }
  }

  async function onShareCardClick() {
    const data = pickFromWindow() || pickFromDOM();
    const canvas = makeCard(data);
    const blob = await canvasToBlob(canvas);

    const msg = `VoiceSafe: Scam ${Math.round(data.scam)}% · AI voice ${Math.round(data.ai)}% · Stress ${Math.round(data.stress)}%`;
    await shareImage(blob, msg, data.shareUrl || BRAND_URL);
  }

  function init() {
    const btn = document.getElementById("shareCardBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await onShareCardClick();
      } catch (e) {
        console.error("Share card failed:", e);
        alert("Share card failed. Check console.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();