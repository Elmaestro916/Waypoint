import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE, countryFromHeaders, getCountry, isSupportedCountry } from "./countries";
import { supabaseServer } from "@/lib/supabase/server";
import { withTimeout } from "./security";

export function shopCountry() {
  const c = cookies().get(COUNTRY_COOKIE)?.value;
  return getCountry(isSupportedCountry(c) ? c : countryFromHeaders(headers()));
}

export async function signedInUserId(): Promise<string | null> {
  return withTimeout(
    (async () => {
      const { data } = await supabaseServer().auth.getUser();
      return data.user?.id ?? null;
    })(),
    1500,
    null
  );
}
