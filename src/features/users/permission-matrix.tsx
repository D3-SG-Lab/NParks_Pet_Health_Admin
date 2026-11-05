import { Check } from "lucide-react"

import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Table, TableScroll, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { PERMISSION_MATRIX, ROLE_LABEL, ROLES } from "@/config/rbac"

/** Read-only role permission matrix (Users & roles p.9). */
export function PermissionMatrix() {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Role permissions"
        actions={
          <span className="text-xs text-muted-foreground">Enforced by the API on every endpoint (BE-005) · read-only reference</span>
        }
      />
      <TableScroll>
        <Table className="min-w-[760px]">
          <THead>
            <tr>
              <Th>Permission</Th>
              {ROLES.map((r) => (
                <Th key={r} align="center">
                  {ROLE_LABEL[r]}
                </Th>
              ))}
            </tr>
          </THead>
          <tbody>
            {PERMISSION_MATRIX.map((row) => (
              <Tr key={row.permission}>
                <Td className="h-12 font-medium">{row.label}</Td>
                {ROLES.map((r) => {
                  const v = row.roles[r]
                  return (
                    <Td key={r} align="center" className="h-12">
                      {v ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Check className="size-4" aria-label="Allowed" />
                          {v === "own" ? <span className="text-sm">own kennels</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60" aria-label="Not allowed">
                          —
                        </span>
                      )}
                    </Td>
                  )
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </Panel>
  )
}
