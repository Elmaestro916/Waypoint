import { notFound, redirect } from "next/navigation";
import { admin, unwrapMaybe } from "@/lib/db";

export const dynamic = "force-dynamic";

// Brand and category pages open the search with that brand/category preselected.
export default async function Page({ params }: { params: { slug: string } }) {
  const row = unwrapMaybe<{ brand: string }>(
    await admin().from("CatalogProduct").select("brand").eq("brandSlug", params.slug).limit(1).maybeSingle()
  );
  if (!row) notFound();
  redirect(`/search?q=${encodeURIComponent(row.brand)}&brand=${encodeURIComponent(params.slug)}`);
}
