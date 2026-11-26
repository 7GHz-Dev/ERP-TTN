import { redirect } from "next/navigation";

/** ที่อยู่เดิม — ย้ายไปอยู่ในหน้าตั้งค่า */
export default function UsersRedirect() {
  redirect("/settings?tab=users");
}
