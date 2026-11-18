import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { ErrorBox, InfoBox, cn } from "./ui";
import { FileReadError, extractText, validateFile } from "../lib/fileReader";
import { parseText } from "../lib/testParser";
import { uzError } from "../lib/errors";
import type { ImportDraft } from "../types";

const ACCEPT = ".pdf,.docx,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp";

const SUPPORTED = [
  { ext: "PDF", icon: <FileText size={14} />, note: "matnli hujjatlar" },
  { ext: "DOCX", icon: <FileText size={14} />, note: "Word" },
  { ext: "XLSX", icon: <FileSpreadsheet size={14} />, note: "Excel jadval" },
  { ext: "PPTX", icon: <FileSpreadsheet size={14} />, note: "PowerPoint" },
  { ext: "CSV", icon: <FileSpreadsheet size={14} />, note: "jadval" },
  { ext: "TXT", icon: <FileText size={14} />, note: "oddiy matn" },
  { ext: "PNG/JPG", icon: <ImageIcon size={14} />, note: "OCR" },
];

/**
 * Fayl yuklash paneli.
 * Fayl SERVERGA YUBORILMAYDI — matn brauzerda ajratiladi.
 * Natija darhol bazaga yozilmaydi: avval `ImportReviewPage` da tekshiriladi.
 */
export function ImportPanel({
  onParsed,
}: {
  onParsed: (
    draft: ImportDraft,
    meta: { fileName: string; size: number },
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocr, setOcr] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    setPhase("Fayl tekshirilmoqda...");
    try {
      // 1. Tur/hajm validatsiyasi (xato bo'lsa darhol to'xtaydi)
      const kind = validateFile(file, ocr);

      // 2. Matn ajratish
      setPhase(
        kind === "image"
          ? "Rasmdagi matn o‘qilmoqda (OCR) — bu bir necha daqiqa olishi mumkin..."
          : "Fayldan matn ajratilmoqda...",
      );
      const res = await extractText(file, { allowOcr: ocr });

      if (!res.text || res.text.replace(/\s/g, "").length < 20) {
        throw new FileReadError(
          res.scanned ? "scanned_pdf" : "no_text",
          res.scanned
            ? "PDF ichida matn qatlami topilmadi (skanerlangan). " +
                "Uni rasm sifatida yuklang (OCR) yoki matnli PDF ni tanlang."
            : "Fayldan matn ajratib bo‘lmadi. Hujjat bo‘sh yoki faqat rasmlardan iborat bo‘lishi mumkin.",
        );
      }

      // 3. Savollarni ajratish
      setPhase("Savollar ajratilmoqda...");
      const draft = parseText(res.text, {
        fileName: file.name,
        source:
          res.kind === "image" ? "txt" : res.kind === "doc" ? "txt" : res.kind,
      });

      if (draft.questions.length === 0) {
        throw new FileReadError(
          "no_questions",
          "Faylda savollar topilmadi. Har bir savol raqam bilan boshlanishi va " +
            "variantlari A) B) C) ko‘rinishida bo‘lishi kerak.",
        );
      }

      onParsed(draft, { fileName: file.name, size: file.size });
    } catch (e) {
      if (e instanceof FileReadError) setError(e.message);
      else setError(uzError(e));
    } finally {
      setBusy(false);
      setPhase("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) handleFile(f);
        }}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition",
          dragging
            ? "border-forest-500 bg-forest-50 dark:bg-forest-800/20"
            : "border-ink/15 bg-surface2/50 hover:border-forest-400 hover:bg-forest-50/40 dark:hover:bg-forest-800/10",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-forest-800 text-white dark:text-forest-50">
          {busy ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <Upload size={22} />
          )}
        </div>

        <p className="font-semibold text-forest-950">
          {busy ? phase || "Ishlanmoqda..." : "Faylni bu yerga tashlang"}
        </p>
        {!busy && (
          <>
            <p className="mt-1 text-[12.5px] text-ink/50">
              yoki kompyuterdan tanlang — maksimal 15 MB
            </p>
            <button
              className="btn-secondary mt-4"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <Upload size={15} /> Fayl tanlash
            </button>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SUPPORTED.map((s) => (
          <span
            key={s.ext}
            className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink/55"
            title={s.note}
          >
            {s.icon} {s.ext}
          </span>
        ))}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl bg-surface2/70 px-3.5 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-forest-700"
          checked={ocr}
          onChange={(e) => setOcr(e.target.checked)}
        />
        <span className="text-[12px] leading-relaxed text-ink/60">
          <b className="text-ink/80">Rasmlardan matn ajratish (OCR)ni yoqish</b>
          <br />
          PNG/JPG/WEBP va skanerlangan hujjatlar uchun. Sekin ishlaydi va
          brauzerda bajariladi; birinchi marta til modeli yuklanadi (~15 MB).
        </span>
      </label>

      {error && <ErrorBox message={error} />}

      {!busy && (
        <InfoBox tone="info">
          <p className="font-semibold">Qanday format kutiladi?</p>
          <pre className="mt-1.5 overflow-x-auto rounded-lg bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink/70 ring-1 ring-ink/5">
            {`1. Savol matni?
A) birinchi variant
B) ikkinchi variant
C) uchinchi variant
To‘g‘ri javob: B

2) Keyingi savol...
A) ...`}
          </pre>
          <p className="mt-1.5 flex items-start gap-1.5">
            <Sparkles size={12} className="mt-0.5 shrink-0" />
            To‘g‘ri javobni <b>+ variant</b>, <b>* variant</b> yoki{" "}
            <b>To‘g‘ri javob: B</b> qatori bilan belgilash mumkin.
          </p>
        </InfoBox>
      )}

      <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-800 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          <b>.doc va .xls</b> (eski binar formatlar) qo‘llab-quvvatlanmaydi —
          faylni DOCX/XLSX sifatida qayta saqlang. Ajratilgan savollar darhol
          saqlanmaydi: avval tekshirib, tahrirlab, keyin tasdiqlaysiz.
        </span>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink/35">
        Fayl serverga yuborilmaydi — matn brauzeringizda ajratiladi
        <ArrowRight size={11} /> natijani tekshirib, keyin saqlaysiz
      </p>
    </div>
  );
}
