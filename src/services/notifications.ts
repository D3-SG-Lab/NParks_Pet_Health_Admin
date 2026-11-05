/** In-app notifications for the signed-in user (mirror of push/email, BE-022). */
import type { AppNotification } from "@/types/domain"

import { clone, currentUser, delay, getDb, write } from "./core"

export async function listMyNotifications(): Promise<{ items: AppNotification[]; unread: number }> {
  await delay(120)
  const db = getDb()
  const user = currentUser(db)
  const items = db.notifications
    .filter((n) => n.userId === user.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)
  return { items: clone(items), unread: items.filter((n) => !n.read).length }
}

export async function markNotificationRead(id: string): Promise<void> {
  await delay(60)
  write((db) => {
    const n = db.notifications.find((x) => x.id === id)
    if (n) n.read = true
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  await delay(100)
  const db = getDb()
  const user = currentUser(db)
  write((d) => {
    for (const n of d.notifications) if (n.userId === user.id) n.read = true
  })
}
