import { NextRequest } from "next/server";
import { deleteUserService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await deleteUserService(id);
    return apiResponse(result.data, result.status, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { success: false, message: "Server Error while deleting user", error: message },
      500,
      req
    );
  }
}
