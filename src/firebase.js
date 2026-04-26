import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, update, get } from "firebase/database";

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

  const { ref: dbRef, get, update, remove } = await import("firebase/database");
  const db = getDatabase();
  const lbPath = `leaderboards/${shopRoomCode}/${category}`;
  const lbRef = dbRef(db, lbPath);

  const snap = await get(lbRef);
  const existing = snap.val() || {};

  // Find if this player already has an entry
  const existingKey = Object.keys(existing).find(k =>
    existing[k].name?.toLowerCase() === name.toLowerCase()
  );

  if (existingKey) {
    // Only update if new score is better
    if (score <= existing[existingKey].score) return;
    await update(dbRef(db, `${lbPath}/${existingKey}`), {
      score, date: Date.now(), context,
    });
  } else {
    // Add new entry
    const newKey = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await update(dbRef(db, `${lbPath}/${newKey}`), {
      name, score, date: Date.now(), context,
    });

    // Trim to top 100
    const allEntries = { ...existing, [newKey]: { name, score, date: Date.now(), context } };
    const sorted = Object.entries(allEntries).sort((a, b) => b[1].score - a[1].score);
    if (sorted.length > 100) {
      const toRemove = sorted.slice(100);
      for (const [key] of toRemove) {
        await remove(dbRef(db, `${lbPath}/${key}`));
      }
    }
  }
}
