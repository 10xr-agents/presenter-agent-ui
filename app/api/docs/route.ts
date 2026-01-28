import { NextResponse } from "next/server"
import swaggerSpec from "@/lib/swagger/config"

/**
 * @swagger
 * /api/docs:
 *   get:
 *     tags:
 *       - Documentation
 *     summary: Get OpenAPI specification
 *     description: Returns the OpenAPI 3.1 specification for the Presenter Agent API.
 *     responses:
 *       200:
 *         description: OpenAPI specification JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export async function GET() {
  return NextResponse.json(swaggerSpec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
