import mongoose, { Schema } from "mongoose"

export type BillingType = "pay_as_you_go" | "enterprise_contract"
export type BillingAccountStatus = "active" | "suspended" | "closed"

export interface IPaymentMethod {
  type: "card" | "bank_transfer" | "invoice"
  lastFour?: string
  expirationDate?: Date
  billingName?: string
  cardBrand?: "visa" | "mastercard" | "amex" | "discover" | "other"
  stripePaymentMethodId?: string
}

export interface IEnterpriseContract {
  contractStartDate: Date
  contractEndDate: Date
  committedUsageMinutes: number
  ratePerMinuteCents: number
  overageRatePerMinuteCents: number
  paymentTerms: string // "Net 30", "Net 60", etc.
  invoiceFrequency: "monthly" | "quarterly" | "annual"
  customBillingContact?: {
    name: string
    email: string
  }
}

export interface IBillingAccount extends mongoose.Document {
  organizationId: string
  billingType: BillingType
  status: BillingAccountStatus
  
  // Pay-as-you-go fields
  balanceCents: number // Prepaid balance in cents
  autoReloadEnabled: boolean
  autoReloadThresholdCents: number // Balance threshold to trigger reload
  autoReloadAmountCents: number // Amount to reload
  minimumBalanceCents: number // Minimum balance requirement
  
  // Payment methods
  primaryPaymentMethod?: IPaymentMethod
  backupPaymentMethods: IPaymentMethod[]
  
  // Enterprise contract fields
  enterpriseContract?: IEnterpriseContract
  
  // Billing details
  currencyCode: string // "USD", "EUR", etc.
  billingEmailAddresses: string[]
  billingAddress?: {
    street: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  taxIdentificationNumber?: string
  
  createdAt: Date
  updatedAt: Date
}

const BillingAccountSchema = new Schema<IBillingAccount>(
  {
    organizationId: { type: String, required: true, unique: true },
    billingType: {
      type: String,
      enum: ["pay_as_you_go", "enterprise_contract"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "closed"],
      default: "active",
      index: true,
    },
    
    // Pay-as-you-go fields
    balanceCents: { type: Number, default: 0 },
    autoReloadEnabled: { type: Boolean, default: false },
    autoReloadThresholdCents: { type: Number, default: 1000 }, // $10 default
    autoReloadAmountCents: { type: Number, default: 10000 }, // $100 default
    minimumBalanceCents: { type: Number, default: 0 },
    
    // Payment methods
    primaryPaymentMethod: {
      type: {
        type: String,
        enum: ["card", "bank_transfer", "invoice"],
      },
      lastFour: String,
      expirationDate: Date,
      billingName: String,
      cardBrand: {
        type: String,
        enum: ["visa", "mastercard", "amex", "discover", "other"],
      },
      stripePaymentMethodId: String,
    },
    backupPaymentMethods: [
      {
        type: {
          type: String,
          enum: ["card", "bank_transfer", "invoice"],
        },
        lastFour: String,
        expirationDate: Date,
        billingName: String,
        cardBrand: {
          type: String,
          enum: ["visa", "mastercard", "amex", "discover", "other"],
        },
        stripePaymentMethodId: String,
      },
    ],
    
    // Enterprise contract fields
    enterpriseContract: {
      contractStartDate: Date,
      contractEndDate: Date,
      committedUsageMinutes: Number,
      ratePerMinuteCents: Number,
      overageRatePerMinuteCents: Number,
      paymentTerms: String,
      invoiceFrequency: {
        type: String,
        enum: ["monthly", "quarterly", "annual"],
      },
      customBillingContact: {
        name: String,
        email: String,
      },
    },
    
    // Billing details
    currencyCode: { type: String, default: "USD" },
    billingEmailAddresses: [String],
    billingAddress: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    taxIdentificationNumber: String,
  },
  { timestamps: true }
)

// Indexes for efficient queries
// organizationId index is automatically created by unique: true
BillingAccountSchema.index({ status: 1, billingType: 1 })

export const BillingAccount =
  mongoose.models.BillingAccount ||
  mongoose.model<IBillingAccount>("BillingAccount", BillingAccountSchema)
