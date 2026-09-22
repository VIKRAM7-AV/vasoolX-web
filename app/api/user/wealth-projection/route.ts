import { NextRequest } from "next/server";
import { getWealthProjectionService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const result = await getWealthProjectionService();
    return apiResponse(result.data, result.status, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { success: false, message: "Server error", error: message },
      500,
      req
    );
  }
}
