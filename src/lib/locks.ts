/*
 * Background work runs in the tab that started it. Web Locks let other tabs see that the work is still
 * alive (so they don't mark it as interrupted) and stop two tabs from running the same job.
 */

const PREFIX = "studybolt:";

const locks = () => (typeof navigator !== "undefined" ? navigator.locks : undefined);

/** Runs `fn` while holding the named lock. Returns false without running it if another tab holds the lock. */
export async function withTabLock(name: string, fn: () => Promise<void>): Promise<boolean> {
  const manager = locks();
  // Web Locks need a secure context (HTTPS or localhost); elsewhere the job simply runs unguarded.
  if (!manager) {
    await fn();
    return true;
  }
  return manager.request(`${PREFIX}${name}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return false;
    await fn();
    return true;
  });
}

/** Names of the locks currently held by any StudyBolt tab, without the prefix. */
export async function heldLockNames(): Promise<Set<string>> {
  try {
    const { held = [] } = (await locks()?.query()) ?? {};
    return new Set(held.flatMap((lock) => (lock.name?.startsWith(PREFIX) ? [lock.name.slice(PREFIX.length)] : [])));
  } catch {
    return new Set();
  }
}
