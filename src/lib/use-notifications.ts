"use client";

import { useSyncExternalStore } from "react";
import {
  getNotifs,
  getNotifsServer,
  readAllNotifs,
  readNotif,
  resetNotifs,
  subscribeNotifs,
} from "./notifications-store";
import { unreadCountOf } from "./notification-store";

export function useNotifications() {
  const notifs = useSyncExternalStore(
    subscribeNotifs,
    getNotifs,
    getNotifsServer,
  );

  return {
    notifs,
    unread: unreadCountOf(notifs),
    read: (id: string) => readNotif(id),
    readAll: readAllNotifs,
    reset: resetNotifs,
  };
}
