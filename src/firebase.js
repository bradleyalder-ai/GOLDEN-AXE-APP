import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, update, get, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBraiLVl5ZOIvBAszhvtEBV8fSP9MHJyVI",
  authDomain: "golden-axe-app.firebaseapp.com",
  databaseURL: "https://golden-axe-app-default-rtdb.firebaseio.com",
  projectId: "golden-axe-app",
  storageBucket: "golden-axe-app.appspot.com",
  messagingSenderId: "700781996951",
  appId: "1:700781996951:web:8bc796d996023a1c9cf2d2",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export function sanitizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

// Write a SINGLE field — prevents one device overwriting another's changes
export function writeField(groupCode, field, value) {
  const path = `groups/${groupCode}`;
  return update(ref(db, path), {
    [field]: value,
    lastUpdated: Date.now(),
  });
}

// Write all fields at once — only used on first push after confirming Firebase is empty
export function writeGroupState(groupCode, state) {
  const path = `groups/${groupCode}`;
  return set(ref(db, path), { ...state, lastUpdated: Date.now() });
}

// Check if a group already has data
export async function groupExists(groupCode) {
  const snap = await get(ref(db, `groups/${groupCode}/lastUpdated`));
  return snap.exists();
}

// Subscribe to group state changes
export function subscribeToGroup(groupCode, callback) {
  const dbRef = ref(db, `groups/${groupCode}`);
  onValue(dbRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(dbRef);
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
// Submit a leaderboard entry — only keeps top 100, only improves existing entries
export async function submitLeaderboardEntry(shopRoomCode, category, name, score, context = "") {
  if (!shopRoomCode || !name || score === undefined) return;

  const db = getDatabase();
  const lbPath = `leaderboards/${shopRoomCode}/${category}`;
  const lbRef = ref(db, lbPath);

  const snap = await get(lbRef);
  const existing = snap.val() || {};

  const existingKey = Object.keys(existing).find(k =>
    existing[k].name?.toLowerCase() === name.toLowerCase()
  );

  if (existingKey) {
    if (score <= existing[existingKey].score) return;
    await update(ref(db, `${lbPath}/${existingKey}`), {
      score, date: Date.now(), context,
    });
  } else {
    const newKey = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await update(ref(db, `${lbPath}/${newKey}`), {
      name, score, date: Date.now(), context,
    });

    const allEntries = { ...existing, [newKey]: { name, score, date: Date.now(), context } };
    const sorted = Object.entries(allEntries).sort((a, b) => b[1].score - a[1].score);
    if (sorted.length > 100) {
      for (const [key] of sorted.slice(100)) {
        await update(ref(db, `${lbPath}/${key}`), null);
      }
    }
  }
}

// Subscribe to shop-level settings (PINs, logo, name) — persists across all rooms
export function subscribeToShopSettings(settingsCode, callback) {
  const dbRef = ref(db, `shopSettings/${settingsCode}`);
  onValue(dbRef, snap => callback(snap.val() || {}));
  return () => off(dbRef);
}
