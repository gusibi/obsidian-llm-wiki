export function createUnifiedDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.length === 0 ? [] : oldText.split("\n");
  const newLines = newText.length === 0 ? [] : newText.split("\n");
  const oldCount = oldLines.length;
  const newCount = newLines.length;

  const header = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldCount} +1,${newCount} @@`;
  const body: string[] = [];

  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined) {
      body.push(`+${newLine ?? ""}`);
      continue;
    }
    if (newLine === undefined) {
      body.push(`-${oldLine}`);
      continue;
    }
    if (oldLine === newLine) {
      body.push(` ${oldLine}`);
      continue;
    }
    body.push(`-${oldLine}`);
    body.push(`+${newLine}`);
  }

  return `${header}\n${body.join("\n")}`.trimEnd();
}
