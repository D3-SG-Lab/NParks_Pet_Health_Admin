"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Send, X } from "lucide-react"
import { z } from "zod"

import { Segmented } from "@/components/common/filters"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { ROLE_LABEL } from "@/config/rbac"
import { errorMessage, isApiError } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { getReferenceData } from "@/services/reference"
import { createUser, resendInvitation, updateUser } from "@/services/users"
import type { IdentityProvider, Role, User } from "@/types/domain"

const OFFICER_ROLES: Role[] = ["officer", "vet", "supervisor", "auditor", "admin"]

const schema = z
  .object({
    idp: z.enum(["officer", "contractor"]),
    email: z.string().trim().min(1, "Enter the work email.").email("Enter a valid work email."),
    name: z.string().trim().min(1, "Enter a display name.").max(60, "Keep the display name under 60 characters."),
    role: z.enum(["contractor", "officer", "vet", "supervisor", "auditor", "admin"]),
    kennelScope: z.array(z.string()),
    sendInvitation: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const email = v.email.toLowerCase()
    if (v.idp === "officer" && !email.endsWith("@nparks.gov.sg"))
      ctx.addIssue({ code: "custom", path: ["email"], message: "Officer IdP accounts must use an @nparks.gov.sg email." })
    if (v.idp === "contractor" && email.endsWith("@nparks.gov.sg"))
      ctx.addIssue({ code: "custom", path: ["email"], message: "Must match the account in the contractor's identity provider." })
    if (v.role === "contractor" && v.kennelScope.length === 0)
      ctx.addIssue({ code: "custom", path: ["kennelScope"], message: "Add at least one kennel block." })
  })

type FormValues = z.infer<typeof schema>

const FIELDS = ["idp", "email", "name", "role", "kennelScope"] as const

interface UserDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null = add user. */
  user: User | null
}

export function UserDrawer({ open, onOpenChange, user }: UserDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
        {/* Keyed so the form resets each time a different user (or Add) is opened. */}
        {open ? <UserForm key={user?.id ?? "new"} user={user} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const editing = Boolean(user)
  const [formError, setFormError] = useState<string | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const { data: ref } = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      idp: user?.idp ?? "contractor",
      email: user?.email ?? "",
      name: user?.name ?? "",
      role: user?.role ?? "contractor",
      kennelScope: user?.kennelScope ?? [],
      sendInvitation: true,
    },
  })
  const { register, control, handleSubmit, setValue, setError, formState } = form
  const idp = useWatch({ control, name: "idp" })
  const role = useWatch({ control, name: "role" })
  const scope = useWatch({ control, name: "kennelScope" })

  const onApiError = (e: Error) => {
    if (isApiError(e) && e.field && (FIELDS as readonly string[]).includes(e.field)) {
      setError(e.field as (typeof FIELDS)[number], { message: e.message })
    } else {
      setFormError(errorMessage(e))
    }
  }

  const create = useServiceMutation(createUser, {
    success: (u) => (u.status === "invited" ? `Invitation sent to ${u.email}` : `${u.name} added`),
    silentError: true,
    onError: onApiError,
    onSuccess: onDone,
  })
  const update = useServiceMutation((v: FormValues) => updateUser(user!.id, v), {
    success: (u) => `${u.name} updated`,
    silentError: true,
    onError: onApiError,
    onSuccess: onDone,
  })
  const resend = useServiceMutation(() => resendInvitation(user!.id), { success: "Invitation email resent" })

  const submit = handleSubmit((v) => {
    setFormError(null)
    const payload = { ...v, kennelScope: v.role === "contractor" ? v.kennelScope : [] }
    if (editing) update.mutate(payload)
    else create.mutate(payload)
  })

  const changeIdp = (next: IdentityProvider) => {
    setValue("idp", next, { shouldDirty: true })
    setValue("role", next === "contractor" ? "contractor" : role === "contractor" ? "officer" : role, { shouldDirty: true })
    if (formState.errors.email) void form.trigger("email")
  }

  const roles: Role[] = idp === "contractor" ? ["contractor"] : OFFICER_ROLES
  const blocks = ref?.blocks ?? []
  const available = blocks.filter((b) => !scope.includes(b.code))
  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={submit} className="flex h-full flex-col" noValidate>
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="text-lg">{editing ? `Edit ${user?.name}` : "Add user"}</SheetTitle>
        <SheetDescription>
          {editing ? "Changes take effect immediately and are audited." : "Users sign in through the Officer IdP or the Contractor IdP."}
        </SheetDescription>
      </SheetHeader>

      <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Field label="Identity provider" required>
          <Segmented
            ariaLabel="Identity provider"
            className="w-full"
            value={idp}
            onChange={changeIdp}
            options={[
              { value: "officer", label: "Officer IdP" },
              { value: "contractor", label: "Contractor IdP" },
            ]}
          />
        </Field>

        <Field
          label="Work email"
          htmlFor="user-email"
          required
          error={formState.errors.email?.message}
          hint={
            idp === "contractor"
              ? "Must match the account in the contractor’s identity provider"
              : "Must be the officer’s @nparks.gov.sg account"
          }
        >
          <Input
            id="user-email"
            type="email"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.email) || undefined}
            placeholder={idp === "contractor" ? "name@petcare-contractor.sg" : "name@nparks.gov.sg"}
            {...register("email")}
          />
        </Field>

        <Field label="Display name" htmlFor="user-name" required error={formState.errors.name?.message}>
          <Input id="user-name" placeholder="e.g. J. Ng" aria-invalid={Boolean(formState.errors.name) || undefined} {...register("name")} />
        </Field>

        <Field label="Role" htmlFor="user-role" required error={formState.errors.role?.message}>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(v) => field.onChange(v as Role)} disabled={idp === "contractor"}>
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        {role === "contractor" ? (
          <Field
            label="Kennel scope"
            required
            error={formState.errors.kennelScope?.message}
            hint="Contractors only see animals in these kennels"
          >
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kennel scope">
              {scope.map((code) => (
                <span
                  key={code}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary-soft pr-1 pl-2.5 font-mono text-[13px] font-semibold text-primary"
                >
                  {code}
                  <button
                    type="button"
                    onClick={() =>
                      setValue(
                        "kennelScope",
                        scope.filter((c) => c !== code),
                        { shouldValidate: formState.isSubmitted }
                      )
                    }
                    className="inline-flex size-6 items-center justify-center rounded-md hover:bg-primary/10"
                    aria-label={`Remove ${code}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={available.length === 0}>
                    <Plus /> Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1.5">
                  {available.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => {
                        setValue("kennelScope", [...scope, b.code].sort(), { shouldValidate: formState.isSubmitted })
                        setScopeOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-mono text-xs font-semibold">{b.code}</span>
                      <span className="text-muted-foreground">{b.name}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </Field>
        ) : null}

        {!editing ? (
          <Controller
            control={control}
            name="sendInvitation"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
                <span>
                  <span className="block text-[15px] font-semibold">Send invitation email</span>
                  <span className="block text-xs text-muted-foreground">Account activates on first sign-in</span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Send invitation email" />
              </label>
            )}
          />
        ) : user?.status === "invited" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            <span>Invitation pending — the account activates on first sign-in.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => resend.mutate()} loading={resend.isPending}>
              {!resend.isPending ? <Send /> : null} Resend
            </Button>
          </div>
        ) : null}

        <FormError message={formError} />
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-4">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? "Save changes" : "Add user"}
        </Button>
      </SheetFooter>
    </form>
  )
}
