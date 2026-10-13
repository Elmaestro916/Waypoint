import AuthForm from "@/components/AuthForm";

export default function Page({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <AuthForm mode="login" initialError={searchParams.error?.slice(0, 200)} />
    </main>
  );
}
