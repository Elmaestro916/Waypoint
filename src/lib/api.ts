import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";

/** Wraps a route handler so thrown HttpError/ZodError/Error become clean JSON responses. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response | object>) {
  return async (...a: A): Promise<Response> => {
    try {
      const r = await fn(...a);
      return r instanceof Response ? r : NextResponse.json(r);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: (e as Error).message || "Server error" }, { status: 500 });
    }
  };
}
