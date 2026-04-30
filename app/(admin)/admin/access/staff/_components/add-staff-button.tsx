"use client";

import type { RoleRow } from "@/lib/db/roles-queries";
import { UserPlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

const AddStaffModal = dynamic(() => import("./add-staff-modal"), {
  ssr: false,
});

export default function AddStaffButton({
  adminRoles,
}: {
  adminRoles: RoleRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors"
        style={{ background: "var(--admin-accent)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = "brightness(0.88)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "none";
        }}
      >
        <UserPlus size={15} />
        Add Staff Member
      </button>

      {open && (
        <AddStaffModal adminRoles={adminRoles} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
