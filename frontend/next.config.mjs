/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@platform/shared'],
  // Allow Next's dev HMR/asset (/_next/*) requests when the app is opened via a
  // LAN IP instead of localhost (e.g. from a phone on the same Wi-Fi). Add your
  // machine's LAN IP here if it differs. Harmless in production.
  allowedDevOrigins: ['192.168.0.201', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'],
  // NOTE: do NOT inject a NEXT_PUBLIC_API_URL fallback here. Baking in
  // 'http://localhost:4000' forces every browser (even one opened at
  // 127.0.0.1 or a LAN IP) to call localhost, which makes the SameSite=Lax
  // refresh cookie cross-site and bounces users to /login on reload. When the
  // var is unset, the client derives the API base from the page's own host
  // (see getApiBase in lib/api.ts). Set NEXT_PUBLIC_API_URL only to point at a
  // remote API (e.g. production).
};
export default nextConfig;
