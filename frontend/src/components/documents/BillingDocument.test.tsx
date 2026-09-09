import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { billingDocumentData, documentBill, formatCurrency, formatUnits, formatDate } from "@/lib/billingDocument";
import { createDocumentPdf } from "@/lib/documentPdf";
import { DocumentPreview, PrintableDocument } from "./BillingDocument";
import type { MyBill } from "@/types/portal";

const sample: MyBill = {
  id: 42, invoice_number: "INV-2026-0018", submitter_name: "Biki", property_name: "Gadadhara", unit: "500",
  previous_reading: 500, current_reading: 686, units: 186, rate_per_unit: 6.15, tariff_label: "Manual rate", rate_mode: "manual",
  total_amount: 1145, status: "paid", payment_method: "card", transaction_id: "DEMO-PAY-2026-1048",
  paid_at: "2026-09-08T09:41:00Z", issued_at: "2026-09-08T09:00:00Z", due_date: "2026-09-30",
  billing_period_start: "2026-09-10", billing_period_end: "2026-09-30",
};

describe("Standalone billing documents", () => {
  it("formats numbers safely and uses a consistent India date/time", () => {
    expect(formatUnits("00199.000000")).toBe("199");
    expect(formatUnits("199.500000")).toBe("199.5");
    expect(formatCurrency(1400)).toBe("₹1,400.00");
    for (const value of [null, undefined, Infinity, NaN, ""]) expect(formatCurrency(value)).toBe("—");
    expect(formatDate(sample.paid_at, true)).toBe("8 Sep 2026, 3:11 PM");
    expect(formatDate("2026-09-08T09:41:00", true)).toBe("8 Sep 2026, 3:11 PM");
    expect(formatDate("invalid")).toBe("—");
  });

  it("preserves the authoritative total without multiplying displayed readings and rate", () => {
    const invoice = billingDocumentData(documentBill(sample), "invoice");
    const receipt = billingDocumentData(documentBill(sample), "receipt");
    expect(invoice.summary[0].value).toBe("₹1,145.00");
    expect(receipt.emphasis.value).toBe("₹1,145.00");
    expect(invoice.emphasis.value).toBe("₹0.00");
    expect(invoice.readings).toEqual(receipt.readings);
    expect(invoice.tariff[0].value).toBe("₹6.15 / unit");
    expect(receipt.disclaimer).toContain("No real payment was processed");
    expect(receipt.metadata.find(item => item.label === "Transaction ID")?.value).toBe(sample.transaction_id);
    expect(() => billingDocumentData(documentBill({ ...sample, status: "pending" }), "receipt")).toThrow(/confirmed/);
  });

  it("downloads a PDF blob rather than opening the print dialog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => (await readFile("public/fonts/NotoSans-Regular.ttf")).buffer }));
    const createUrl = vi.fn((blob: Blob) => `blob:test-${blob.type}`);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<DocumentPreview bill={documentBill(sample)} kind="receipt" />);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(createUrl).toHaveBeenCalledOnce(), { timeout: 10000 });
    expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce(); expect(print).not.toHaveBeenCalled();
    vi.unstubAllGlobals(); click.mockRestore(); print.mockRestore();
  });

  it("exports the exact sample and print fixtures through the production renderer", async () => {
    const fonts = new Uint8Array(await readFile("public/fonts/NotoSans-Regular.ttf"));
    for (const kind of ["invoice", "receipt"] as const) {
      const data = billingDocumentData(documentBill(sample), kind);
      const bytes = await createDocumentPdf(data, fonts);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
      const html = renderToStaticMarkup(<main className="app-test-shell"><header>SEARCH PROFILE NOTIFICATIONS</header><aside>SIDEBAR</aside><div className="workspace"><div className="document-actions"><button>Download PDF</button></div><PrintableDocument data={data} /></div><nav>Home My Bills Meter Usage More</nav></main>);
      expect(html).not.toContain("NaN");
      if (process.env.DOCUMENT_QA === "1") {
        await mkdir("output/pdf", { recursive: true });
        await writeFile(`output/pdf/${kind}-download.pdf`, bytes);
        const css = (await readFile("src/app/documents.css", "utf8")).replaceAll('/fonts/', '../../public/fonts/');
        await writeFile(`output/pdf/${kind}-print.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
      }
    }
  }, 15000);
});
