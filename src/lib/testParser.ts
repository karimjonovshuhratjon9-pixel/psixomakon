/**
 * Matndan test savollarini ajratish.
 *
 * Bu MODUL HUJUM NISHONI EMAS — kirish faqat foydalanuvchi o'zi yuklagan
 * fayl. Shunga qaramay har bir ajratish natijasi "taxminiy" deb belgilanadi
 * va foydalanuvchi ko'rib chiqib tahrirlagunga qadar bazaga yozilmaydi.
 *
 * QO'LLAB-QUVVATLANADIGAN SHAKLLAR (o'zbek / rus / ingliz):
 *
 *   1-savol. Savol matni?          savol: ...
 *   1) Savol matni                 ? Savol matni
 *   A) variant / А) variant / a. variant / 1) variant
 *   + variant  (* variant, ✓ variant)   → to'g'ri javob
 *   To'g'ri javob: B / Javob: B / Ответ: B
 *   [ball: 2]  (2 ball)
 *
 * Eski oddiy "1. savol" + "1) 2) 3)" ro'yxati ham ishlanadi.
 */
import type {
  DraftOption,
  DraftQuestion,
  ImportDraft,
  TestKind,
} from "../types";

export interface ParseOptions {
  fileName: string;
  fallbackTitle?: string;
  source: ImportDraft["source"];
}

const CYR2LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Kirill → lotin (faqat javob harflarini aniqlash uchun) */
function translit(s: string) {
  return s
    .toLowerCase()
    .split("")
    .map((c) => (CYR2LAT[c] !== undefined ? CYR2LAT[c] : c))
    .join("");
}

/* -------------------------------------------------------------------------- */
/* Matnni normallashtirish                                                    */
/* -------------------------------------------------------------------------- */

function normalize(raw: string): string[] {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      // PDF'da so'zlar orasida ortiqcha bo'shliq bo'ladi
      .replace(/[ \t]{2,}/g, " ")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/g, ""))
      // 3 va undan ortiq bo'sh satrni bittaga
      .reduce<string[]>((acc, l) => {
        if (!l.trim() && acc.length && !acc[acc.length - 1].trim()) return acc;
        acc.push(l);
        return acc;
      }, [])
      .join("\n")
      .split("\n")
  );
}

/* -------------------------------------------------------------------------- */
/* Naqshlar                                                                   */
/* -------------------------------------------------------------------------- */

/** Savol boshi: "1.", "1)", "1-", "Savol 1:", "1-savol", "?" */
const RE_Q_START =
  /^\s*(?:(\d{1,3})\s*[.)\-–—:]|(\d{1,3})[-\s]?savol[.:)]?|savol\s*(\d{1,3})[.:)]?|вопрос\s*(\d{1,3})[.:)]?|q(?:uestion)?\s*(\d{1,3})[.:)]?|\?)\s*/i;

/** Variant: "A) ", "А) ", "a. ", "A - ", "1) " (faqat savol ichida) */
const RE_OPT = /^\s*([A-Ha-hА-Н])\s*[).:]\s*(.+)$|^\s*([1-9])\s*[).:]\s*(.+)$/;

/** To'g'ri javob belgilari */
const RE_CORRECT_PREFIX = /^\s*[*+✓✔✔️]\s*/;
const RE_CORRECT_SUFFIX =
  /\s*(?:\(\s*(?:to[‘'’]g[‘'’]ri|правильн\w*|correct)\s*\)|<\s*-\s*|\s*<<)\s*$/i;

/** Savol ostidagi "To'g'ri javob: B" satri */
const RE_ANSWER_LINE =
  /^\s*(?:to[‘'’]?g[‘'’]?ri\s*javob|javob|прав\w*|ответ|answer|ans)\s*[:\-–]\s*([A-Ha-hА-Н0-9,;\s]+)$/i;

/** Ball */
const RE_POINTS =
  /\[\s*(\d+)\s*(?:ball|балл|point)?\s*\]|\(\s*(\d+)\s*(?:ball|балл|point)\s*\)/i;

const RE_TITLE_LINE =
  /^\s*(?:test\s*(?:nomi|nomlanishi)|название(?:\s*теста)?|test\s*name|title)\s*[:\-–]\s*(.+)$/i;

/** "1-A, 2-B" — umumiy javob kaliti */
const RE_KEY_LINE =
  /^\s*(?:javoblar\s*kaliti|javoblar|kalit|ключи|ответы|answer\s*key|keys?)\s*[:\-–]?\s*(.+)$/i;

/* -------------------------------------------------------------------------- */
/* Asosiy parser                                                              */
/* -------------------------------------------------------------------------- */

interface RawQuestion {
  num: number;
  stem: string[];
  optLines: string[];
  answerLetters: string[];
  points: number | null;
}

function parseAnswerLetters(s: string): string[] {
  return s
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const t = translit(x);
      return t.charAt(0).toUpperCase();
    })
    .filter((c) => /^[A-H0-9]$/.test(c));
}

export function parseText(rawText: string, opts: ParseOptions): ImportDraft {
  const lines = normalize(rawText);
  const warnings: string[] = [];

  let title = "";
  let description = "";
  const qs: RawQuestion[] = [];
  const keyMap = new Map<number, string[]>();

  let current: RawQuestion | null = null;
  // Savol boshlanishidan oldingi satrlar — nom / tavsif uchun
  const preamble: string[] = [];

  const pushCurrent = () => {
    if (current) qs.push(current);
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.stem.push("");
      continue;
    }

    // 1) Test nomi: "Test nomi: ..."
    const tm = trimmed.match(RE_TITLE_LINE);
    if (tm && !qs.length) {
      title = tm[1].trim();
      continue;
    }

    // 2) Javoblar kaliti (oxirida yoki boshida)
    const km = trimmed.match(RE_KEY_LINE);
    if (km) {
      const pairs = [...km[1].matchAll(/(\d{1,3})\s*[-–:=.]\s*([A-Ha-hА-Н])/g)];
      for (const p of pairs) {
        keyMap.set(Number(p[1]), parseAnswerLetters(p[2]));
      }
      if (pairs.length) continue;
    }

    // 3) Savol boshi
    const qm = trimmed.match(RE_Q_START);
    if (qm) {
      const num = Number(
        qm[1] ?? qm[2] ?? qm[3] ?? qm[4] ?? qm[5] ?? qs.length + 1,
      );
      const rest = trimmed.replace(RE_Q_START, "").trim();
      // "1) variant" — savol emas, variant (faqat hali savol ochilmagan bo'lsa
      // bu savol; ochilgan bo'lsa va variant kutilayotgan bo'lsa — variant)
      if (
        current &&
        !rest.match(/[?]/) &&
        (current.optLines.length > 0 || isOptionsOnly(rest))
      ) {
        // ehtimol variant — pastda RE_OPT ishlaydi, lekin "1)" ni qayta ko'rib chiqamiz
      }
      pushCurrent();
      current = {
        num,
        stem: rest ? [rest] : [],
        optLines: [],
        answerLetters: [],
        points: null,
      };
      continue;
    }

    if (!current) {
      preamble.push(trimmed);
      continue;
    }

    // 4) "To'g'ri javob: B"
    const am = trimmed.match(RE_ANSWER_LINE);
    if (am) {
      current.answerLetters.push(...parseAnswerLetters(am[1]));
      continue;
    }

    // 5) Variant
    const om = trimmed.match(RE_OPT);
    if (om && (om[1] || om[3])) {
      const bodyRaw = (om[2] ?? om[4] ?? "").trim();
      if (bodyRaw) {
        // savol matnining davomi emas, variant sifatida qabul qilamiz
        current.optLines.push(trimmed);
        continue;
      }
    }

    // 6) Ball
    const pm = trimmed.match(RE_POINTS);
    if (pm) {
      current.points = Number(pm[1] ?? pm[2]);
      const cleaned = trimmed.replace(RE_POINTS, "").trim();
      if (!cleaned) continue;
    }

    // 7) Savol matnining davomi
    if (current.optLines.length === 0 && current.stem.length < 4) {
      current.stem.push(trimmed);
    } else if (current.optLines.length > 0) {
      // avvalgi variantning davomi (uzun variant matni 2 satrga bo'linishi mumkin)
      const last = current.optLines.length - 1;
      current.optLines[last] = `${current.optLines[last]} ${trimmed}`;
    } else {
      current.stem.push(trimmed);
    }
  }
  pushCurrent();

  // Preamble: birinchi qator — nom, qolgani — tavsif
  if (!title) {
    const first = preamble.find((p) => p.length > 3 && p.length < 140);
    title = first ?? "";
    description = preamble
      .filter((p) => p !== first)
      .join(" ")
      .trim();
  } else {
    description = preamble.join(" ").trim();
  }

  // Agarda savol umuman topilmasa — oddiy matn sifatida bo'laklarga ajratamiz
  if (qs.length === 0) {
    warnings.push(
      "Savollar tuzilgan shaklda topilmadi. Matn bo‘laklarga bo‘lindi — ularni qo‘lda tuzating.",
    );
    const chunks = splitFallback(
      rawText,
      title.length > 0 ? preamble.length : 0,
    );
    for (const [i, c] of chunks.entries()) {
      qs.push({
        num: i + 1,
        stem: [c],
        optLines: [],
        answerLetters: [],
        points: null,
      });
    }
  }

  // RawQuestion → DraftQuestion
  const questions: DraftQuestion[] = [];
  let withOptions = 0;

  for (const rq of qs) {
    const stem = dedupeStem(rq.stem);
    if (!stem && rq.optLines.length === 0) continue;

    const answersFromKey = keyMap.get(rq.num) ?? [];
    const correctLetters = new Set([...rq.answerLetters, ...answersFromKey]);

    const options = buildOptions(rq.optLines, correctLetters);
    if (options.length >= 2) withOptions++;

    questions.push({
      text: stem || `Savol ${questions.length + 1}`,
      options,
      // ikki variantdan kam bo'lsa yoki to'g'ri javob yo'q bo'lsa — tekshirish kerak
      needs_review:
        options.length < 2 ||
        (options.length > 0 && !options.some((o) => o.correct)),
    });
  }

  /* ------- sifat bahosi ------- */
  const total = Math.max(questions.length, 1);
  const good = questions.filter((q) => q.options.length >= 2).length;
  const withCorrect = questions.filter((q) =>
    q.options.some((o) => o.correct),
  ).length;

  if (questions.length === 0) {
    warnings.push("Fayldan hech qanday savol ajratib bo‘lmadi.");
  }
  if (withOptions < total) {
    warnings.push(
      `${total - withOptions} ta savolda variantlar topilmadi. Ularni qo‘lda qo‘shing.`,
    );
  }
  if (withCorrect === 0 && withOptions > 0) {
    warnings.push(
      "To‘g‘ri javoblar belgilanmagan. Har bir savolda to‘g‘ri variantni belgilang.",
    );
  }

  const kind: TestKind = "standard";
  const confidence = Math.round(
    Math.min(100, (good / total) * 70 + (withCorrect / total) * 30),
  );

  return {
    title: (title || opts.fallbackTitle || fileTitle(opts.fileName)).slice(
      0,
      200,
    ),
    description: description.slice(0, 800),
    category: "Umumiy",
    kind,
    questions,
    warnings,
    source: opts.source,
    confidence,
  };
}

/* -------------------------------------------------------------------------- */
/* Yordamchilar                                                               */
/* -------------------------------------------------------------------------- */

function fileTitle(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function isOptionsOnly(rest: string) {
  return /^[^?]{1,120}$/.test(rest) && rest.split(" ").length <= 12;
}

function dedupeStem(parts: string[]) {
  // Bir xil satr takrorlanmasin (PDF extraction ba'zan takrorlaydi)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function buildOptions(
  lines: string[],
  correctLetters: Set<string>,
): DraftOption[] {
  const out: DraftOption[] = [];
  let idx = 0;

  for (const raw of lines) {
    const line = raw.trim();
    let body = line;
    let literalCorrect = false;
    let letter: string | null = null;

    // boshidagi harf/raqam
    const m = line.match(RE_OPT);
    if (m) {
      letter = (m[1] ?? m[3] ?? "").toUpperCase();
      body = (m[2] ?? m[4] ?? "").trim();
    }

    if (RE_CORRECT_PREFIX.test(body)) {
      literalCorrect = true;
      body = body.replace(RE_CORRECT_PREFIX, "").trim();
    }
    if (RE_CORRECT_SUFFIX.test(body)) {
      literalCorrect = true;
      body = body.replace(RE_CORRECT_SUFFIX, "").trim();
    }

    if (!body) continue;

    const letterKey = letter
      ? translit(letter).toUpperCase()
      : String.fromCharCode(65 + idx);

    const correct =
      literalCorrect ||
      correctLetters.has(letterKey) ||
      correctLetters.has(letter ?? "");

    out.push({ text: body.replace(/\s+/g, " ").slice(0, 500), correct });
    idx++;
  }

  // Agar kalit bo'yicha faqat bitta javob belgilangan bo'lsa — tamom.
  // Bir nechta belgilangan bo'lsa, standart testda faqat birinchisini qoldiramiz.
  const correctCount = out.filter((o) => o.correct).length;
  if (correctCount > 1) {
    let kept = false;
    for (const o of out) {
      if (!o.correct) continue;
      if (kept) o.correct = false;
      else kept = true;
    }
  }

  return out;
}

/** Savollar ajratilmaganda: matnni abzatslar bo'yicha bo'laklar */
function splitFallback(text: string, skipLines: number): string[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const body = lines.slice(skipLines);
  const chunks: string[] = [];
  let buf: string[] = [];

  for (const l of body) {
    const t = l.trim();
    if (!t) continue;
    if (t.length < 90 && /[?.]$/.test(t) && buf.length) {
      chunks.push(buf.join(" "));
      buf = [t];
    } else {
      buf.push(t);
    }
    if (buf.join(" ").length > 400) {
      chunks.push(buf.join(" "));
      buf = [];
    }
  }
  if (buf.length) chunks.push(buf.join(" "));
  return chunks.slice(0, 120);
}
