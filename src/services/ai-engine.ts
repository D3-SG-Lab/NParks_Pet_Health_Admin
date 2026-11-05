/**
 * Mock AI worker (AI-002 matching, AI-003 sign extraction, AI-004 routing).
 * Deterministic heuristics that stand in for the Azure OpenAI pipeline so the
 * confirmation and review-queue flows are fully exercisable.
 */
import { addDays, nowISO, todayISO } from "@/lib/clock"
import type { Db } from "@/lib/mock/db"
import type { AiCandidate, AiResult, Animal, ExtractedSign, RoutingAction } from "@/types/domain"

import { activeCases } from "./derive"

const words = (s: string) => s.toLowerCase()

function activeAnimals(db: Db): Animal[] {
  return db.animals.filter((a) => a.stayStatus !== "released")
}

/** Expands glossary shorthand (e.g. "corner run" → last kennel in that block). */
function cornerRunKennel(db: Db, text: string): string | null {
  const m = text.match(/\b(KC\d)\b[^.]*corner run|corner run[^.]*\b(KC\d)\b/i)
  const block = (m?.[1] ?? m?.[2])?.toUpperCase()
  if (!block) return null
  const kennels = db.kennels
    .filter((k) => k.blockCode === block)
    .map((k) => k.code)
    .sort()
  return kennels.at(-1) ?? null
}

export function matchAnimal(db: Db, text: string, reportedAnimalId: string | null): { candidates: AiCandidate[]; rationale: string } {
  const animals = activeAnimals(db)
  if (reportedAnimalId) {
    const a = animals.find((x) => x.id === reportedAnimalId)
    if (a)
      return {
        candidates: [{ animalId: a.id, confidence: 0.98 }],
        rationale: `Animal selected by the reporter (${a.kennelCode} · ${a.name}).`,
      }
  }
  const t = words(text)
  const codeMatch = text.toUpperCase().match(/\b(KC\d-\d+|ISO-\d+)\b/)
  const byCode = codeMatch ? animals.find((a) => a.kennelCode === codeMatch[1]) : undefined
  const byName = animals.filter((a) => new RegExp(`\\b${a.name.toLowerCase().replace(/\s+/g, "\\s+")}\\b`).test(t))

  if (byCode && byName.some((a) => a.id === byCode.id)) {
    return {
      candidates: [{ animalId: byCode.id, confidence: 0.97 }],
      rationale: `Kennel code ${byCode.kennelCode} and name “${byCode.name}” both match.`,
    }
  }
  if (byCode) {
    return {
      candidates: [{ animalId: byCode.id, confidence: 0.93 }],
      rationale: `Kennel code ${byCode.kennelCode} matches an active stay.`,
    }
  }
  if (byName.length === 1) {
    return { candidates: [{ animalId: byName[0].id, confidence: 0.9 }], rationale: `Name “${byName[0].name}” matches one active animal.` }
  }
  if (byName.length > 1) {
    return {
      candidates: byName.map((a, i) => ({ animalId: a.id, confidence: Math.max(0.3, 0.6 - i * 0.12) })),
      rationale: `Name matches ${byName.length} active animals.`,
    }
  }
  const corner = cornerRunKennel(db, text)
  const blockMatch = text.toUpperCase().match(/\b(KC\d|ISO)\b/)
  const species = /\bdog|puppy\b/.test(t) ? "dog" : /\bcat|kitten\b/.test(t) ? "cat" : null
  if (blockMatch || species) {
    const pool = animals.filter(
      (a) => (!blockMatch || a.kennelCode.startsWith(`${blockMatch[1]}-`)) && (!species || a.speciesId === species)
    )
    if (pool.length > 0) {
      const ranked = pool
        .map((a) => ({ a, score: (corner && a.kennelCode === corner ? 0.15 : 0) + (a.kennelCode < (corner ?? "") ? 0.05 : 0) }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 3)
      const base = [0.48, 0.31, 0.2]
      const descr = text.match(/“?([a-z ]*(dog|cat))”?/i)?.[1]?.trim() ?? "the description"
      return {
        candidates: ranked.map((r, i) => ({ animalId: r.a.id, confidence: base[i] })),
        rationale: `No kennel code or name found. Candidates${blockMatch ? ` in ${blockMatch[1]}` : ""} matching “${descr}”:`,
      }
    }
  }
  return { candidates: [], rationale: "No kennel code, name or description matched an active animal." }
}

export function extractSigns(db: Db, text: string): ExtractedSign[] {
  const t = words(text)
  const found: ExtractedSign[] = []
  for (const s of db.signs.filter((x) => x.active)) {
    const terms = [s.name.toLowerCase().replace(" · ", " "), ...s.synonyms.map((x) => x.toLowerCase())]
    if (terms.some((term) => term.length > 2 && t.includes(term))) {
      let label = s.name
      if (s.bodySystem === "otic" && /right ear/.test(t)) label = `${s.name} (right)`
      if (s.bodySystem === "otic" && /left ear/.test(t)) label = `${s.name} (left)`
      found.push({ code: s.code, label })
    }
  }
  // Prefer the ear-specific sign when both generic and otic variants matched.
  const otic = found.some((f) => f.code.startsWith("OT"))
  return found.filter((f) => !(otic && (f.code === "DE-001" || f.code === "DE-002"))).slice(0, 5)
}

/** AI-004: compare signs with the animal's open / recently closed cases. */
export function suggestRouting(
  db: Db,
  animalId: string | null,
  signs: ExtractedSign[]
): { action: RoutingAction; caseId: string | null; rationale: string } {
  if (!animalId) return { action: signs.length ? "new_case" : "timeline", caseId: null, rationale: "" }
  const systems = new Set(signs.map((s) => db.signs.find((x) => x.code === s.code)?.bodySystem))
  const open = activeCases(db, animalId)
  const related = open.find((c) => c.signCodes.some((code) => systems.has(db.signs.find((x) => x.code === code)?.bodySystem)))
  if (related) return { action: "update_case", caseId: related.id, rationale: `Same body system as open case ${related.id}.` }
  const today = todayISO()
  const closed = db.cases
    .filter((c) => c.animalId === animalId && c.status === "closed" && c.closedAt)
    .find((c) =>
      c.signCodes.some((code) => {
        const sign = db.signs.find((x) => x.code === code)
        return sign && systems.has(sign.bodySystem) && c.closedAt!.slice(0, 10) >= addDays(today, -sign.relatedWindowDays)
      })
    )
  if (closed)
    return {
      action: "reopen_case",
      caseId: closed.id,
      rationale: `Same or related signs within the related window of closed case ${closed.id}.`,
    }
  if (signs.length > 0) return { action: "new_case", caseId: null, rationale: "New clinical signs with no open or recent case." }
  return { action: "timeline", caseId: null, rationale: "No clinical signs extracted — record on the 30-day timeline only." }
}

export function analyzeObservation(db: Db, text: string, reportedAnimalId: string | null): AiResult {
  const match = matchAnimal(db, text, reportedAnimalId)
  const top = match.candidates[0]
  const threshold = db.settings.aiConfidenceThreshold
  const matched = top && top.confidence >= threshold ? top.animalId : null
  const signs = extractSigns(db, text)
  const routing = suggestRouting(db, matched ?? top?.animalId ?? null, signs)
  const reviewReason = !top || top.confidence < 0.5 ? "no_match" : top.confidence < threshold ? "low_confidence" : null
  return {
    promptVersion: db.settings.promptVersion,
    model: "gpt-4o (Azure OpenAI)",
    latencySec: 6 + (text.length % 9),
    candidates: match.candidates,
    matchedAnimalId: matched,
    confidence: top?.confidence ?? 0,
    signs,
    onset: todayISO(),
    suggestedAction: routing.action,
    suggestedCaseId: routing.caseId,
    rationale: [match.rationale, routing.rationale].filter(Boolean).join(" "),
    reviewReason: reviewReason === "no_match" && top ? "no_match" : reviewReason,
    createdAt: nowISO(),
  }
}

/** Case title from extracted signs ("Vomiting, reduced appetite"). */
export function caseTitleFromSigns(signs: ExtractedSign[], fallback: string): string {
  if (signs.length === 0) return fallback.length > 60 ? `${fallback.slice(0, 57)}…` : fallback
  const [first, ...rest] = signs.map((s) => s.label)
  return [first, ...rest.map((r) => r.toLowerCase())].slice(0, 3).join(", ")
}
