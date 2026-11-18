"use client";

/* Report downloads for admin tables: what the table shows (headers + cell text, action buttons left out) as a real
   Excel workbook (.xlsx) or a PDF. The libraries load only when someone downloads, so pages stay fast. */

export interface ReportData { title: string; brand: string; headers: string[]; rows: string[][] }

/** Reads a rendered table: header texts and cell texts, skipping columns that only hold buttons. */
export function readTable(table: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
  const body = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => {
    const clone = td.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button, .sr-only, svg").forEach((x) => x.remove());
    return (clone.innerText ?? clone.textContent ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  }));
  const keep = heads.map((h, i) => h !== "" || body.some((r) => (r[i] ?? "") !== ""));
  return { headers: heads.filter((_, i) => keep[i]).map((h, i) => h || `Column ${i + 1}`), rows: body.map((r) => r.filter((_, i) => keep[i])) };
}

const fileName = (title: string, ext: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"}-${new Date().toISOString().slice(0, 10)}.${ext}`;
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** "TWD 12,800" / "1,200" / "45%" become numbers in Excel so they can be summed. */
function cellValue(v: string): string | number {
  const m = /^(?:[A-Z]{3}\s)?(-?[\d,]+(?:\.\d+)?)$/.exec(v.trim());
  return m ? Number(m[1].replace(/,/g, "")) : v;
}

export async function downloadExcel(r: ReportData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = r.brand; wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([`${r.brand} · ${r.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Exported ${new Date().toLocaleString("en-GB")}`]).font = { color: { argb: "FF64748B" } };
  ws.addRow([]);
  const head = ws.addRow(r.headers);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } }; });
  r.rows.forEach((row) => ws.addRow(row.map(cellValue)));
  ws.columns.forEach((col, i) => { col.width = Math.min(48, Math.max(10, r.headers[i]?.length ?? 10, ...r.rows.map((x) => (x[i] ?? "").length)) + 2); });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.headers.length } };
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(r.title, "xlsx"));
}

export async function downloadPdf(r: ReportData) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: r.headers.length > 5 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16); doc.setTextColor(11, 31, 58); doc.text(`${r.brand} · ${r.title}`, 40, 46);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text(`Exported ${new Date().toLocaleString("en-GB")} · ${r.rows.length} rows`, 40, 62);
  autoTable(doc, {
    head: [r.headers], body: r.rows, startY: 76, margin: { left: 40, right: 40 },
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 }, alternateRowStyles: { fillColor: [245, 247, 250] },
    didDrawPage: () => { const n = doc.getNumberOfPages(); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Page ${n}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 20); },
  });
  save(doc.output("blob"), fileName(r.title, "pdf"));
}
