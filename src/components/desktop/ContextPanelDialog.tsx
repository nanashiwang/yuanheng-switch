import type { AppId } from "@/lib/api";
import type { YuanhengConnectionStatus } from "@/lib/api/yuanheng";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DesktopContextPanel } from "./DesktopContextPanel";
import type { DesktopView } from "./types";

interface ContextPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeApp: AppId;
  connection?: YuanhengConnectionStatus;
  onNavigate: (view: DesktopView) => void;
}

export function ContextPanelDialog({
  open,
  onOpenChange,
  activeApp,
  connection,
  onNavigate,
}: ContextPanelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        zIndex="top"
        className="bottom-0 left-auto right-0 top-0 h-screen max-h-none w-[320px] max-w-[88vw] translate-x-0 translate-y-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:rounded-none"
      >
        <DialogTitle className="sr-only">当前状态</DialogTitle>
        <DesktopContextPanel
          activeApp={activeApp}
          connection={connection}
          onNavigate={(view) => {
            onOpenChange(false);
            onNavigate(view);
          }}
          className="w-full border-l-0"
        />
      </DialogContent>
    </Dialog>
  );
}
