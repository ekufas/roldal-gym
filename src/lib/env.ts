export const env = {
  useMocks: process.env.USE_MOCKS !== 'false',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  salto: {
    clientId: process.env.SALTO_CLIENT_ID ?? '',
    clientSecret: process.env.SALTO_CLIENT_SECRET ?? '',
    siteId: process.env.SALTO_SITE_ID ?? '',
    membersGroupId: process.env.SALTO_MEMBERS_ACCESS_GROUP_ID ?? '',
    dropinGroupId: process.env.SALTO_DROPIN_ACCESS_GROUP_ID ?? '',
    gymLockId: process.env.SALTO_GYM_LOCK_ID ?? '',
    apiBase: process.env.SALTO_API_BASE ?? '',
  },
  vipps: {
    clientId: process.env.VIPPS_CLIENT_ID ?? '',
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? '',
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? '',
    msn: process.env.VIPPS_MERCHANT_SERIAL_NUMBER ?? '',
    apiBase: process.env.VIPPS_API_BASE ?? '',
  },
  stripe: {
    secret: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },
  sms: {
    provider: (process.env.SMS_PROVIDER ?? 'mock') as 'mock' | 'linkmobility' | 'sveve',
    apiKey: process.env.SMS_API_KEY ?? '',
    sender: process.env.SMS_SENDER ?? 'RoldalGym',
  },
  geo: {
    lat: Number(process.env.GYM_LAT ?? 59.8295),
    lon: Number(process.env.GYM_LON ?? 6.8228),
    radiusMeters: Number(process.env.GYM_GEOFENCE_METERS ?? 80),
  },
  cronSecret: process.env.CRON_SECRET ?? '',
};
