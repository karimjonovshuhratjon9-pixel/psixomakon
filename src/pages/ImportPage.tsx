import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "../components/ui";
import { ImportPanel } from "../components/ImportPanel";

export function ImportPage() {
  const nav = useNavigate();

  return (
    <div>
      <button
        onClick={() => nav("/app/tests/new")}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink/50 hover:text-forest-800"
      >
        <ArrowLeft size={15} /> Qo‘lda yaratishga qaytish
      </button>

      <PageHeader
        eyebrow="Fayldan import"
        title="Testni fayldan yaratish"
        subtitle="Hujjatni yuklang — savollar, variantlar va to‘g‘ri javoblar avtomatik ajratiladi. Keyingi sahifada ularni tekshirib, tahrirlab, tasdiqlaysiz."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <ImportPanel
            onParsed={(draft, meta) =>
              nav("/app/tests/import/review", {
                state: {
                  draft,
                  fileName: meta.fileName,
                  fileSize: meta.size,
                },
              })
            }
          />
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-[13.5px] font-semibold text-forest-950">
              Qanday ishlaydi?
            </h3>
            <ol className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink/55">
              {[
                "Fayl brauzeringizda o‘qiladi — serverga yuborilmaydi.",
                "Matn ajratiladi: PDF, Word, Excel, PowerPoint, CSV, TXT yoki rasmlardan (OCR).",
                "Savollar, variantlar va to‘g‘ri javoblar taxminiy aniqlanadi.",
                "Keyingi sahifada har bir savolni ko‘rib chiqib tahrirlaysiz.",
                "Tasdiqlagandan keyingina test bazaga saqlanadi.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-forest-800 text-[10px] font-bold text-white dark:text-forest-50">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h3 className="text-[13.5px] font-semibold text-forest-950">
              Cheklovlar
            </h3>
            <ul className="mt-2.5 space-y-2 text-[12px] leading-relaxed text-ink/55">
              <li>• Maksimal fayl hajmi — 15 MB (OCR uchun 6 MB).</li>
              <li>• `.doc` / `.xls` eski formatlari qo‘llab-quvvatlanmaydi.</li>
              <li>
                • Skanerlangan PDF uchun OCR yoqilishi kerak yoki uni rasm
                sifatida yuklang.
              </li>
              <li>
                • Binar/`.exe` va boshqa bajariladigan fayllar qabul qilinmaydi.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
