export function shouldPersistAutoDraft(serialized: string, lastSaved: string) {
  return Boolean(serialized) && serialized !== lastSaved;
}
