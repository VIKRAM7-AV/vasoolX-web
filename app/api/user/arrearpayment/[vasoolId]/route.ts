import { NextRequest } from "next/server";
import { arrearPaymentService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ vasoolId: string }> }
) {
  try {
    const { vasoolId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await arrearPaymentService(vasoolId, body);
    return apiResponse(result.data, result.status, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { message: "Server error", error: message },
      500,
      req
    );
  }
}
