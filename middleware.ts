// middleware.ts at project root
//
// Security headers for Vercel edge deploys（GitHub Pages 唔會行呢個 file）。

import { next } from '@vercel/edge';

export const config = {
  // 紅線 #4 fix: 明確包 /data/* /api/* 防止 JSON 被 bypass
  matcher: ['/((?!_static|favicon|robots\\.txt).*)']
};

const SECURITY_HEADERS = {
  // 紅線 #5 cross-cut: 收緊 render-time exfil 通道
  // NOTE: style-src 'unsafe-inline' kept because React JSX `style={{...}}` props
  //       compile to inline style attributes (any tighter breaks SPA UI).
  //       To remove: switch to className-only patterns + Tailwind utility class.
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // L2 fix: add `preload` directive to qualify for HSTS preload list
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

// M1 fix: constant-time string compare to prevent timing-attack on password
// Edge runtime doesn't expose node:crypto timingSafeEqual; implement manually.
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export default function middleware(request: Request) {
  const password = process.env.SITE_PASSWORD;

  // 紅線 #2 fix: env var 漏設 → fail closed，唔係 fail open
  if (!password) {
    return new Response('Server misconfigured: SITE_PASSWORD not set', { status: 500 });
  }

  // 紅線 #4 fix: production + preview 都 enforce; 其他 env 直接拒
  const env = process.env.VERCEL_ENV;
  if (env !== 'production' && env !== 'preview') {
    return new Response('Forbidden', { status: 403 });
  }

  const auth = request.headers.get('authorization');

  if (auth) {
    const encoded = auth.split(' ')[1] ?? '';
    let decoded = '';
    try { decoded = atob(encoded); } catch { /* invalid base64 */ }
    const [, supplied] = decoded.split(':');
    if (supplied && constantTimeEq(supplied, password)) {
      // 紅線 #5 fix: pass-through path 都套 SECURITY_HEADERS
      return next({
        headers: SECURITY_HEADERS,
      });
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Personal OS"',
      'Content-Type': 'text/plain',
      ...SECURITY_HEADERS,
    }
  });
}
