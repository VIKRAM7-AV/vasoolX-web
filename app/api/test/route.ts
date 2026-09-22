import { NextRequest } from "next/server";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function GET(req: NextRequest) {
  return apiResponse(
    {
      status: "online",
      message: "Hello, VasoolX! This is a test endpoint running on Next.js.",
      timestamp: new Date().toISOString(),
    },
    200,
    req
  );
}
