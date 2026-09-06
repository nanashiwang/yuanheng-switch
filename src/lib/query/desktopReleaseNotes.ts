import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  loadReleaseNotes,
  saveReleaseNotes,
  selectReleaseNotes,
} from "@/lib/desktopReleaseNotes";

export function useDesktopReleaseNotes(enabled = true) {
  return useQuery({
    queryKey: ["desktop-release-notes"],
    enabled,
    initialData: loadReleaseNotes,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const remote = await invoke<unknown>("get_desktop_release_notes");
      const notes = selectReleaseNotes(remote, loadReleaseNotes());
      saveReleaseNotes(notes);
      return notes;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
