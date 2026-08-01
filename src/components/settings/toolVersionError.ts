const TOOL_NOT_INSTALLED_ERROR =
  /^(?:\[WSL:[^\]]+\]\s*)?not installed or not executable$/i;

export function localizeToolVersionError(
  error: string | null | undefined,
): string | null {
  const detail = error?.trim();
  if (!detail || TOOL_NOT_INSTALLED_ERROR.test(detail)) return null;
  return detail;
}
