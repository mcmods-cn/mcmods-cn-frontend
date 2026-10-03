/** Quote a text cell and prevent spreadsheet formula interpretation. */
export function csvCell(value: string): string {
  const unsafe = /^[\u0000-\u001F\u007F]/u.test(value) || /^[\s\uFEFF]*[=+\-@]/u.test(value);
  const text = unsafe ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}
