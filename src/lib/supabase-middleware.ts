import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase Auth token on the request/response cookies.
 * Without this, `signInWithPassword` can succeed in the browser while
 * `/api/admin/me` (and every other staff route) still sees no session.
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  try {
    if (new URL(url).protocol !== "https:") {
      return response;
    }

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Do not insert logic between createServerClient and getUser().
    await supabase.auth.getUser();
  } catch {
    // Demo mode / bad env must never 500 the storefront.
    return NextResponse.next({ request });
  }

  return response;
}
