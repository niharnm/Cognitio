"use client";

import type { VerificationResult, VerdictLabel } from "@cognitio/verifier";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

interface VerificationPanelProps {
  initialClaim?: string;
  initialUrl?: string | undefined;
  initialTitle?: string | undefined;
}

interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

interface ClientImageAttachment {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  dataUrl: string;
  previewUrl: string;
}

const maxImages = 3;
const maxImageBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const verdictCopy: Record<VerdictLabel, string> = {
  supported: "Supported",
  disputed: "Disputed",
  unverified: "Unverified",
  misleading_context: "Misleading context",
  not_checkable: "Not checkable"
};

export function VerificationPanel({ initialClaim = "", initialUrl, initialTitle }: VerificationPanelProps) {
  const [claim, setClaim] = useState(initialClaim);
  const [sourceUrl, setSourceUrl] = useState(initialUrl ?? "");
  const [pageTitle, setPageTitle] = useState(initialTitle ?? "");
  const [images, setImages] = useState<ClientImageAttachment[]>([]);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const imagesRef = useRef<ClientImageAttachment[]>([]);

  const canSubmit = claim.trim().length > 0 && !loading;
  const hasImages = images.length > 0;
  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (claim.trim()) {
      params.set("claim", claim.trim());
    }
    if (sourceUrl.trim()) {
      params.set("url", sourceUrl.trim());
    }
    if (pageTitle.trim()) {
      params.set("title", pageTitle.trim());
    }
    return `/report?${params.toString()}`;
  }, [claim, pageTitle, sourceUrl]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => revokePreviews(imagesRef.current);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          claim,
          sourceUrl: sourceUrl || undefined,
          pageTitle: pageTitle || undefined,
          imageAttachments: images.map((image) => ({
            name: image.name,
            mediaType: image.mediaType,
            sizeBytes: image.sizeBytes,
            dataUrl: image.dataUrl
          })),
          mode: sourceUrl ? "page" : "manual"
        })
      });

      const payload = (await response.json()) as VerificationResult | ApiError;
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error.message : "Verification failed.");
      }
      setResult(payload as VerificationResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImageError(null);
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }
    if (images.length + files.length > maxImages) {
      setImageError(`Attach no more than ${maxImages} images.`);
      return;
    }

    const nextImages: ClientImageAttachment[] = [];
    for (const file of files) {
      if (!allowedImageTypes.has(file.type)) {
        setImageError("Images must be PNG, JPEG, WebP, or GIF files.");
        revokePreviews(nextImages);
        return;
      }
      if (file.size > maxImageBytes) {
        setImageError("Each image must be 5 MB or smaller.");
        revokePreviews(nextImages);
        return;
      }

      nextImages.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        name: file.name,
        mediaType: file.type,
        sizeBytes: file.size,
        dataUrl: await readFileAsDataUrl(file),
        previewUrl: URL.createObjectURL(file)
      });
    }

    setImages((current) => [...current, ...nextImages]);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
  }

  return (
    <section className="workspace-panel" id="manual-check">
      <form className="verify-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <h2>Manual check</h2>
            <p>Submit the exact claim. Images are context only until OCR is wired in.</p>
          </div>
          <span>{claim.trim().length}/2500</span>
        </div>

        <div>
          <label htmlFor="claim">Claim text</label>
          <textarea
            id="claim"
            value={claim}
            maxLength={2500}
            onChange={(event) => setClaim(event.target.value)}
            placeholder="Paste the exact claim you want checked."
            rows={7}
          />
        </div>

        <div className="field-grid">
          <div>
            <label htmlFor="sourceUrl">Source URL</label>
            <input
              id="sourceUrl"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Optional"
              type="url"
            />
          </div>
          <div>
            <label htmlFor="pageTitle">Page title</label>
            <input
              id="pageTitle"
              value={pageTitle}
              onChange={(event) => setPageTitle(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="image-field">
          <div className="image-field-copy">
            <label htmlFor="imageAttachments">Images</label>
            <p>Attach screenshots or article images as context. OCR is not enabled yet, so include the claim text above.</p>
          </div>
          <input
            id="imageAttachments"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={handleImageChange}
            type="file"
          />
          {imageError ? <p className="field-error">{imageError}</p> : null}
          {hasImages ? (
            <div className="image-preview-grid">
              {images.map((image) => (
                <div className="image-preview" key={image.id}>
                  <img alt="" src={image.previewUrl} />
                  <div>
                    <strong>{image.name}</strong>
                    <span>{formatBytes(image.sizeBytes)}</span>
                  </div>
                  <button type="button" onClick={() => removeImage(image.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="actions">
          <button type="submit" disabled={!canSubmit}>
            {loading ? "Checking..." : "Verify claim"}
          </button>
          <a href={reportUrl}>Open report view</a>
        </div>
      </form>

      <div className="result-panel" aria-live="polite">
        {!result && !error && !loading ? (
          <EmptyState />
        ) : null}
        {loading ? <p className="status-text">Searching public evidence through the server-side verifier.</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {result ? <VerificationReport result={result} /> : null}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <span className="empty-kicker">Waiting for evidence</span>
      <h2>No check has run yet.</h2>
      <p>Run a claim check to see the verdict, source quality, missing evidence, and AI summary audit status.</p>
    </div>
  );
}

function VerificationReport({ result }: { result: VerificationResult }) {
  return (
    <article className="report">
      <div className="verdict-row">
        <span className={`verdict ${result.verdict}`}>{verdictCopy[result.verdict]}</span>
        <span className="confidence">{result.confidence} confidence</span>
      </div>
      <h2>{result.normalizedClaim.normalized || "Submitted text"}</h2>
      <p>{result.explanation}</p>

      {result.input.imageAttachments?.length ? (
        <section>
          <h3>Image context</h3>
          <div className="attachment-list">
            {result.input.imageAttachments.map((image) => (
              <span key={`${image.name}-${image.sizeBytes}`}>
                {image.name} · {formatBytes(image.sizeBytes)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {result.warnings.length > 0 ? (
        <section>
          <h3>Warnings</h3>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.missingEvidence.length > 0 ? (
        <section>
          <h3>Missing evidence</h3>
          <ul>
            {result.missingEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>Sources</h3>
        {result.sources.length > 0 ? (
          <div className="source-list">
            {result.sources.slice(0, 5).map((source) => (
              <a className="source-card" href={source.url} key={source.url} rel="noreferrer" target="_blank">
                <span>{source.source ?? hostname(source.url)}</span>
                <strong>{source.title}</strong>
                {source.snippet ? <p>{source.snippet}</p> : null}
                <small>{source.whyItMatters}</small>
              </a>
            ))}
          </div>
        ) : (
          <p className="status-text">No sources were returned.</p>
        )}
      </section>

      <section>
        <h3>AI/search summary risk</h3>
        <p>{result.aiSummaryAudit.note}</p>
      </section>
    </article>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Image could not be read."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Image could not be read.")));
    reader.readAsDataURL(file);
  });
}

function revokePreviews(images: ClientImageAttachment[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
