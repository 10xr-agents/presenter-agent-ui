import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { BillingAccount } from "../models/billing-account"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Billing Account Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a pay-as-you-go billing account", async () => {
    const accountData = {
      organizationId: generateId(),
      billingType: "pay_as_you_go" as const,
      status: "active" as const,
      balanceCents: 10000, // $100
      currencyCode: "USD",
      billingEmailAddresses: ["billing@example.com"],
      autoReloadEnabled: false,
      autoReloadThresholdCents: 1000, // $10
      autoReloadAmountCents: 10000, // $100
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (BillingAccount as any).create(accountData)

    expect(account).toBeDefined()
    expect(account.billingType).toBe("pay_as_you_go")
    expect(account.balanceCents).toBe(10000)
    expect(account.autoReloadEnabled).toBe(false)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (BillingAccount as any).deleteOne({ _id: account._id })
  })

  it("should create an enterprise contract billing account", async () => {
    const accountData = {
      organizationId: generateId(),
      billingType: "enterprise_contract" as const,
      status: "active" as const,
      currencyCode: "USD",
      billingEmailAddresses: ["enterprise@example.com"],
      enterpriseContract: {
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        committedUsageMinutes: 10000,
        ratePerMinuteCents: 50, // $0.50
        overageRatePerMinuteCents: 75, // $0.75
        paymentTerms: "Net 30",
        invoiceFrequency: "monthly" as const,
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (BillingAccount as any).create(accountData)

    expect(account.billingType).toBe("enterprise_contract")
    expect(account.enterpriseContract).toBeDefined()
    expect(account.enterpriseContract?.committedUsageMinutes).toBe(10000)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (BillingAccount as any).deleteOne({ _id: account._id })
  })

  it("should store payment methods", async () => {
    const accountData = {
      organizationId: generateId(),
      billingType: "pay_as_you_go" as const,
      status: "active" as const,
      currencyCode: "USD",
      billingEmailAddresses: ["billing@example.com"],
      primaryPaymentMethod: {
        type: "card" as const,
        lastFour: "4242",
        cardBrand: "visa" as const,
        billingName: "Test User",
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (BillingAccount as any).create(accountData)

    expect(account.primaryPaymentMethod?.type).toBe("card")
    expect(account.primaryPaymentMethod?.lastFour).toBe("4242")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (BillingAccount as any).deleteOne({ _id: account._id })
  })
})
