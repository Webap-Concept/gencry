"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

interface MobileMenuButtonProps {
  onClick: () => void;
}

export default function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
  const t = useTranslations("admin.shell");
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
      aria-label={t("openMenuAria")}>
      <Menu size={20} />
    </button>
  );
}
