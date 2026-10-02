export function preserveRecipeDefinition(
  definition: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return structuredClone(definition ?? {});
}
