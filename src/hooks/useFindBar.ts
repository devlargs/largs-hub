import { useCallback, useEffect, useState } from "react";

// The find bar: the service it is searching, or null when closed.
export function useFindBar(activeServiceId: string | null) {
  const [findServiceId, setFindServiceId] = useState<string | null>(null);

  // Ctrl+F (or the context menu) inside a service view — main has already
  // handed keyboard focus to this view, so the input can take it.
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubOpen = window.electronAPI.onOpenFindBar(setFindServiceId);
    const unsubClose = window.electronAPI.onCloseFindBar(() => setFindServiceId(null));
    return () => {
      unsubOpen();
      unsubClose();
    };
  }, []);

  // Reserve the find bar's strip in the service view's bounds while it is open,
  // and drop the page's match highlighting when it closes.
  const findOpen = findServiceId !== null;
  useEffect(() => {
    window.electronAPI?.setFindBarOpen(findOpen);
    return () => {
      window.electronAPI?.setFindBarOpen(false);
    };
  }, [findOpen]);

  // The bar searches one service; switching away (or hiding the view) closes it.
  useEffect(() => {
    if (findServiceId && findServiceId !== activeServiceId) {
      window.electronAPI?.stopFindInPage(findServiceId);
      setFindServiceId(null);
    }
  }, [findServiceId, activeServiceId]);

  const closeFind = useCallback((serviceId: string) => {
    window.electronAPI?.stopFindInPage(serviceId);
    setFindServiceId(null);
  }, []);

  return { findServiceId, openFind: setFindServiceId, closeFind };
}
