interface PageContextResponse {
  selectedText: string;
  title: string;
  heading: string;
  url: string;
}

interface PendingVerification {
  claim: string;
  sourceUrl?: string;
  pageTitle?: string;
  mode: "selected_text" | "page";
}

interface VerificationResult {
  verdict: "supported" | "disputed" | "unverified" | "misleading_context" | "not_checkable";
  confidence: "high" | "medium" | "low";
  explanation: string;
  normalizedClaim: {
    normalized: string;
  };
  sources: Array<{
    title: string;
    url: string;
    source?: string;
    snippet?: string;
  }>;
}

interface ApiError {
  error: {
    message: string;
  };
}

const verdictCopy: Record<VerificationResult["verdict"], string> = {
  supported: "Supported",
  disputed: "Disputed",
  unverified: "Unverified",
  misleading_context: "Misleading context",
  not_checkable: "Not checkable"
};

const apiBaseInput = requireElement<HTMLInputElement>("#api-base");
const statusEl = requireElement<HTMLElement>("#status");
const resultEl = requireElement<HTMLElement>("#result");
const selectionButton = requireElement<HTMLButtonElement>("#verify-selection");
const pageButton = requireElement<HTMLButtonElement>("#verify-page");

void initialize();

selectionButton.addEventListener("click", () => {
  void verifySelection();
});

pageButton.addEventListener("click", () => {
  void verifyPage();
});

apiBaseInput.addEventListener("change", () => {
  void chrome.storage.local.set({ apiBase: cleanApiBase(apiBaseInput.value) });
});

async function initialize() {
  const stored = await chrome.storage.local.get("apiBase");
  apiBaseInput.value = typeof stored.apiBase === "string" ? stored.apiBase : "http://localhost:3000";

  const session = await chrome.storage.session.get("pendingVerification");
  const pending = session.pendingVerification as PendingVerification | undefined;
  if (pending?.claim) {
    await chrome.storage.session.remove("pendingVerification");
    await runVerification(pending);
  }
}

async function verifySelection() {
  const context = await getPageContext();
  if (!context.selectedText) {
    showStatus("No selected text found on this page.", true);
    return;
  }

  await runVerification({
    claim: context.selectedText,
    sourceUrl: context.url,
    pageTitle: context.title,
    mode: "selected_text"
  });
}

async function verifyPage() {
  const context = await getPageContext();
  const claim = context.heading || context.title;
  if (!claim) {
    showStatus("This page does not expose a title or headline to verify.", true);
    return;
  }

  await runVerification({
    claim,
    sourceUrl: context.url,
    pageTitle: context.title,
    mode: "page"
  });
}

async function getPageContext(): Promise<PageContextResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectPageContext
  });

  if (!injection?.result) {
    throw new Error("Unable to read the active page after user action.");
  }

  return injection.result;
}

async function runVerification(input: PendingVerification) {
  setLoading(true);
  try {
    const apiBase = cleanApiBase(apiBaseInput.value);
    await chrome.storage.local.set({ apiBase });
    await ensureApiPermission(apiBase);

    const response = await fetch(`${apiBase}/api/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    const payload = (await response.json()) as VerificationResult | ApiError;
    if (!response.ok) {
      throw new Error("error" in payload ? payload.error.message : "Verification failed.");
    }

    renderResult(payload as VerificationResult, input, apiBase);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Verification failed.", true);
  } finally {
    setLoading(false);
  }
}

function renderResult(result: VerificationResult, input: PendingVerification, apiBase: string) {
  const params = new URLSearchParams();
  params.set("claim", input.claim);
  if (input.sourceUrl) {
    params.set("url", input.sourceUrl);
  }
  if (input.pageTitle) {
    params.set("title", input.pageTitle);
  }

  resultEl.hidden = false;
  statusEl.textContent = "";
  resultEl.innerHTML = `
    <span class="verdict ${result.verdict}">${escapeHtml(verdictCopy[result.verdict])}</span>
    <h2>${escapeHtml(result.normalizedClaim.normalized || input.claim)}</h2>
    <p>${escapeHtml(result.explanation)} ${escapeHtml(result.confidence)} confidence.</p>
    ${renderSources(result.sources)}
    <a class="open-report" href="${escapeAttribute(`${apiBase}/report?${params.toString()}`)}" target="_blank" rel="noreferrer">Open full report</a>
  `;
}

function renderSources(sources: VerificationResult["sources"]) {
  if (sources.length === 0) {
    return "<p>No sources returned.</p>";
  }

  return sources
    .slice(0, 3)
    .map(
      (source) => `
        <a class="source" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(source.source ?? hostname(source.url))}</span>
          <strong>${escapeHtml(source.title)}</strong>
        </a>
      `
    )
    .join("");
}

function setLoading(loading: boolean) {
  selectionButton.disabled = loading;
  pageButton.disabled = loading;
  if (loading) {
    resultEl.hidden = true;
    showStatus("Checking public evidence...");
  }
}

function showStatus(message: string, error = false) {
  statusEl.className = error ? "status error" : "status";
  statusEl.textContent = message;
}

function cleanApiBase(value: string) {
  return value.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

async function ensureApiPermission(apiBase: string) {
  const origin = new URL(apiBase).origin;
  if (origin === "http://localhost:3000") {
    return;
  }

  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    throw new Error("Permission to contact the configured Cognitio API was not granted.");
  }
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function collectPageContext(): PageContextResponse {
  return {
    selectedText: window.getSelection()?.toString().trim() ?? "",
    title: document.title,
    heading: document.querySelector("h1")?.textContent?.trim() ?? "",
    url: window.location.href
  };
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Popup UI is missing ${selector}.`);
  }
  return element;
}
