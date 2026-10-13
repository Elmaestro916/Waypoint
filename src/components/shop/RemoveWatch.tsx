"use client";
import { useRouter } from "next/navigation";

export default function RemoveWatch({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button onClick={async () => { await fetch(`/api/shop/watch?id=${id}`, { method: "DELETE" }); router.refresh(); }} className="text-sm font-medium text-road-blue underline">
      Stop watching
    </button>
  );
}
