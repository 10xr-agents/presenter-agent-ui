// Prisma client for Better Auth
export { prisma } from "./prisma"

// Mongoose connection for application features
export { getModel, getCollection } from "./mongodb"
export { default as connectDB } from "./mongoose"

// Re-export for convenience
export { default as mongoose } from "mongoose"
