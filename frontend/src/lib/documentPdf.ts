import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { BillingDocumentData, DocumentField } from "./billingDocument";

// A real text PDF, generated from the same presentation data as the printable React view.
// No DOM capture, server calls, account chrome, or browser headers/footers.
export async function createDocumentPdf(data: BillingDocumentData, fontBytes: Uint8Array) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(`PowerManage ${data.title} ${data.reference}`);
  pdf.setAuthor("PowerManage");
  pdf.setSubject("Electricity billing document");
  const ink = rgb(.12, .16, .21), muted = rgb(.31, .36, .41), accent = rgb(.84, .2, .25);
  const border = rgb(.86, .88, .90), soft = rgb(.97, .98, .98);
  const width = 595.28, height = 841.89, margin = 42, inner = width - margin * 2;
  let page!: PDFPage;
  let y = 0;
  const text = (value: string, x: number, top: number, size = 10, color = ink) => page.drawText(value, { x, y: height - top - size, size, font, color });
  const wrap = (value: string, max: number, size = 10) => {
    const lines: string[] = []; let line = "";
    for (const word of value.replace(/[\r\n]+/g, " ").split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      // Preserve full long IDs while allowing them to wrap within their column.
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > max) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line.trimEnd()); return lines;
  };
  const newPage = () => { page = pdf.addPage([width, height]); y = margin; };
  const ensure = (needed: number) => { if (y + needed > height - 66) newPage(); };
  const rule = () => { page.drawLine({ start: { x: margin, y: height - y }, end: { x: width - margin, y: height - y }, color: border, thickness: .7 }); };
  newPage();
  page.drawRectangle({ x: margin, y: height - margin - 3, width: inner, height: 3, color: accent });
  y += 18; text("PowerManage", margin, y, 23, accent); text("Smart Electricity Management", margin, y + 32, 9, muted);
  text(data.title, margin + 285, y + 2, 19);
  const statusColor = data.status === "paid" ? rgb(.04, .4, .22) : data.status === "overdue" ? accent : muted;
  page.drawRectangle({ x: margin + 285, y: height - y - 57, width: 98, height: 25, color: data.status === "paid" ? rgb(.9, .96, .92) : soft });
  text(data.status.toUpperCase(), margin + 296, y + 37, 11, statusColor);
  if (data.status === "paid") {
    page.drawLine({ start: { x: margin + 358, y: height - y - 46 }, end: { x: margin + 362, y: height - y - 50 }, thickness: 1.5, color: statusColor });
    page.drawLine({ start: { x: margin + 362, y: height - y - 50 }, end: { x: margin + 370, y: height - y - 40 }, thickness: 1.5, color: statusColor });
  }
  y += 76; rule(); y += 16;
  const grid = (fields: DocumentField[], columns = 2) => {
    const cell = inner / columns;
    for (let start = 0; start < fields.length; start += columns) {
      const row = fields.slice(start, start + columns);
      const values = row.map(item => wrap(item.value, cell - 20));
      const rowHeight = Math.max(...values.map(lines => lines.length)) * 14 + 30;
      ensure(rowHeight);
      row.forEach((item, index) => {
        const x = margin + index * cell;
        text(item.label.toUpperCase(), x, y, 8, muted);
        values[index].forEach((line, n) => text(line, x, y + 16 + n * 14));
      });
      y += rowHeight;
    }
  };
  const heading = (label: string) => { ensure(76); y += 5; rule(); y += 14; text(label.toUpperCase(), margin, y, 9, muted); y += 24; };
  const rows = (fields: DocumentField[]) => {
    for (const item of fields) {
      const labels = wrap(item.label, inner * .43), values = wrap(item.value, inner * .53);
      const rowHeight = Math.max(labels.length, values.length) * 14 + 10;
      ensure(rowHeight);
      labels.forEach((line, n) => text(line, margin, y + n * 14, 10, muted));
      values.forEach((line, n) => text(line, width - margin - font.widthOfTextAtSize(line, 10), y + n * 14));
      y += rowHeight;
    }
  };
  grid(data.metadata); heading("Customer & property"); grid(data.customer);
  heading("Electricity consumption"); grid(data.readings, 3);
  heading("Tariff"); rows(data.tariff);
  ensure(180); heading("Payment summary"); rows(data.summary);
  y += 4;
  const totalLines = wrap(data.emphasis.value, inner * .56 - 24, 22);
  const totalHeight = Math.max(54, totalLines.length * 28 + 20);
  ensure(totalHeight);
  page.drawRectangle({ x: margin, y: height - y - totalHeight, width: inner, height: totalHeight, color: soft, borderColor: border, borderWidth: .7 });
  text(data.emphasis.label, margin + 14, y + 19, 12);
  totalLines.forEach((line, n) => text(line, width - margin - 14 - font.widthOfTextAtSize(line, 22), y + 11 + n * 28, 22, data.kind === "receipt" ? statusColor : accent));
  y += totalHeight + 18;
  if (data.disclaimer) {
    const lines = wrap(data.disclaimer, inner - 24, 9);
    ensure(lines.length * 13 + 24);
    page.drawRectangle({ x: margin, y: height - y - lines.length * 13 - 20, width: inner, height: lines.length * 13 + 20, color: soft });
    lines.forEach((line, n) => text(line, margin + 12, y + 10 + n * 13, 9, muted));
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    page = item;
    text("Manage Today. Save Tomorrow.", margin, height - 35, 8, muted);
    text(`${index + 1} / ${pages.length}`, width - margin - 24, height - 35, 8, muted);
  });
  return pdf.save();
}
