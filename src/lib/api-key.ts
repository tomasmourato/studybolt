/*
 * The student's own Gemini API key. It only ever lives in this browser: in memory, plus session storage
 * (gone when the tab closes) or, if they ask to be remembered, local storage on this device.
 * It is sent to Google's Gemini API and nowhere else; StudyBolt's server never receives it.
 */

const STORAGE_KEY = "studybolt:gemini-api-key";
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  if (cached === undefined) cached = readStored();
  return cached;
}

export function isApiKeyRemembered() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

const emit = () => listeners.forEach((listener) => listener());

export function saveApiKey(key: string, remember: boolean) {
  cached = key;
  try {
    // Only one copy is kept, in whichever storage the student chose.
    if (remember) {
      localStorage.setItem(STORAGE_KEY, key);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, key);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be blocked; the key then lasts until the page is closed.
  }
  emit();
}

export function forgetApiKey() {
  cached = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  emit();
}

/** For useSyncExternalStore. Also follows a remembered key being added or removed in another tab. */
export function subscribeApiKey(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    cached = readStored();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A short, safe-to-show version of the key, such as "AQ.Ab8…x9Q2". */
export function maskApiKey(key: string) {
  return key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : "••••";
}
