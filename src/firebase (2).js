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
