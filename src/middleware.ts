import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the JWT server-side on every request (secure path)
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Already authenticated → skip login page
  if (pathname === '/login') {
    if (user) return NextResponse.redirect(new URL('/', request.url))
    return response
  }

  // Unauthenticated → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  // Exclude static assets and API routes — API routes handle their own auth (service key).
  // Also exclude any path ending in a common static-asset extension so files in /public
  // (e.g. /ptr-mark.png) bypass the auth gate; otherwise the middleware redirects image
  // requests to /login when the user has no session, breaking <img> tags on the login page.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|json|txt|xml)$).*)',],
}
