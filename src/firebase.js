import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";

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

// Sanitize group code — uppercase alphanumeric only
export function sanitizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

// Write entire group state to Firebase
export function writeGroupState(groupCode, state) {
  const path = `groups/${groupCode}`;
  return set(ref(db, path), {
    ...state,
    lastUpdated: Date.now(),
  });
}

// Subscribe to group state changes
export function subscribeToGroup(groupCode, callback) {
  const path = `groups/${groupCode}`;
  const dbRef = ref(db, path);
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
  // Return unsubscribe function
  return () => off(dbRef);
}
