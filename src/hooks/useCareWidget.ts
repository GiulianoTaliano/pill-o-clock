import { useEffect } from "react";
import { useTodaySchedule } from "./useTodaySchedule";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n";
import { updateCareWidget } from "../services/careWidget";

export function useCareWidget(ready: boolean) {
  const doses = useTodaySchedule();
  const profiles = useAppStore((s) => s.profiles);
  const active = useAppStore((s) => s.activeProfileId);
  const { t, i18n } = useTranslation();
  const person = ready ? profiles.find((p) => p.id === active)?.name || t("ux.me") : "";
  useEffect(() => {
    if (ready) updateCareWidget(doses, person).catch(() => {});
  }, [ready, doses, person, i18n.language]);
}
