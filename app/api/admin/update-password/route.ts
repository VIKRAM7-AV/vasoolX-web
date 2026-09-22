import { NextRequest } from "next/server";
import { updatePasswordService } from "@/services/adminService";
import { getAuthenticatedAdmin } from "@/lib/jwt";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function PUT(req: NextRequest) {
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
    const result = await updatePasswordService(auth.id, body);
    return apiResponse(result.data, result.status, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse({ message: "Internal server error", details: message }, 500, req);
  }
}
