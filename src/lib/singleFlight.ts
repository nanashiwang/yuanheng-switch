/** Shares only pending work. Settled successes and failures are never cached. */
export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, load: () => Promise<T>): Promise<T> {
    const active = pending.get(key);
    if (active) return active as Promise<T>;
    const task = Promise.resolve().then(load);
    pending.set(key, task);
    const cleanup = () => {
      if (pending.get(key) === task) pending.delete(key);
    };
    void task.then(cleanup, cleanup);
    return task;
  };
}
