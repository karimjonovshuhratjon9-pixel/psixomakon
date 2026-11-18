export type Role = "admin" | "psychologist" | "student";
export type TestKind = "standard" | "psych";
export type TestScope = "library" | "personal";
export type AttemptStatus = "in_progress" | "submitted";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  login: string | null;
  email: string | null;
  phone: string | null;
  is_blocked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Dimension {
  key: string;
  label: string;
  description?: string;
}

export type Scoring =
  | { type: "correct" }
  | { type: "dimensions"; dimensions: Dimension[] };

export interface Test {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: TestKind;
  scope: TestScope;
  min_age: number | null;
  max_age: number | null;
  time_limit_sec: number | null;
  scoring: Scoring;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  test_id: string;
  position: number;
  text: string;
}

export interface Option {
  id: string;
  question_id: string;
  position: number;
  text: string;
  score: number;
  dim_scores: Record<string, number>;
}

export interface Assignment {
  id: string;
  test_id: string;
  student_id: string | null;
  group_id: string | null;
  assigned_by: string;
  due_at: string | null;
  allow_retake: boolean;
  created_at: string;
}

export interface Attempt {
  id: string;
  assignment_id: string;
  test_id: string;
  student_id: string;
  status: AttemptStatus;
  round: number;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  auto_submitted: boolean;
  total_score: number | null;
  max_score: number | null;
  percent: number | null;
  dimension_result: Record<string, number> | null;
  updated_at: string;
}

export interface Answer {
  attempt_id: string;
  question_id: string;
  option_id: string | null;
  updated_at: string;
}

/** Test + savollar + variantlar */
export interface FullTest {
  test: Test;
  questions: (Question & { options: Option[] })[];
}

export const CATEGORIES = [
  "Temperament",
  "Xarakter",
  "Stress",
  "Emotsional holat",
  "O'z-o'zini baholash",
  "Bilim testi",
  "Umumiy",
];

/* ---------------------------------------------------------------------------
 * IMPORT (fayldan test yaratish)
 * Brauzerda ajratilgan matn serverdagi `admin-create-user` → `import-test`
 * Edge Function ga yuboriladi, savollar serverda ajratiladi, keyin
 * foydalanuvchi ko'rib chiqib tasdiqlaydi.
 * ------------------------------------------------------------------------- */

export type ImportSource =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "csv"
  | "txt"
  | "doc" // eski binar Word — matn ajratib bo'lmaydi
  | "xls"; // eski binar Excel — matn ajratib bo'lmaydi

export interface DraftOption {
  text: string;
  correct: boolean;
}

export interface DraftQuestion {
  text: string;
  options: DraftOption[];
  /** survey/taxminiy ajratishda to'g'ri javob bo'lmasligi mumkin */
  needs_review: boolean;
}

export interface ImportDraft {
  title: string;
  description: string;
  category: string;
  kind: TestKind;
  questions: DraftQuestion[];
  warnings: string[];
  source: ImportSource;
  /** 0..100 — ajratish sifati (taxminiy) */
  confidence: number;
}

export interface ImportResult {
  ok: boolean;
  draft?: ImportDraft;
  text_preview?: string;
  chars?: number;
  error?: { code: string; message: string };
}
