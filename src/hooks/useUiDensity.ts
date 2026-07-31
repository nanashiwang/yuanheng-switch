import { useCallback, useEffect, useState } from "react";

export type UiDensity = "comfortable" | "compact";

const STORAGE_KEY = "yuanheng-ui-density";
const EVENT_NAME = "yuanheng-ui-density-change";

function readDensity(): UiDensity {
  if (typeof window === "undefined") return "comfortable";
  return localStorage.getItem(STORAGE_KEY) === "compact"
    ? "compact"
    : "comfortable";
}

function applyDensity(density: UiDensity) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.uiDensity = density;
  }
}

export function useUiDensity() {
  const [density, setDensityState] = useState<UiDensity>(readDensity);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  useEffect(() => {
    const sync = () => setDensityState(readDensity());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setDensity = useCallback((next: UiDensity) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyDensity(next);
    setDensityState(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { density, setDensity };
}
