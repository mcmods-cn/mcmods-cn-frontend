export type ModContentCapabilities = {
  manageLayout: boolean;
  createResource: boolean;
  editResource: boolean;
};

export const NO_MOD_CONTENT_CAPABILITIES: Readonly<ModContentCapabilities> = Object.freeze({
  manageLayout: false,
  createResource: false,
  editResource: false,
});

export function parseModContentCapabilities(value: unknown): ModContentCapabilities {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    manageLayout: source.manageLayout === true,
    createResource: source.createResource === true,
    editResource: source.editResource === true,
  };
}
