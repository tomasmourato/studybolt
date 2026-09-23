/*
 * IndexedDB in the student's browser is the only place study sets are stored.
 * "sets" holds the study sets; "files" holds uploads and generated audio and images as Blobs, keyed by path.
 */

import type { StudySet } from "./types";

const DB_NAME = "studybolt";
const DB_VERSION = 1;
type StoreName = "sets" | "files";

let opening: Promise<IDBDatabase> | null = null;

function openDb() {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can't store study sets (IndexedDB is unavailable). Try another browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sets")) db.createObjectStore("sets", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema needs this connection out of the way.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Couldn't open the browser database."));
    };
  }));
}

/** Friendlier messages for the errors people actually hit. */
function storageError(err: unknown) {
  if (err instanceof DOMException && err.name === "QuotaExceededError") {
    return new Error("Your browser is out of storage space for StudyBolt. Delete some study sets or free up disk space.");
  }
  return err instanceof Error ? err : new Error("The browser database failed.");
}

function run<T>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T> | void) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
        tx.onerror = () => reject(storageError(tx.error));
        tx.onabort = () => reject(storageError(tx.error));
      }),
  );
}

export const readAllSets = () => run<StudySet[]>("sets", "readonly", (s) => s.getAll() as IDBRequest<StudySet[]>);
export const readSet = (id: string) => run<StudySet | undefined>("sets", "readonly", (s) => s.get(id));
export const writeSet = (set: StudySet) => run("sets", "readwrite", (s) => void s.put(set));
export const removeSet = (id: string) => run("sets", "readwrite", (s) => void s.delete(id));

export const readFile = (path: string) => run<Blob | undefined>("files", "readonly", (s) => s.get(path));
export const writeFile = (path: string, data: Blob) => run("files", "readwrite", (s) => void s.put(data, path));
/** Deletes every file whose path starts with the prefix. */
export const removeFiles = (prefix: string) =>
  run("files", "readwrite", (s) => void s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)));
