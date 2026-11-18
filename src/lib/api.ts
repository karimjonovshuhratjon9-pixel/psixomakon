import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { FullTest, Option, Question, Test } from "../types";

/** Testni savol va variantlari bilan yuklash */
export async function fetchFullTest(testId: string): Promise<FullTest> {
  const { data: test, error: tErr } = await supabase
    .from("tests")
    .select("*")
    .eq("id", testId)
    .single();
  if (tErr) throw tErr;

  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("*")
    .eq("test_id", testId)
    .order("position");
  if (qErr) throw qErr;

  const qIds = (questions ?? []).map((q) => q.id);
  let options: Option[] = [];
  if (qIds.length) {
    const { data: opts, error: oErr } = await supabase
      .from("options")
      // score / dim_scores ataylab olinmaydi — ular faqat serverda hisoblanadi
      .select("id,question_id,position,text")
      .in("question_id", qIds)
      .order("position");
    if (oErr) throw oErr;
    options = ((opts ?? []) as Partial<Option>[]).map((o) => ({
      id: o.id!,
      question_id: o.question_id!,
      position: o.position ?? 0,
      text: o.text ?? "",
      score: 0,
      dim_scores: {},
    }));
  }

  return {
    test: test as Test,
    questions: (questions ?? []).map((q: Question) => ({
      ...q,
      options: options.filter((o) => o.question_id === q.id),
    })),
  };
}

export function useFullTest(testId: string | undefined) {
  const [data, setData] = useState<FullTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    try {
      setData(await fetchFullTest(testId));
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
