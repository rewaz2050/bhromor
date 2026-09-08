"use client";

import { useSyncExternalStore } from "react";
import {
  getSettings,
  getSettingsServer,
  resetSettings,
  saveSettings,
  subscribeSettings,
} from "./settings-store";

export function useSettings() {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getSettingsServer,
  );

  return { settings, save: saveSettings, reset: resetSettings };
}
