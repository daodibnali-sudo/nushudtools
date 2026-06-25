export function parseTextLines(text: string, keepEmptyLines: boolean): string[] {
  return text
    .split(/\r?\n|\r/g)
    .map((line) => line.trim())
    .filter((line) => keepEmptyLines || line.length > 0);
}

export async function parseTextFile(file: File, keepEmptyLines: boolean): Promise<string[]> {
  const text = await file.text();
  return parseTextLines(text, keepEmptyLines);
}
