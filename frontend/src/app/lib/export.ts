// Client-side export of the (already filtered) campaign table to CSV / XLSX /
// PDF. Callers pass pre-formatted rows so the file matches what's on screen.
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportFormat = "csv" | "xlsx" | "pdf";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  // Quote when the value contains a comma, quote or newline (RFC 4180).
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(headers: string[], rows: Array<Array<string | number>>, filename: string): void {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (accents) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function exportXlsx(headers: string[], rows: Array<Array<string | number>>, filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Campaigns");
  XLSX.writeFile(wb, filename);
}

export function exportPdf(
  headers: string[],
  rows: Array<Array<string | number>>,
  filename: string,
  title = "Campaigns",
): void {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? ""))),
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [24, 119, 242] }, // Facebook blue
  });
  doc.save(filename);
}

export function exportCampaigns(
  format: ExportFormat,
  headers: string[],
  rows: Array<Array<string | number>>,
  filename: string,
): void {
  if (format === "csv") return exportCsv(headers, rows, filename);
  if (format === "xlsx") return exportXlsx(headers, rows, filename);
  return exportPdf(headers, rows, filename);
}
