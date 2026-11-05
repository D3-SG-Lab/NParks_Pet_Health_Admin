"use client"

import { useSyncExternalStore } from "react"

import { now } from "@/lib/clock"

/**
 * Demo-clock time, re-rendering on a shared 30 s tick. Returns null during
 * server rendering so time-dependent UI only renders on the client.
 */
let snapshot: Date | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    snapshot = now()
    timer = setInterval(() => {
      snapshot = now()
      listeners.forEach((l) => l())
    }, 30_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useNow(): Date | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot ?? (snapshot = now()),
    () => null
  )
}
