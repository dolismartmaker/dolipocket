// Export the current page rows to CSV / XLS / ODS.
//
// CSV: in-house generation, ";" separator (Excel FR), UTF-8 BOM.
// XLS / ODS: dynamic import of "xlsx" (SheetJS) so the chunk only loads on
// demand and doesn't bloat the initial bundle.
//
// File name: <feature>-<YYYYMMDD-HHMMSS>.<ext>.

const pad2 = (n) => String(n).padStart(2, "0");

const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
};

const toCellString = (col, row) => {
    // Optional override: a column may declare an exportFormatter to keep
    // the spreadsheet output plain text while letting `formatter` return
    // a React element for the on-screen rendering.
    if (typeof col?.exportFormatter === "function") {
        try {
            const v = col.exportFormatter(row[col.key], row);
            if (v === null || v === undefined) return "";
            return String(v);
        } catch (_) {
            return "";
        }
    }
    if (typeof col?.formatter === "function") {
        try {
            const formatted = col.formatter(row[col.key], row);
            if (formatted === null || formatted === undefined) return "";
            // A React element stringifies to "[object Object]", which is
            // useless in a CSV / spreadsheet. Fall back to the raw value
            // so the export remains readable; callers that need a richer
            // textual representation should expose `exportFormatter`.
            if (typeof formatted === "object" && formatted !== null && formatted.$$typeof) {
                const raw = row?.[col.key];
                return raw === null || raw === undefined ? "" : String(raw);
            }
            return String(formatted);
        } catch (_) {
            return "";
        }
    }
    const v = row?.[col.key];
    if (v === null || v === undefined) return "";
    return String(v);
};

const escapeCsvCell = (raw) => {
    const s = String(raw ?? "");
    if (s.includes(";") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
};

const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportCsv = (rows, columns, feature) => {
    const cols = (columns ?? []).filter((c) => c.visible !== false && c.key !== "_rownum");
    const header = cols.map((c) => escapeCsvCell(c.label ?? c.key)).join(";");
    const lines = (rows ?? []).map((row) => {
        return cols.map((c) => escapeCsvCell(toCellString(c, row))).join(";");
    });
    const body = [header, ...lines].join("\r\n");
    // Add UTF-8 BOM so Excel FR opens the file correctly without garbled accents.
    const bom = "\uFEFF";
    const blob = new Blob([bom + body], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, `${feature}-${stamp()}.csv`);
};

const exportSpreadsheet = async (rows, columns, feature, format) => {
    // Dynamic import to keep xlsx out of the main bundle.
    const XLSX = await import("xlsx");
    const cols = (columns ?? []).filter((c) => c.visible !== false && c.key !== "_rownum");
    const header = cols.map((c) => c.label ?? c.key);
    const data = (rows ?? []).map((row) => cols.map((c) => toCellString(c, row)));
    const aoa = [header, ...data];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, feature);

    const ext = format === "ods" ? "ods" : "xlsx";
    const bookType = format === "ods" ? "ods" : "xlsx";
    const fileName = `${feature}-${stamp()}.${ext}`;
    // Note: §8 of the spec says "xls" but SheetJS writes a modern .xlsx by
    // default. Excel opens both transparently. We keep the .xlsx extension
    // so antivirus / Mark-of-the-Web behave normally on Windows.
    XLSX.writeFile(wb, fileName, { bookType });
};

export const exportRows = async (rows, columns, format, feature = "export") => {
    const fmt = String(format ?? "csv").toLowerCase();
    if (fmt === "csv") {
        exportCsv(rows, columns, feature);
        return;
    }
    if (fmt === "xls" || fmt === "xlsx" || fmt === "ods") {
        await exportSpreadsheet(rows, columns, feature, fmt === "ods" ? "ods" : "xlsx");
        return;
    }
    throw new Error(`Unsupported export format: ${format}`);
};
