/**
 * Fayllardan MATN ajratish (brauzerda).
 *
 * NEGA BRAUZERDA?
 * - Yuklangan fayl serverga umuman yuborilmaydi (savol matni maxfiy).
 * - CDN/import-map muammolari yo'q, Edge Function sovuq ishga tushishi sekin
 *   bo'lmaydi.
 * - Fayl turi va hajmi yuklashdan OLDIN tekshiriladi.
 *
 * QO'LLAB-QUVVATLANADI:
 *   PDF (matnli)   → pdfjs-dist
 *   DOCX           → fflate bilan XML ajratish
 *   PPTX           → fflate bilan slayd XML'lari
 *   XLSX           → fflate bilan sheet XML + sharedStrings
 *   CSV / TXT      → to'g'ridan-to'g'ri
 *   PNG/JPG/WEBP   → OCR (tesseract.js) — ixtiyoriy, sekin
 *
 * QO'LLAB-QUVVATLANMAYDI (aniq xabar beriladi):
 *   .doc / .xls — eski binar formatlar
 *   Skanerlangan PDF — rasmlardan iborat, OCR ixtiyoriy rejimda
 */

export type SupportedKind =
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "csv"
  | "txt"
  | "image"
  | "doc"
  | "xls";

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_OCR_BYTES = 6 * 1024 * 1024; // OCR sekin — kichikroq limit
/** ZIP ochilganda ruxsat etilgan umumiy matn hajmi (ZIP-bomb himoyasi) */
export const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024; // 120 MB

const EXT_MAP: Record<string, SupportedKind> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  csv: "csv",
  txt: "txt",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  doc: "doc",
  xls: "xls",
};

const MIME_MAP: Record<string, SupportedKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "txt",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
};

export interface FileTextResult {
  kind: SupportedKind;
  fileName: string;
  text: string;
  /** Fayl ichida topilgan rasmlar/grafikalar (skanerlangan PDF) */
  scanned?: boolean;
  pages?: number;
}

export class FileReadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function detectKind(file: File): SupportedKind | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? MIME_MAP[file.type] ?? null;
}

export function kindLabel(k: SupportedKind): string {
  return (
    {
      pdf: "PDF",
      docx: "Word (DOCX)",
      pptx: "PowerPoint (PPTX)",
      xlsx: "Excel (XLSX)",
      csv: "CSV",
      txt: "Matn (TXT)",
      image: "Rasm (OCR)",
      doc: "Word (DOC — eski format)",
      xls: "Excel (XLS — eski format)",
    } as Record<SupportedKind, string>
  )[k];
}

/* -------------------------------------------------------------------------- */
/* 1. Validatsiya                                                             */
/* -------------------------------------------------------------------------- */

export function validateFile(file: File, allowOcr: boolean): SupportedKind {
  const kind = detectKind(file);
  if (!kind) {
    throw new FileReadError(
      "unsupported_type",
      `«${file.name}» formati qo‘llab-quvvatlanmaydi. ` +
        `Ruxsat etilgan: PDF, DOCX, PPTX, XLSX, CSV, TXT, PNG, JPG, WEBP.`,
    );
  }
  if (kind === "doc" || kind === "xls") {
    throw new FileReadError(
      "legacy_format",
      `«${kindLabel(kind)}» — eski binar formatda, matnni ajratib bo‘lmaydi. ` +
        `Faylni ${kind === "doc" ? "DOCX" : "XLSX"} sifatida qayta saqlang va yuklang.`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileReadError(
      "too_large",
      `Fayl juda katta (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit: 15 MB.`,
    );
  }
  if (kind === "image" && !allowOcr) {
    throw new FileReadError(
      "ocr_disabled",
      "Rasmdan matn ajratish (OCR) rejimi o‘chirilgan. Uni yoqing va qayta urinib ko‘ring.",
    );
  }
  if (kind === "image" && file.size > MAX_OCR_BYTES) {
    throw new FileReadError(
      "too_large",
      `OCR uchun rasm juda katta (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit: 6 MB.`,
    );
  }
  return kind;
}

/* -------------------------------------------------------------------------- */
/* 2. XML / ZIP yordamchilari                                                 */
/* -------------------------------------------------------------------------- */

async function unzip(file: File): Promise<Record<string, Uint8Array>> {
  const { unzipSync } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  // ZIP "bomb" dan himoya: juda ko'p yozuv / juda katta ochilish
  let total = 0;
  for (const k in files) {
    total += files[k].length;
    if (total > MAX_UNZIPPED_BYTES) {
      throw new FileReadError(
        "too_large",
        "Fayl ichki hajmi juda katta — xavfsizlik uchun import to‘xtatildi.",
      );
    }
  }
  return files;
}

const dec = new TextDecoder("utf-8");

function xmlText(xml: string): string {
  return xml
    .replace(/<\/(w:p|a:p|p)>/gi, "\n")
    .replace(/<w:tab[^>]*\/>/gi, "\t")
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<a:br[^>]*\/>/gi, "\n")
    .replace(/<\/a:tr>/gi, "\n")
    .replace(/<\/w:tc>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* 3. Format bo'yicha ajratish                                                */
/* -------------------------------------------------------------------------- */

async function readDocx(file: File): Promise<string> {
  const files = await unzip(file);
  const doc = files["word/document.xml"];
  if (!doc) {
    throw new FileReadError(
      "corrupt",
      "DOCX fayl ichida hujjat matni topilmadi (fayl buzuq bo‘lishi mumkin).",
    );
  }
  return xmlText(dec.decode(doc));
}

async function readPptx(file: File): Promise<string> {
  const files = await unzip(file);
  const slides = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });
  if (!slides.length) {
    throw new FileReadError("corrupt", "PPTX fayl ichida slaydlar topilmadi.");
  }
  const parts: string[] = [];
  for (const s of slides) {
    const t = xmlText(dec.decode(files[s]));
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}

/** XLSX: sharedStrings + barcha varaqlardagi satrlar */
async function readXlsx(file: File): Promise<string> {
  const files = await unzip(file);

  // sharedStrings — asosiy matn manbai
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    const xml = dec.decode(ss);
    const items = xml.split(/<si>/).slice(1);
    for (const item of items) {
      // <r> bo'laklari bir nechta <t> bo'lishi mumkin
      const texts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(
        (m) => m[1],
      );
      shared.push(xmlDecode(texts.join("")));
    }
  }

  const sheets = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  if (!sheets.length) {
    throw new FileReadError("corrupt", "XLSX fayl ichida varaqlar topilmadi.");
  }

  const rowsOut: string[] = [];
  for (const sheet of sheets) {
    const xml = dec.decode(files[sheet]);
    const rows = xml.split(/<row[\s>]/).slice(1);
    for (const row of rows) {
      const cells: string[] = [];
      // <c r="A1" t="s"><v>12</v></c>  |  <c r="B1" t="inlineStr"><is><t>..</t></is></c>
      for (const cell of row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1];
        const body = cell[2];
        const isShared = /\bt="s"/.test(attrs);
        const v = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
        if (isShared && v != null) {
          cells.push(shared[Number(v)] ?? "");
        } else if (body.includes("<is>")) {
          cells.push(
            xmlDecode(
              [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
                .map((m) => m[1])
                .join(""),
            ),
          );
        } else {
          cells.push(v != null ? xmlDecode(v) : "");
        }
      }
      const line = cells.join("\t").replace(/\t+$/g, "");
      if (line.trim()) rowsOut.push(line);
    }
    rowsOut.push("");
  }
  return rowsOut.join("\n").trim();
}

function xmlDecode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function readPdf(
  file: File,
): Promise<{ text: string; pages: number; scanned: boolean }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(line);
    page.cleanup();
  }
  const text = parts.join("\n\n").trim();
  // Matn deyarli yo'q → skanerlangan PDF
  const scanned = text.replace(/\s/g, "").length < doc.numPages * 20;
  return { text, pages: doc.numPages, scanned };
}

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // Windows-1251/1254 bo'lishi mumkin — noto'g'ri belgilar ko'p bo'lsa qayta o'qiymiz
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > utf8.length * 0.01) {
    try {
      return new TextDecoder("windows-1251").decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

async function readImageOcr(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["uzb", "rus", "eng"]);
  try {
    const { data } = await worker.recognize(await file.arrayBuffer());
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Asosiy kirish nuqtasi                                                   */
/* -------------------------------------------------------------------------- */

export async function extractText(
  file: File,
  opts: { allowOcr: boolean },
): Promise<FileTextResult> {
  const kind = validateFile(file, opts.allowOcr);
  const base = { kind, fileName: file.name };

  switch (kind) {
    case "docx":
      return { ...base, text: await readDocx(file) };
    case "pptx":
      return { ...base, text: await readPptx(file) };
    case "xlsx":
      return { ...base, text: await readXlsx(file) };
    case "pdf": {
      const r = await readPdf(file);
      return { ...base, text: r.text, pages: r.pages, scanned: r.scanned };
    }
    case "csv":
    case "txt":
      return { ...base, text: await readText(file) };
    case "image":
      return { ...base, text: await readImageOcr(file) };
    default:
      throw new FileReadError("unsupported_type", "Fayl turi aniqlanmadi.");
  }
}
