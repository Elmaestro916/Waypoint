import { redirect } from "next/navigation";
import PasswordForm from "@/components/PasswordForm";
import { supabaseServer } from "@/lib/supabase/server";

/** Reached from the reset email via /auth/confirm, which signs the user in first. */
export default async function Page() {
  const { data } = await supabaseServer().auth.getUser();
  if (!data.user) redirect(`/login?error=${encodeURIComponent("Your reset link has expired. Request a new one.")}`);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <PasswordForm mode="reset" />
    </main>
  );
}
