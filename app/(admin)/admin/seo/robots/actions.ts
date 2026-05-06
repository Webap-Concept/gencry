"use server";

import { updateAppSetting } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type RobotsActionState =
  | Record<string, never>
  | { timestamp: number; success: string }
  | { timestamp: number; error: string };

const schema = z.object({
  robots_txt: z.string().max(10000),
  humans_txt: z.string().max(10000),
});

export async function saveRobotsAction(
  _: RobotsActionState,
  formData: FormData,
): Promise<RobotsActionState> {
  const raw = {
    robots_txt: formData.get("robots_txt") ?? "",
    humans_txt: formData.get("humans_txt") ?? "",
  };

  const t = await getTranslations("admin.seo.robots");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      timestamp: Date.now(),
      error: parsed.error.issues[0]?.message ?? t("errorInvalidData"),
    };
  }

  try {
    await Promise.all([
      updateAppSetting("robots_txt" as never, parsed.data.robots_txt || null),
      updateAppSetting("humans_txt" as never, parsed.data.humans_txt || null),
    ]);
    revalidatePath("/robots.txt");
    revalidatePath("/humans.txt");
    revalidatePath("/admin/seo/robots");
  } catch (err) {
    console.error("[saveRobotsAction] error:", err);
    return { timestamp: Date.now(), error: t("errorSaveFailed") };
  }

  return { timestamp: Date.now(), success: t("feedbackSaved") };
}
