"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Check } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { Breadcrumbs, PageHeader } from "@/components/common/page-header"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { KennelCode } from "@/components/common/status-chip"
import { Panel } from "@/components/common/surfaces"
import { RequirePermission } from "@/components/layout/require-permission"
import { Button } from "@/components/ui/button"
import { useUser } from "@/hooks/use-session"
import { cn } from "@/lib/utils"
import { getAnimal } from "@/services/animals"

import { ArrivalDetailsForm } from "./arrival-details-form"
import { ArrivalExamForm } from "./arrival-exam-form"

function Stepper({ step }: { step: 1 | 2 }) {
  const items = ["Arrival details", "Arrival exam"]
  return (
    <ol className="flex flex-wrap items-center gap-3" aria-label="Progress">
      {items.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={label} className="flex items-center gap-3">
            {i > 0 ? <span className="h-px w-8 bg-border" aria-hidden /> : null}
            <span aria-current={current ? "step" : undefined} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                  done ? "bg-success text-white" : current ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4" /> : n}
              </span>
              <span className={cn(current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                <span className="sr-only sm:not-sr-only">Step {n} of 2 · </span>
                {label}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** New Arrival (FE-007 step 1 + FE-008 step 2). `?animal=<id>` resumes at the exam for an arriving animal. */
export function NewArrival() {
  return (
    <RequirePermission permission="arrival" page="New arrival">
      <NewArrivalFlow />
    </RequirePermission>
  )
}

function NewArrivalFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const user = useUser()
  const animalId = params.get("animal")
  const q = useQuery({ queryKey: ["animal", animalId], queryFn: () => getAnimal(animalId as string), enabled: Boolean(animalId) })
  const step: 1 | 2 = animalId ? 2 : 1

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <Breadcrumbs items={[{ label: "Animals", href: "/animals" }, { label: "New arrival" }]} />
      <PageHeader
        title="New arrival"
        description={
          step === 1
            ? "Register the animal’s stay, then record the arrival baseline exam."
            : "Record the baseline exam. Completing it starts active monitoring."
        }
      />
      <Stepper step={step} />
      <Panel className="p-5 sm:p-6">
        {step === 1 ? (
          <ArrivalDetailsForm
            userId={user.id}
            onCreated={(a) => router.replace(`/animals/new?animal=${a.id}`)}
            onCancel={() => router.push("/animals")}
          />
        ) : q.isPending ? (
          <PanelSkeleton lines={6} className="p-0" />
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.row.animal.stayStatus !== "arriving" ? (
          <div className="space-y-3 py-6 text-center">
            <p className="font-semibold">The arrival exam for {q.data.row.animal.name} is already complete.</p>
            <Button asChild>
              <Link href={`/animals/${q.data.row.animal.id}`}>Open animal profile</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-subtle px-4 py-3">
              <AnimalAvatar name={q.data.row.animal.name} speciesId={q.data.row.animal.speciesId} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {q.data.row.animal.name} <KennelCode code={q.data.row.animal.kennelCode} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.data.row.speciesName} · {q.data.row.animal.breed || "Breed not recorded"} · {q.data.row.animal.origin}
                </p>
              </div>
            </div>
            <ArrivalExamForm animal={q.data.row.animal} onCompleted={() => router.push(`/animals/${q.data.row.animal.id}`)} />
          </div>
        )}
      </Panel>
    </div>
  )
}
