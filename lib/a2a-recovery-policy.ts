const RETIRED_BINDING_ERROR = "Codex binding generation was retired";

export function isRetiredBindingError(error: string | null | undefined) {
  return Boolean(error?.includes(RETIRED_BINDING_ERROR));
}
