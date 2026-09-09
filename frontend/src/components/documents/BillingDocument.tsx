"use client";

import { useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { billingDocumentData, type BillingDocumentData, type DocumentBill, type DocumentField } from "@/lib/billingDocument";

function InfoGrid({ fields, className = "" }: { fields: DocumentField[]; className?: string }) {
  return <dl className={`document-grid ${className}`}>{fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function PrintableDocument({ data }: { data: BillingDocumentData }) {
  return <article className="billing-document" data-kind={data.kind} aria-label={data.title}>
    <header className="document-header">
      <div><p className="document-brand">PowerManage</p><p className="document-subtitle">Smart Electricity Management</p></div>
      <div className="document-heading"><h1>{data.title}</h1><span className={`document-status document-status-${data.status}`}>{data.status === "paid" && <span aria-hidden="true">✓ </span>}{data.status.toUpperCase()}</span></div>
    </header>
    <InfoGrid fields={data.metadata} />
    <section className="document-section"><h2>Customer &amp; property</h2><InfoGrid fields={data.customer} /></section>
    <section className="document-section"><h2>Electricity consumption</h2><InfoGrid fields={data.readings} className="document-readings" /></section>
    <section className="document-section"><h2>Tariff</h2><dl className="document-rows">{data.tariff.map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    <section className="document-summary"><h2>Payment summary</h2><dl className="document-rows">{data.summary.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="document-total"><dt>{data.emphasis.label}</dt><dd>{data.emphasis.value}</dd></div></dl></section>
    {data.disclaimer && <aside className="document-disclaimer">{data.disclaimer}</aside>}
    <footer className="document-footer">Manage Today. Save Tomorrow.<span>PowerManage · {data.reference}</span></footer>
  </article>;
}

export function InvoicePrintable({ bill }: { bill: DocumentBill }) { return <PrintableDocument data={billingDocumentData(bill, "invoice")} />; }
export function ReceiptPrintable({ bill }: { bill: DocumentBill }) { return <PrintableDocument data={billingDocumentData(bill, "receipt")} />; }

export function DocumentPreview({ bill, kind, actions }: { bill: DocumentBill; kind: "invoice" | "receipt"; actions?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (kind === "receipt" && bill.status !== "paid") return <div role="status">A receipt is available after payment is confirmed. {actions}</div>;
  const data = billingDocumentData(bill, kind);
  const download = async () => {
    setBusy(true); setError(null);
    try {
      const { createDocumentPdf } = await import("@/lib/documentPdf");
      const response = await fetch("/fonts/NotoSans-Regular.ttf");
      if (!response.ok) throw new Error("Unable to load the PDF font. Please try again.");
      const bytes = await createDocumentPdf(data, new Uint8Array(await response.arrayBuffer()));
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = `PowerManage-${kind}-${data.reference.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to download PDF. Please try again."); }
    finally { setBusy(false); }
  };
  return <div className="document-preview">
    <div className="document-actions"><div>{actions}</div><div><button type="button" onClick={() => window.print()}><Printer size={16} />Print {kind === "invoice" ? "Invoice" : "Receipt"}</button><button type="button" onClick={() => void download()} disabled={busy} aria-busy={busy}><Download size={16} />{busy ? "Preparing PDF…" : "Download PDF"}</button></div></div>
    {error && <p role="alert" className="document-export-error">{error}</p>}
    <PrintableDocument data={data} />
  </div>;
}
