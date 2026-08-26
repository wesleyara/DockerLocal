/** Deriva um nome de projeto compose válido a partir do nome de um diretório. */
export function sanitizeProjectName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '');
  return cleaned || 'stack';
}
