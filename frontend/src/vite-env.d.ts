/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AUTH_REDIRECT_DEV: string
  readonly VITE_AUTH_REDIRECT_DESKTOP: string
  readonly VITE_AUTH_DISABLED_FOR_DEV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
