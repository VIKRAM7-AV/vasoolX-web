import { NextRequest } from "next/server";
import { adminAmountPaidService } from "@/services/adminService";
import { getAuthenticatedAdmin } from "@/lib/jwt";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthenticatedAdmin(req);
    if (!auth) {
      return apiResponse(
        { success: false, message: "Invalid or expired token" },
        401,
        req
      );
    }

    const body = await req.json().catch(() => ({}));
    const result = await adminAmountPaidService(auth.id, body.paidAmount);
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
