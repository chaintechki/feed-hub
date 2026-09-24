declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string;
  readonly VITE_SW_HOSTS?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}
