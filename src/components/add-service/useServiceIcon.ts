import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Service } from "../../types";
import { builtInIconForName, uploadToDiscard } from "../../lib/iconEdit";
import { resolveIcon } from "../../assets/serviceIcons";

// The icon being edited in the Add / Edit service modal: the stored icon
// reference, its preview, the crop step, and the files uploaded along the way.
export function useServiceIcon(editingService: Service | null) {
  const [icon, setIcon] = useState(editingService?.icon || "");
  const [preview, setPreview] = useState<string | null>(() => {
    if (!editingService) return null;
    // Resolve even an empty icon: the sidebar shows the built-in icon for the
    // name then, and the preview should match it.
    return resolveIcon(editingService.icon ?? "", editingService.name) || null;
  });
  // A picked file waiting to be cropped, as a data URL. Nothing is written to
  // disk until the crop is accepted (issue #101).
  const [cropSource, setCropSource] = useState<string | null>(null);
  // Icons uploaded while this modal has been open. Each one is a file on disk
  // the moment it's picked, but only the last is kept — the rest (and all of
  // them, if the modal is cancelled) would otherwise be orphaned (issue #70).
  const sessionUploads = useRef<string[]>([]);
  // Set once the service is submitted, so its icon is kept.
  const submitted = useRef(false);

  // Closing without saving leaves whatever was uploaded unreferenced, so remove
  // it. Runs on unmount, which covers Cancel, the backdrop and Escape alike.
  useEffect(() => {
    return () => {
      if (submitted.current) return;
      for (const fileName of sessionUploads.current) {
        void window.electronAPI?.deleteCustomIcon(fileName);
      }
    };
  }, []);

  // Picking a file only opens the cropper; a cancelled crop leaves the previous
  // icon (and the disk) untouched.
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result as string);
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  // The cropper hands back a PNG square, whatever went in.
  const applyCrop = async (dataUrl: string) => {
    setCropSource(null);
    setPreview(dataUrl);
    const fileName = `${uuidv4()}.png`;
    await window.electronAPI.saveCustomIcon(fileName, dataUrl);
    // Anything uploaded earlier in this session is now unreachable — the
    // service's own saved icon is left alone, main handles that on save.
    for (const stale of sessionUploads.current) {
      void window.electronAPI.deleteCustomIcon(stale);
    }
    sessionUploads.current = [fileName];
    setIcon(`custom:${fileName}`);
  };

  const cancelCrop = () => setCropSource(null);

  // Removing only deletes a file uploaded in this session. The service's saved
  // icon stays on disk until the edit is saved (main deletes it then), so
  // Cancel still brings it back.
  const remove = async (name: string) => {
    const discard = uploadToDiscard(icon, sessionUploads.current);
    if (discard) {
      await window.electronAPI.deleteCustomIcon(discard);
      sessionUploads.current = sessionUploads.current.filter((f) => f !== discard);
    }
    // Back to the built-in icon for the name (a "Messenger" gets messenger.png),
    // or no icon, which shows the initial.
    const fallback = builtInIconForName(name);
    setIcon(fallback);
    setPreview(resolveIcon(fallback, name) || null);
  };

  // Keeps the icon just uploaded from being cleaned up on unmount
  const markSubmitted = () => {
    submitted.current = true;
  };

  return { icon, preview, cropSource, markSubmitted, pickFile, applyCrop, cancelCrop, remove };
}

export type ServiceIconState = ReturnType<typeof useServiceIcon>;
