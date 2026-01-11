import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"
import { connectDB } from "@/lib/db/mongoose"
import { BillingAccount, type IEnterpriseContract } from "@/lib/models/billing-account"

/**
 * Middleware to check admin access
 */
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userRole = "platform_admin" // TODO: Get from session or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}

/**
 * GET /api/admin/contracts - List all enterprise contracts
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) {
    return authError
  }

  try {
    await connectDB()

    // Get all billing accounts with enterprise contracts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = await (BillingAccount as any).find({
      billingType: "enterprise_contract",
      enterpriseContract: { $exists: true },
    }).sort({ createdAt: -1 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contracts = accounts.map((account: any) => ({
      id: account._id.toString(),
      organizationId: account.organizationId,
      contractStartDate: account.enterpriseContract?.contractStartDate,
      contractEndDate: account.enterpriseContract?.contractEndDate,
      committedUsageMinutes: account.enterpriseContract?.committedUsageMinutes,
      ratePerMinuteCents: account.enterpriseContract?.ratePerMinuteCents,
      overageRatePerMinuteCents: account.enterpriseContract?.overageRatePerMinuteCents,
      paymentTerms: account.enterpriseContract?.paymentTerms,
      invoiceFrequency: account.enterpriseContract?.invoiceFrequency,
      billingEmailAddresses: account.billingEmailAddresses,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }))

    return NextResponse.json({
      contracts,
      total: contracts.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching contracts:", error)
    return NextResponse.json(
      { error: message || "Failed to fetch contracts" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/contracts - Create or update enterprise contract
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) {
    return authError
  }

  const body = (await req.json()) as {
    organizationId: string
    contractStartDate: Date
    contractEndDate: Date
    committedUsageMinutes: number
    ratePerMinuteCents: number
    overageRatePerMinuteCents: number
    paymentTerms: string
    invoiceFrequency: "monthly" | "quarterly" | "annual"
    customBillingContact?: { name: string; email: string }
    billingEmailAddresses?: string[]
  }

  try {
    await connectDB()

    // Get or create billing account
    const { getOrCreateBillingAccount } = await import("@/lib/billing/pay-as-you-go")
    const account = await getOrCreateBillingAccount(body.organizationId)

    // Update to enterprise billing with contract
    const enterpriseContract: IEnterpriseContract = {
      contractStartDate: new Date(body.contractStartDate),
      contractEndDate: new Date(body.contractEndDate),
      committedUsageMinutes: body.committedUsageMinutes,
      ratePerMinuteCents: body.ratePerMinuteCents,
      overageRatePerMinuteCents: body.overageRatePerMinuteCents,
      paymentTerms: body.paymentTerms,
      invoiceFrequency: body.invoiceFrequency,
      customBillingContact: body.customBillingContact,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedAccount = await (BillingAccount as any).findByIdAndUpdate(
      account._id.toString(),
      {
        $set: {
          billingType: "enterprise_contract",
          enterpriseContract,
          billingEmailAddresses: body.billingEmailAddresses || account.billingEmailAddresses,
        },
      },
      { new: true }
    )

    return NextResponse.json({
      contract: {
        id: updatedAccount._id.toString(),
        organizationId: updatedAccount.organizationId,
        contractStartDate: enterpriseContract.contractStartDate,
        contractEndDate: enterpriseContract.contractEndDate,
        committedUsageMinutes: enterpriseContract.committedUsageMinutes,
        ratePerMinuteCents: enterpriseContract.ratePerMinuteCents,
        overageRatePerMinuteCents: enterpriseContract.overageRatePerMinuteCents,
        paymentTerms: enterpriseContract.paymentTerms,
        invoiceFrequency: enterpriseContract.invoiceFrequency,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error creating contract:", error)
    return NextResponse.json(
      { error: message || "Failed to create contract" },
      { status: 500 }
    )
  }
}
