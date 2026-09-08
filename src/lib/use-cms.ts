"use client";

import { useSyncExternalStore } from "react";
import {
  getCms,
  getCmsServer,
  resetCms,
  saveCms,
  subscribeCms,
  type HomeSettings,
} from "./home-cms";

export function useCms() {
  const settings = useSyncExternalStore(subscribeCms, getCms, getCmsServer);

  return {
    settings,
    save: (s: HomeSettings) => saveCms(s),
    reset: resetCms,
  };
}
