import { describe, expect, it } from "vitest"
import { generateId } from "../__tests__/setup"
import {
  addBalance,
  deductBalance,
  getBalance,
  getOrCreateBillingAccount,
  hasSufficientBalance,
  updateAutoReloadSettings,
} from "../billing/pay-as-you-go"

describe("Pay-as-You-Go Billing", () => {
  it("should create billing account for organization", async () => {
    const organizationId = generateId()

    const account = await getOrCreateBillingAccount(organizationId)

    expect(account.organizationId).toBe(organizationId)
    expect(account.billingType).toBe("pay_as_you_go")
    expect(account.status).toBe("active")
    expect(account.balanceCents).toBe(0)
  })

  it("should add balance to account", async () => {
    const organizationId = generateId()
    await getOrCreateBillingAccount(organizationId)

    const account = await addBalance(organizationId, 10000)

    expect(account.balanceCents).toBe(10000)
  })

  it("should deduct balance from account", async () => {
    const organizationId = generateId()
    await getOrCreateBillingAccount(organizationId)
    await addBalance(organizationId, 10000)

    const result = await deductBalance(organizationId, 5000)

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(5000)
    expect(result.account?.balanceCents).toBe(5000)
  })

  it("should not allow negative balance", async () => {
    const organizationId = generateId()
    await getOrCreateBillingAccount(organizationId)
    await addBalance(organizationId, 1000)

    const result = await deductBalance(organizationId, 2000)

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(0)
  })

  it("should check sufficient balance", async () => {
    const organizationId = generateId()
    await getOrCreateBillingAccount(organizationId)
    await addBalance(organizationId, 10000)

    const hasBalance = await hasSufficientBalance(organizationId, 5000)
    const hasNotBalance = await hasSufficientBalance(organizationId, 15000)

    expect(hasBalance).toBe(true)
    expect(hasNotBalance).toBe(false)
  })

  it("should update auto-reload settings", async () => {
    const organizationId = generateId()
    await getOrCreateBillingAccount(organizationId)

    const account = await updateAutoReloadSettings(organizationId, {
      enabled: true,
      thresholdCents: 5000,
      amountCents: 20000,
    })

    expect(account.autoReloadEnabled).toBe(true)
    expect(account.autoReloadThresholdCents).toBe(5000)
    expect(account.autoReloadAmountCents).toBe(20000)
  })
})
