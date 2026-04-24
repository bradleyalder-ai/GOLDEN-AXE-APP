import { useState } from "react";
import { sanitizeCode } from "./firebase";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f";

// ── REGISTERED SHOPS ─────────────────────────────────────────────────────────
// Add new shops here — roomCode must match what the manager set up in Firebase
const SHOPS = [
  {
    roomCode: "AXEWPG",
    name: "Axe Winnipeg",
    city: "Winnipeg, MB",
    emoji: "🪓",
    color: "#c1121f",
    accent: "#ff4444",
    bg: "#1a0000",
    logo: null, // set to URL string once they have one
    tagline: "Winnipeg's Premier Axe Throwing",
  },
  {
    roomCode: "AXEYYC",
    name: "Axe Calgary",
    city: "Calgary, AB",
    emoji: "🪓",
    color: "#1d6a96",
    accent: "#4a90d9",
    bg: "#00101a",
    logo: null,
    tagline: "Calgary's Premier Axe Throwing",
  },
];

export default function Directory({ onJoin }) {
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [entering, setEntering] = useState(null); // roomCode being entered

  const handleShopTap = (shop) => {
    setEntering(shop.roomCode);
    setTimeout(() => {
      onJoin(shop.roomCode);
      setEntering(null);
    }, 400);
  };

  const handleManualJoin = () => {
    const clean = sanitizeCode(manualCode);
    if (clean.length < 3) { setError("Code must be at least 3 characters."); return; }
    onJoin(clean);
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 40px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 64, marginBottom: 10 }}>🪓</div>
        <h1 style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 30, margin: "0 0 6px",
          letterSpacing: 3, textTransform: "uppercase" }}>Golden Axe</h1>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12, letterSpacing: 2 }}>
          GAME CENTER
        </div>
      </div>

      {/* Shop tiles */}
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11,
          letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>
          SELECT YOUR LOCATION
        </div>

        {SHOPS.map(shop => (
          <div key={shop.roomCode}
            onClick={() => handleShopTap(shop)}
            style={{
              background: entering === shop.roomCode ? shop.color : shop.bg,
              border: `2px solid ${entering === shop.roomCode ? shop.accent : shop.color}`,
              borderRadius: 16, padding: "22px 24px", marginBottom: 14, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 18,
              transition: "all 0.2s", transform: entering === shop.roomCode ? "scale(0.97)" : "scale(1)",
              boxShadow: entering === shop.roomCode ? `0 0 24px ${shop.color}66` : "none",
            }}>
            {/* Logo or emoji */}
            <div style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 12,
              background: `${shop.color}22`, border: `1px solid ${shop.color}44`,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {shop.logo
                ? <img src={shop.logo} alt={shop.name}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <span style={{ fontSize: 32 }}>{shop.emoji}</span>
              }
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: shop.accent, fontFamily: "Georgia, serif",
                fontSize: 20, fontWeight: "bold", marginBottom: 3 }}>
                {shop.name}
              </div>
              <div style={{ color: "#666", fontFamily: "monospace", fontSize: 12, marginBottom: 4 }}>
                📍 {shop.city}
              </div>
              <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11 }}>
                {shop.tagline}
              </div>
            </div>

            <div style={{ color: entering === shop.roomCode ? "#fff" : shop.color,
              fontSize: entering === shop.roomCode ? 20 : 24, flexShrink: 0 }}>
              {entering === shop.roomCode ? "⏳" : "›"}
            </div>
          </div>
        ))}
      </div>

      {/* Staff / custom room login */}
      <div style={{ width: "100%", maxWidth: 440, marginTop: 12 }}>
        {!showManual ? (
          <button onClick={() => setShowManual(true)}
            style={{ width: "100%", background: "transparent", border: "1px solid #222",
              borderRadius: 10, padding: "12px", fontFamily: "monospace", fontSize: 12,
              color: "#444", cursor: "pointer" }}>
            🔑 Staff / Custom Room Login
          </button>
        ) : (
          <div style={{ background: "#0d0d0d", border: "1px solid #333", borderRadius: 12, padding: 20 }}>
            <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12,
              marginBottom: 14, textAlign: "center" }}>
              Enter your room code
            </div>
            <input value={manualCode}
              onChange={e => { setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleManualJoin()}
              placeholder="ROOM CODE" maxLength={12} autoCapitalize="characters"
              style={{ width: "100%", background: "#1a1a1a",
                border: `2px solid ${error ? RED : manualCode.length >= 3 ? GOLD : "#333"}`,
                borderRadius: 10, padding: "14px", color: "#fff", fontFamily: "monospace",
                fontSize: 20, letterSpacing: 4, textAlign: "center", outline: "none",
                boxSizing: "border-box", marginBottom: 8 }} />
            {error && <div style={{ color: RED, fontFamily: "monospace", fontSize: 12,
              marginBottom: 8, textAlign: "center" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowManual(false); setManualCode(""); setError(""); }}
                style={{ flex: 1, background: "#1a1a1a", color: "#666", border: "1px solid #333",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleManualJoin} disabled={manualCode.length < 3}
                style={{ flex: 2, background: manualCode.length >= 3 ? GOLD : "#222",
                  color: manualCode.length >= 3 ? DARK : "#555", border: "none",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace",
                  fontWeight: "bold", fontSize: 14, cursor: manualCode.length < 3 ? "not-allowed" : "pointer" }}>
                🪓 Enter Room
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, color: "#2a2a2a", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>
        GOLDEN AXE GAME CENTER © 2026
      </div>
    </div>
  );
}
