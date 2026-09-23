import { readFile } from "./store";

export interface OpenedFile {
  url: string;
  release: () => void;
}

/**
 * A URL the page can load a stored file from. Drawn SVG illustrations become data: URLs rather than blob: URLs,
 * because a blob: URL shares the app's origin and an SVG opened on its own could run script there.
 */
export async function openFileUrl(path: string): Promise<OpenedFile | null> {
  const blob = await readFile(path);
  if (!blob) return null;
  if (blob.type === "image/svg+xml") {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { url, release: () => {} };
  }
  const url = URL.createObjectURL(blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}
