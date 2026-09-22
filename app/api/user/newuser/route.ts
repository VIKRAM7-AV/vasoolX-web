import { NextRequest } from "next/server";
import { createUserService } from "@/services/vasoolService";
import { apiResponse, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const name = (formData.get("name") as string) || "";
      const phone = (formData.get("phone") as string) || undefined;

      let profileBuffer: Buffer | null = null;
      const profileFile = formData.get("profile");
      if (profileFile && typeof profileFile === "object" && "arrayBuffer" in profileFile) {
        const fileObj = profileFile as File;
        if (fileObj.size > 0) {
          profileBuffer = Buffer.from(await fileObj.arrayBuffer());
        }
      }

      let proofFiles = formData.getAll("proofs");
      if (proofFiles.length === 0) {
        const fallback = formData.getAll("proof");
        if (fallback.length > 0) {
          proofFiles = fallback;
        } else {
          const proof1File = formData.get("proof1");
          if (proof1File) proofFiles = [proof1File];
        }
      }

      const proofBuffers: Buffer[] = [];
      for (const fileItem of proofFiles) {
        if (fileItem && typeof fileItem === "object" && "arrayBuffer" in fileItem) {
          const fileObj = fileItem as File;
          if (fileObj.size > 0) {
            proofBuffers.push(Buffer.from(await fileObj.arrayBuffer()));
          }
        }
      }

      if (proofBuffers.length > 5) {
        return apiResponse(
          { message: "Maximum 5 proof attachments are allowed" },
          400,
          req
        );
      }

      const result = await createUserService({
        name,
        phone,
        profileBuffer,
        proofBuffers,
      });

      return apiResponse(result.data, result.status, req);
    } else {
      const body = await req.json().catch(() => ({}));
      const result = await createUserService({
        name: body.name,
        phone: body.phone,
      });
      return apiResponse(result.data, result.status, req);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return apiResponse(
      { message: "Internal server error", details: message },
      500,
      req
    );
  }
}
