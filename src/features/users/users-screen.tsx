"use client"

import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Plus, UserX } from "lucide-react"

import { UserAvatar } from "@/components/common/avatars"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { FilterChips, SearchInput } from "@/components/common/filters"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState, QueryError } from "@/components/common/states"
import { StatusChip } from "@/components/common/status-chip"
import { Panel } from "@/components/common/surfaces"
import { RequirePermission } from "@/components/layout/require-permission"
import {
  Pagination,
  SortTh,
  Table,
  TableFooter,
  TableMessageRow,
  TableScroll,
  TableSkeletonRows,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ROLE_LABEL, ROLES } from "@/config/rbac"
import { useDebounced } from "@/hooks/use-debounced"
import { useUser } from "@/hooks/use-session"
import { fmtShortDateTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { ROLE_TONE, USER_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { listUsers, scopeLabel, setUserStatus, type UserQuery } from "@/services/users"
import type { IdentityProvider, Role, User } from "@/types/domain"

import { PermissionMatrix } from "./permission-matrix"
import { UserDrawer } from "./user-drawer"

type SortKey = "name" | "lastLogin" | "role"

export function UsersScreen() {
  return (
    <RequirePermission permission="admin" page="Users & roles">
      <UsersAndRoles />
    </RequirePermission>
  )
}

function UsersAndRoles() {
  const me = useUser()
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<Role | "all">("all")
  const [idp, setIdp] = useState<IdentityProvider | "all">("all")
  const [status, setStatus] = useState<"active" | "disabled">("active")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" })
  const [page, setPage] = useState(1)
  const [drawer, setDrawer] = useState<{ open: boolean; user: User | null }>({ open: false, user: null })
  const [confirm, setConfirm] = useState<User | null>(null)
  const debounced = useDebounced(search)

  const query: UserQuery = { search: debounced, role, idp, status, sort, page }
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["users", query],
    queryFn: () => listUsers(query),
    placeholderData: keepPreviousData,
  })

  const toggle = useServiceMutation((u: User) => setUserStatus(u.id, u.status === "disabled" ? "active" : "disabled"), {
    success: (_, u) => (u.status === "disabled" ? `${u.name} enabled` : `${u.name} disabled · access blocked immediately`),
    onSettled: () => setConfirm(null),
  })

  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v)
      setPage(1)
    }

  if (error && !data) return <QueryError error={error} onRetry={() => refetch()} title="Couldn’t load users" />

  const disabling = confirm && confirm.status !== "disabled"

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & roles"
        description="Users sign in through the Officer IdP or the Contractor IdP. Changes take effect immediately and are audited."
        actions={
          <Button size="lg" onClick={() => setDrawer({ open: true, user: null })}>
            <Plus /> Add user
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center">
          <SearchInput
            className="lg:max-w-sm lg:flex-1"
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Search name or email"
          />
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select value={role} onValueChange={resetPage((v: string) => setRole(v as Role | "all"))}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={idp} onValueChange={resetPage((v: string) => setIdp(v as IdentityProvider | "all"))}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filter by identity provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All identity providers</SelectItem>
                <SelectItem value="officer">Officer IdP</SelectItem>
                <SelectItem value="contractor">Contractor IdP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FilterChips
            ariaLabel="User status"
            value={status}
            onChange={resetPage(setStatus)}
            options={[
              { value: "active", label: "Active", count: data?.counts.active },
              { value: "disabled", label: "Disabled", count: data?.counts.disabled },
            ]}
          />
        </div>

        <TableScroll>
          <Table className="min-w-[960px]">
            <THead>
              <tr>
                <SortTh label="Name" sortKey="name" sort={sort} onSort={setSort} />
                <Th>Identity provider</Th>
                <SortTh label="Role" sortKey="role" sort={sort} onSort={setSort} />
                <Th>Kennel scope</Th>
                <SortTh label="Last login" sortKey="lastLogin" sort={sort} onSort={setSort} />
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {isPending ? (
                <TableSkeletonRows cols={7} rows={7} />
              ) : data && data.users.length === 0 ? (
                <TableMessageRow cols={7}>
                  <EmptyState
                    icon="search"
                    title={status === "disabled" ? "No disabled users" : "No users match"}
                    description="Try a different name, role or identity provider."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearch("")
                          setRole("all")
                          setIdp("all")
                          setPage(1)
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                </TableMessageRow>
              ) : (
                data?.users.map((u) => {
                  const disabled = u.status === "disabled"
                  const st = USER_STATUS[u.status]
                  return (
                    <Tr key={u.id} selected={u.id === me.id}>
                      <Td>
                        <div className={cn("flex items-center gap-3", disabled && "opacity-60")}>
                          <UserAvatar name={u.name} role={u.role} />
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {u.name}
                              {u.id === me.id ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className={cn(disabled && "text-muted-foreground")}>{u.idp === "officer" ? "Officer IdP" : "Contractor IdP"}</Td>
                      <Td>
                        <StatusChip tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</StatusChip>
                      </Td>
                      <Td className={cn(disabled && "text-muted-foreground")}>{scopeLabel(u)}</Td>
                      <Td className={cn("font-mono text-[13px]", disabled && "text-muted-foreground")}>
                        {u.lastLoginAt ? fmtShortDateTime(u.lastLoginAt) : "Never"}
                      </Td>
                      <Td>
                        <StatusChip tone={st.tone} dot={st.dot}>
                          {st.label}
                        </StatusChip>
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDrawer({ open: true, user: u })}
                            aria-label={`Edit ${u.name}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant={disabled ? "soft" : "outline"}
                            size="sm"
                            className="min-w-[76px]"
                            disabled={u.id === me.id}
                            title={u.id === me.id ? "You can’t disable your own account" : undefined}
                            onClick={() => setConfirm(u)}
                            aria-label={`${disabled ? "Enable" : "Disable"} ${u.name}`}
                          >
                            {disabled ? "Enable" : "Disable"}
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
        <TableFooter>
          <span>{data ? `Showing ${data.users.length} of ${data.totalAll} users` : "—"}</span>
          {data ? <Pagination page={data.page} pages={data.pages} onPage={setPage} /> : null}
        </TableFooter>
      </Panel>

      <PermissionMatrix />

      <UserDrawer open={drawer.open} user={drawer.user} onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={disabling ? `Disable ${confirm?.name}?` : `Enable ${confirm?.name}?`}
        description={
          disabling
            ? "Disabling blocks access immediately — open sessions and API calls are rejected. The change is audited and can be reversed."
            : "The user can sign in again through their identity provider. The change is audited."
        }
        confirmLabel={disabling ? "Disable user" : "Enable user"}
        destructive={Boolean(disabling)}
        icon={<UserX className="size-5" />}
        loading={toggle.isPending}
        onConfirm={() => confirm && toggle.mutate(confirm)}
      />
    </div>
  )
}
