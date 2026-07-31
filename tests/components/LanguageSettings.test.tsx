import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { LANGUAGE_OPTIONS } from "@/i18n/languages";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("LanguageSettings", () => {
  it("shows every supported language in an expandable selector", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguageSettings value="en" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));

    for (const language of LANGUAGE_OPTIONS) {
      expect(
        screen.getByRole("option", { name: language.nativeName }),
      ).toBeInTheDocument();
    }

    await user.click(screen.getByRole("option", { name: "Français" }));
    expect(onChange).toHaveBeenCalledWith("fr");
  });
});
