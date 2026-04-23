import { useState } from "react";
import { MASTER_PIN } from "./GroupEntry";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f";

// Role hierarchy: guest < scorer < manager < master
export const ROLES = { guest: 0, scorer: 1, manager: 2, master: 3 };
export const ROLE_LABELS = {
  guest:   { label: "👁️ Guest",   color: "#888" },
  scorer:  { label: "🪓 Scorer",  color: "#4a90d9" },
  manager: { label: "⚙️ Manager", color: GOLD },
  master:  { label: "🔴 Master",  color: "#e63946" },
};

export function canScore(role)   { return ROLES[role] >= ROLES.scorer; }
export function canManage(role)  { return ROLES[role] >= ROLES.manager; }
export function isMaster(role)   { return role === "master"; }

export default function PinModal({ roomPins, onUnlock, onClose, currentRole }) {
  // roomPins = { managerPin, scorerPin } from Firebase
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const tryUnlock = () => {
    if (pin === MASTER_PIN) { onUnlock("master"); return; }
    if (roomPins?.managerPin && pin === roomPins.managerPin) { onUnlock("manager"); return; }
    if (roomPins?.scorerPin  && pin === roomPins.scorerPin)  { onUnlock("scorer");  return; }
    setError("Wrong PIN. Try again.");
    setPin("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#111", border: `2px solid ${GOLD}`, borderRadius: 16,
        padding: 28, maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
        <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
          Enter PIN
        </div>
        <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
          Current: <span style={{ color: ROLE_LABELS[currentRole]?.color }}>{ROLE_LABELS[currentRole]?.label}</span><br/>
          Scorer PIN → score matches<br/>
          Manager PIN → full room control
        </div>
        <input type="password" value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          placeholder="Enter PIN"
          autoFocus
          style={{ width: "100%", background: "#1a1a1a",
            border: `2px solid ${error ? RED : "#333"}`,
            borderRadius: 10, padding: "14px", color: "#fff",
            fontFamily: "monospace", fontSize: 20, textAlign: "center",
            outline: "none", boxSizing: "border-box", marginBottom: 8,
            letterSpacing: 4 }} />
        {error && <div style={{ color: RED, fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: "#222", color: "#aaa", border: "1px solid #444",
              borderRadius: 10, padding: "12px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={tryUnlock}
            style={{ flex: 1, background: GOLD, color: DARK, border: "none",
              borderRadius: 10, padding: "12px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>
            🔓 Unlock
          </button>
        </div>
        {canScore(currentRole) && (
          <button onClick={() => onUnlock("guest")}
            style={{ marginTop: 12, background: "transparent", border: "none",
              color: "#555", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>
            Lock back to Guest mode
          </button>
        )}
      </div>
    </div>
  );
}
