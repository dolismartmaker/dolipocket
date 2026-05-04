// vCard helpers used by ContactsPage / ContactPage / ContactImportModal.
// Backend exposes `contact/export/vcard` (base64 payload) and
// `contact/import/vcard` (multipart or JSON). These helpers handle the
// browser-side bridging: blob conversion, download, native sharing and
// picking, file reading, MIME detection.

const VCARD_EXTENSIONS = [".vcf", ".vcard"];
const VCARD_MIMES = ["text/vcard", "text/x-vcard", "text/directory"];

export const base64ToBlob = (base64, mime = "text/vcard") => {
    if (!base64) return new Blob([], { type: mime });
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
};

export const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "contacts.vcf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const hasContactPicker = () =>
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    typeof navigator.contacts.select === "function";

export const pickContacts = async (multiple = true) => {
    if (!hasContactPicker()) {
        throw new Error("Contact Picker API non disponible sur ce navigateur");
    }
    const props = ["name", "email", "tel", "address"];
    const options = { multiple: !!multiple };
    return navigator.contacts.select(props, options);
};

export const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error("File read error"));
        reader.readAsDataURL(file);
    });

export const isVCardFile = (file) => {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    if (VCARD_EXTENSIONS.some(ext => name.endsWith(ext))) return true;
    const type = String(file.type || "").toLowerCase();
    return VCARD_MIMES.includes(type);
};

export const canShare = (data) => {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
        return false;
    }
    try {
        return navigator.canShare(data);
    } catch (err) {
        console.warn("canShare threw", err);
        return false;
    }
};

export const shareVCard = async (blob, filename = "contact.vcf", title = "Contact") => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
        throw new Error("Web Share API non disponible sur ce navigateur");
    }
    const file = new File([blob], filename, { type: blob.type || "text/vcard" });
    const data = { title, files: [file] };
    if (typeof navigator.canShare === "function" && !navigator.canShare(data)) {
        throw new Error("Le navigateur refuse de partager ce type de fichier");
    }
    return navigator.share(data);
};
