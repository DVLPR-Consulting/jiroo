import { requireEnrollmentPageSession } from "@/lib/auth/session";

export default async function EnrollmentLayout({ children }: { children: React.ReactNode }) {
  await requireEnrollmentPageSession();
  return children;
}
