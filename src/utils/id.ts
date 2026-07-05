export function generateTaskId(title: string, created: string): string {
  const raw = `${title}-${created}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function generateListId(name: string): string {
  return name;
}
