import { supabase } from "./supabase";
import type { Attempt, Test } from "../types";

/**
 * Testni boshlash / davom ettirish.
 *
 * BARCHA tekshiruvlar (tayinlash menga tegishlimi, akkaunt faolmi, vaqt
 * limiti) serverdagi `start_attempt()` RPC da bajariladi. Bu muhim:
 *  • xato bo'lsa ANIQ kod va o'zbekcha matn qaytadi ("Xatolik yuz berdi" emas);
 *  • RLS/GRANT bilan bog'liq yashirin to'siqlar bo'lmaydi;
 *  • ikki marta bosilsa dublikat urinish yaratilmaydi.
 */
export interface StartResult {
  ok: boolean;
  code?: string;
  message?: string;
  attempt?: Attempt;
  test?: Test;
}

export async function startAttempt(assignmentId: string): Promise<StartResult> {
  const { data, error } = await supabase.rpc("start_attempt", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    // RPC umuman chaqirilmadi (migratsiya qo'llanmagan yoki ruxsat yo'q)
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        code: "not_installed",
        message:
          "Server funksiyasi (start_attempt) o‘rnatilmagan. " +
          "Administrator supabase/migration_take_test_fix.sql ni ishga tushirishi kerak.",
      };
    }
    return { ok: false, code: "rpc_error", message: error.message };
  }

  return (data ?? { ok: false, message: "Server bo‘sh javob qaytardi" }) as StartResult;
}
