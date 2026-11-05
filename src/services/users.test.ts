import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { signIn } from "./auth"
import { createUser, listUsers, scopeLabel, setUserStatus, updateUser } from "./users"

const base = {
  idp: "contractor" as const,
  email: "j.ng@petcare-contractor.sg",
  name: "J. Ng",
  role: "contractor" as const,
  kennelScope: ["KC1", "KC2"],
  sendInvitation: true,
}

describe("users service (BE-007)", () => {
  it("only admins can manage users", async () => {
    signInAs("u-koh-m")
    await expect(listUsers({})).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("lists active and disabled users with counts", async () => {
    signInAs("u-wong-s")
    const r = await listUsers({})
    expect(r.counts).toEqual({ active: 14, disabled: 2 })
    expect(r.users).toHaveLength(7)
    expect(r.totalAll).toBe(16)
  })

  it("creates an invited contractor and audits it", async () => {
    signInAs("u-wong-s")
    const u = await createUser(base)
    expect(u.status).toBe("invited")
    expect(scopeLabel(u)).toBe("KC1, KC2")
    expect(getDb().audit.at(-1)).toMatchObject({ action: "User created" })
  })

  it("enforces email domain / IdP rules", async () => {
    signInAs("u-wong-s")
    await expect(createUser({ ...base, email: "j.ng@nparks.gov.sg" })).rejects.toMatchObject({ field: "email" })
    await expect(createUser({ ...base, idp: "officer", role: "officer", email: "j.ng@gmail.com", kennelScope: [] })).rejects.toMatchObject({
      field: "email",
    })
    await expect(createUser({ ...base, email: "k.lee@petcare-contractor.sg" })).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(createUser({ ...base, role: "officer" })).rejects.toMatchObject({ field: "role" })
  })

  it("requires kennel scope for contractors", async () => {
    signInAs("u-wong-s")
    await expect(createUser({ ...base, kennelScope: [] })).rejects.toMatchObject({ field: "kennelScope" })
  })

  it("blocks self-disable and self-demotion", async () => {
    signInAs("u-wong-s")
    await expect(setUserStatus("u-wong-s", "disabled")).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      updateUser("u-wong-s", { idp: "officer", email: "wong_shu@nparks.gov.sg", name: "S. Wong", role: "officer", kennelScope: [] })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("disabled users cannot sign in", async () => {
    signInAs("u-wong-s")
    await setUserStatus("u-lee-k", "disabled")
    expect(getDb().audit.at(-1)).toMatchObject({ action: "User disabled" })
    await expect(signIn("u-lee-k")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(signIn("u-pillai-a")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })
})
