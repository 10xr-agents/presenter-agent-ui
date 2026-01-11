import { connectDB } from "@/lib/db/mongoose"
import { BillingAccount, type IBillingAccount } from "@/lib/models/billing-account"
import { UsageEvent } from "@/lib/models/usage-event"

// Minimum initial balance: $100 (10000 cents)
export const MINIMUM_INITIAL_BALANCE_CENTS = 10000

// Default auto-reload threshold: $10 (1000 cents)
export const DEFAULT_AUTO_RELOAD_THRESHOLD_CENTS = 1000

// Default auto-reload amount: $100 (10000 cents)
export const DEFAULT_AUTO_RELOAD_AMOUNT_CENTS = 10000

// Get or create billing account for organization
export async function getOrCreateBillingAccount(
  organizationId: string
): Promise<IBillingAccount> {
  await connectDB()

  let account = await (BillingAccount as any).findOne({ organizationId })

  if (!account) {
    account = await (BillingAccount as any).create({
      organizationId,
      billingType: "pay_as_you_go",
      status: "active",
      balanceCents: 0,
      autoReloadEnabled: false,
      autoReloadThresholdCents: DEFAULT_AUTO_RELOAD_THRESHOLD_CENTS,
      autoReloadAmountCents: DEFAULT_AUTO_RELOAD_AMOUNT_CENTS,
      minimumBalanceCents: 0,
      currencyCode: "USD",
      billingEmailAddresses: [],
      backupPaymentMethods: [],
    })
  }

  return account
}

// Add balance to billing account
export async function addBalance(
  organizationId: string,
  amountCents: number
): Promise<IBillingAccount> {
  await connectDB()

  const account = await getOrCreateBillingAccount(organizationId)

  account.balanceCents = (account.balanceCents || 0) + amountCents

  await (account as any).save()

  return account
}

// Deduct balance from billing account (used when usage events are processed)
export async function deductBalance(
  organizationId: string,
  amountCents: number
): Promise<{ success: boolean; newBalance: number; account: IBillingAccount | null }> {
  await connectDB()

  const account = await (BillingAccount as any).findOne({ organizationId })

  if (!account) {
    return { success: false, newBalance: 0, account: null }
  }

  const currentBalance = account.balanceCents || 0
  const newBalance = Math.max(0, currentBalance - amountCents)

  account.balanceCents = newBalance

  await (account as any).save()

  return { success: true, newBalance, account }
}

// Get current balance
export async function getBalance(organizationId: string): Promise<number> {
  await connectDB()

  const account = await (BillingAccount as any).findOne({ organizationId })

  if (!account) {
    return 0
  }

  return account.balanceCents || 0
}

// Check if balance is sufficient
export async function hasSufficientBalance(
  organizationId: string,
  requiredCents: number
): Promise<boolean> {
  const balance = await getBalance(organizationId)
  return balance >= requiredCents
}

// Get billing account details
export async function getBillingAccount(
  organizationId: string
): Promise<IBillingAccount | null> {
  await connectDB()

  return await (BillingAccount as any).findOne({ organizationId })
}

// Update auto-reload settings
export async function updateAutoReloadSettings(
  organizationId: string,
  settings: {
    enabled?: boolean
    thresholdCents?: number
    amountCents?: number
  }
): Promise<IBillingAccount> {
  await connectDB()

  const account = await getOrCreateBillingAccount(organizationId)

  if (settings.enabled !== undefined) {
    account.autoReloadEnabled = settings.enabled
  }
  if (settings.thresholdCents !== undefined) {
    account.autoReloadThresholdCents = settings.thresholdCents
  }
  if (settings.amountCents !== undefined) {
    account.autoReloadAmountCents = settings.amountCents
  }

  await (account as any).save()

  return account
}

// Get total unbilled usage cost
export async function getUnbilledUsageCost(organizationId: string): Promise<number> {
  await connectDB()

  const account = await getBillingAccount(organizationId)
  if (!account) {
    return 0
  }

  const unbilledEvents = await (UsageEvent as any).aggregate([
    {
      $match: {
        organizationId,
        billingAccountId: account._id.toString(),
        billingStatus: "unbilled",
      },
    },
    {
      $group: {
        _id: null,
        totalCost: { $sum: "$totalCostCents" },
      },
    },
  ])

  if (unbilledEvents.length === 0) {
    return 0
  }

  return unbilledEvents[0].totalCost || 0
}

// Process usage event billing (deduct from balance)
export async function processUsageBilling(
  organizationId: string,
  usageEventId: string
): Promise<{ success: boolean; newBalance: number }> {
  await connectDB()

  const usageEvent = await (UsageEvent as any).findById(usageEventId)

  if (!usageEvent || usageEvent.billingStatus !== "unbilled") {
    return { success: false, newBalance: 0 }
  }

  const account = await (BillingAccount as any).findOne({ organizationId })
  if (!account) {
    return { success: false, newBalance: 0 }
  }

  const costCents = usageEvent.totalCostCents || 0
  const currentBalance = account.balanceCents || 0

  if (currentBalance < costCents) {
    // Insufficient balance - mark as failed (will be retried later)
    return { success: false, newBalance: currentBalance }
  }

  // Deduct from balance
  const newBalance = currentBalance - costCents
  account.balanceCents = newBalance
  await (account as any).save()

  // Mark usage event as billed
  usageEvent.billingStatus = "billed"
  await (usageEvent as any).save()

  return { success: true, newBalance }
}
