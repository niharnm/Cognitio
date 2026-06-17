import { VerificationPanel } from "../components/verification-panel";

export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="intro">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Cognitio</span>
        </div>
        <h1>Check claims before they spread.</h1>
        <p>
          Verify a pasted claim on the web, or use the Chrome extension while reading. Cognitio searches public
          evidence and returns cautious labels instead of fake certainty.
        </p>
        <div className="mode-links" aria-label="Verification options">
          <a href="#manual-check">
            <strong>Manual web check</strong>
            <span>Paste a claim, URL, screenshot, or headline.</span>
          </a>
          <a href="#extension">
            <strong>Chrome extension</strong>
            <span>Highlight text on a page and send it to the same verifier.</span>
          </a>
        </div>
      </section>
      <div className="workspace-area">
        <VerificationPanel />
        <section className="extension-panel" id="extension">
          <div>
            <h2>Use it in Chrome</h2>
            <p>
              The extension is for in-context checks. It only reads selected text or the current page title after
              you click a Cognitio action.
            </p>
          </div>
          <ol>
            <li>Run the web API locally.</li>
            <li>Build the extension package.</li>
            <li>Load <code>apps/extension/dist</code> from <code>chrome://extensions</code>.</li>
            <li>Highlight text on a public page and choose “Verify selected claim.”</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
