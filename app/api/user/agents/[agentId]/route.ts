import { NextRequest } from "next/server";
import { updateAgentService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await updateAgentService(agentId, body);
    return apiResponse(result.data, result.status, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { message: "Internal server error", details: message },
      500,
      req
    );
  }
}
