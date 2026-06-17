import { VerificationPanel } from "../../components/verification-panel";

interface ReportPageProps {
  searchParams: Promise<{
    claim?: string;
    url?: string;
    title?: string;
  }>;
}

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const params = await searchParams;

  return (
    <main className="app-shell">
      <section className="intro compact">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Cognitio report</span>
        </div>
        <h1>Verification report</h1>
        <p>Run a fresh check from the selected text or page context sent by the extension.</p>
      </section>
      <VerificationPanel initialClaim={params.claim ?? ""} initialUrl={params.url} initialTitle={params.title} />
    </main>
  );
}
