import { useEffect, useState } from "react";

export const MODEL_FAVORITES_KEY = "yuanheng:model-favorites:v1";
const CHANGE_EVENT = "yuanheng:model-favorites-changed";
const MODEL_KINDS = ["models", "vendors"] as const;

function readFavorites<K extends string>(
  key: string,
  kinds: readonly K[],
): Record<K, string[]> {
  const empty = () =>
    Object.fromEntries(kinds.map((kind) => [kind, [] as string[]])) as Record<
      K,
      string[]
    >;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return empty();
    const data = parsed as Record<string, unknown>;
    const strings = (value: unknown): string[] =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              ),
            ),
          ]
        : [];
    return Object.fromEntries(
      kinds.map((kind) => [kind, strings(data[kind])]),
    ) as Record<K, string[]>;
  } catch {
    return empty();
  }
}

/** Device-local display preferences only; never a source of model permissions. */
export function useLocalPickerFavorites<K extends string>(
  key: string,
  kinds: readonly K[],
) {
  const read = () => readFavorites(key, kinds);
  const [favorites, setFavorites] = useState(read);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    const refresh = () => setFavorites(readFavorites(key, kinds));
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) refresh();
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, kinds]);

  const toggle = (kind: K, id: string) => {
    const next = read();
    next[kind] = next[kind].includes(id)
      ? next[kind].filter((item) => item !== id)
      : [...next[kind], id];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaveFailed(false);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      setSaveFailed(true);
    }
  };
  return { favorites, toggle, saveFailed };
}

export function useModelFavorites() {
  return useLocalPickerFavorites(MODEL_FAVORITES_KEY, MODEL_KINDS);
}
