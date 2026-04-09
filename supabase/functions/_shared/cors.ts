// CORS headers for Supabase Edge Functions
// Uses dynamic origin checking for security
export function getCorsHeaders(req?: Request): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  // In production, add your domain:
  // 'https://app.clickhero.com.br',

  const origin = req?.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : 'null';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
