import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useOptionalTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const themeContext = useOptionalTheme();
  const theme = themeContext?.theme ?? "light";
  const { t } = useTranslation();

  const toggleTheme = () => {
    if (theme === "dark") {
      themeContext?.setTheme("light");
    } else {
      themeContext?.setTheme("dark");
    }
  };

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme}>
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{t("common.toggleTheme")}</span>
    </Button>
  );
}
