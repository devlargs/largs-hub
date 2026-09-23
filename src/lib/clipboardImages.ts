// Which pasted images to upload from a Ctrl+V / Cmd+V into the Report an issue
// description. Pure over a minimal slice of DataTransfer, so it can be
// unit-tested without a DOM.
//
// Images can arrive two ways, and different sources use different ones:
// a screenshot tool, "Copy image" in a browser, or a macOS screenshot copied
// to the clipboard puts the image in `items` (kind "file"); a file copied in
// File Explorer or Finder lists it in `files`. Both are read, without doubles.

interface ClipboardItemLike {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

export interface ClipboardLike {
  items?: ArrayLike<ClipboardItemLike> | null;
  files?: ArrayLike<File> | null;
  getData(format: string): string;
}

const isImage = (file: { type: string }) => file.type.startsWith("image/");

/**
 * The images to upload, or an empty list to let the paste happen as usual.
 * A copy that also carries text (a spreadsheet range, a web page selection)
 * pastes as text: the picture it comes with is a rendering of that text.
 */
export function imagesToUpload(data: ClipboardLike): File[] {
  if (data.getData("text/plain").trim()) return [];
  const images: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !isImage(item)) continue;
    const file = item.getAsFile();
    if (file) images.push(file);
  }
  if (images.length > 0) return images;
  return Array.from(data.files ?? []).filter(isImage);
}
