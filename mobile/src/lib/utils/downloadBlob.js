// Helper to trigger a "Save as..." browser download for an in-memory Blob.
//
// Why this exists: the PDF download endpoints (GET /<doc>/{id}/pdf/download)
// require the JWT Authorization header (set by smartcommon useApi), so we
// cannot put the URL in a plain <a href="..."> or window.open(...). We do an
// authenticated fetch via useApi().get(url, { raw: true }) which yields a
// Response, convert it to a Blob, and then trigger the download programmatically
// from a synthetic <a> with the download attribute.
//
// Lifetime: revokeObjectURL() is called on the next tick so the browser has
// time to start the download but we do not leak object URLs.
export function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
        throw new TypeError("downloadBlob: 'blob' must be a Blob instance");
    }
    if (typeof filename !== "string" || filename === "") {
        throw new TypeError("downloadBlob: 'filename' must be a non-empty string");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    // Some browsers require the anchor to be in the DOM to honour `.click()`.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Defer revocation so Safari/Firefox have time to detach the download
    // request from the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parse the filename from a Content-Disposition header, falling back to the
// provided default when the header is missing or unparseable.
//
// Handles the common shapes the backend emits:
//   attachment; filename="DEVIS_PR2401-0001.pdf"
//   attachment; filename=plain.pdf
//   attachment; filename*=UTF-8''My%20file.pdf  (RFC 5987 -- decoded)
export function filenameFromContentDisposition(headerValue, fallback) {
    const fb = typeof fallback === "string" && fallback !== "" ? fallback : "document.pdf";
    if (typeof headerValue !== "string" || headerValue === "") return fb;

    // RFC 5987 encoded form has priority when present.
    const star = headerValue.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
    if (star && star[1]) {
        try {
            return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
        } catch (_e) {
            // fall through to the plain form
        }
    }

    const plain = headerValue.match(/filename\s*=\s*("([^"]+)"|([^;]+))/i);
    if (plain) {
        const raw = (plain[2] ?? plain[3] ?? "").trim();
        if (raw !== "") return raw;
    }

    return fb;
}
