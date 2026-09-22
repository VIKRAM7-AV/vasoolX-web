import { NextRequest } from "next/server";
import { bookingVasoolService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const userId = (formData.get("userId") as string) || undefined;
      const agentId = (formData.get("agentId") as string) || undefined;
      const startingDate = (formData.get("startingDate") as string) || undefined;
      const bookingType = (formData.get("bookingType") as
        | "10 weeks"
        | "50 days"
        | "100 days") || undefined;

      const amountRaw = formData.get("amount");
      const amount =
        amountRaw !== null && amountRaw !== "" && !isNaN(Number(amountRaw))
          ? Number(amountRaw)
          : undefined;

      let mediaBuffer: Buffer | null = null;
      const mediaFile = formData.get("media");
      if (mediaFile && typeof mediaFile === "object" && "arrayBuffer" in mediaFile) {
        const fileObj = mediaFile as File;
        if (fileObj.size > 0) {
          if (!fileObj.type.startsWith("image/")) {
            return apiResponse(
              { message: "Only image files are allowed for Vasool media" },
              400,
              req
            );
          }
          mediaBuffer = Buffer.from(await fileObj.arrayBuffer());
        }
      }

      const result = await bookingVasoolService({
        userId,
        agentId,
        amount,
        startingDate,
        bookingType,
        mediaBuffer,
      });

      return apiResponse(result.data, result.status, req);
    } else {
      const body = await req.json().catch(() => ({}));
      const result = await bookingVasoolService(body);
      return apiResponse(result.data, result.status, req);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { message: "Internal server error", details: message },
      500,
      req
    );
  }
}

