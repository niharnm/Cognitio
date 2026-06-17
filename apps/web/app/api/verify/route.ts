import {
  createBrightDataProviderFromEnv,
  verifyClaim,
  type ImageAttachment,
  type VerificationInput
} from "@cognitio/verifier";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedModes = new Set(["selected_text", "page", "manual"]);
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImages = 3;
const maxImageBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }

  const input = parseInput(body);
  if ("error" in input) {
    return jsonError("invalid_input", input.error, 400);
  }

  const provider = createBrightDataProviderFromEnv(process.env);
  if (!provider) {
    return jsonError(
      "provider_not_configured",
      "Bright Data is not configured. Set BRIGHT_DATA_API_KEY, BRIGHT_DATA_SERP_ZONE, and BRIGHT_DATA_UNLOCKER_ZONE on the server.",
      503
    );
  }

  try {
    const result = await verifyClaim(input, provider);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return jsonError("verification_failed", message, 502);
  }
}

function parseInput(body: unknown): VerificationInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object." };
  }

  const record = body as Record<string, unknown>;
  const claim = typeof record.claim === "string" ? record.claim.trim() : "";
  const mode = typeof record.mode === "string" ? record.mode : "manual";

  if (!claim) {
    return { error: "A claim is required." };
  }
  if (claim.length > 2500) {
    return { error: "Claim text must be 2,500 characters or fewer." };
  }
  if (!allowedModes.has(mode)) {
    return { error: "Mode must be selected_text, page, or manual." };
  }

  const parsed: VerificationInput = {
    claim,
    mode: mode as VerificationInput["mode"]
  };

  const sourceUrl = optionalString(record.sourceUrl);
  const pageTitle = optionalString(record.pageTitle);
  const imageAttachments = parseImageAttachments(record.imageAttachments);
  if ("error" in imageAttachments) {
    return { error: imageAttachments.error };
  }
  if (sourceUrl) {
    parsed.sourceUrl = sourceUrl;
  }
  if (pageTitle) {
    parsed.pageTitle = pageTitle;
  }
  if (imageAttachments.value.length > 0) {
    parsed.imageAttachments = imageAttachments.value;
  }

  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function parseImageAttachments(value: unknown): { value: ImageAttachment[] } | { error: string } {
  if (value === undefined) {
    return { value: [] };
  }
  if (!Array.isArray(value)) {
    return { error: "Image attachments must be an array." };
  }
  if (value.length > maxImages) {
    return { error: `Attach no more than ${maxImages} images.` };
  }

  const images: ImageAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { error: "Each image attachment must be an object." };
    }

    const record = item as Record<string, unknown>;
    const name = optionalString(record.name) ?? "attached image";
    const mediaType = typeof record.mediaType === "string" ? record.mediaType : "";
    const sizeBytes = typeof record.sizeBytes === "number" ? record.sizeBytes : 0;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";

    if (!allowedImageTypes.has(mediaType)) {
      return { error: "Images must be PNG, JPEG, WebP, or GIF files." };
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxImageBytes) {
      return { error: "Each image must be 5 MB or smaller." };
    }
    if (!dataUrl.startsWith(`data:${mediaType};base64,`)) {
      return { error: "Image attachment data must be a matching base64 data URL." };
    }

    images.push({
      name,
      mediaType: mediaType as ImageAttachment["mediaType"],
      sizeBytes
    });
  }

  return { value: images };
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}
