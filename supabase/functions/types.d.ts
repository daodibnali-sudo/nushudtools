declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  env: {
    get: (name: string) => string | undefined;
  };
};

declare module "https://esm.sh/@supabase/supabase-js@2.45.4" {
  export function createClient(url: string, key: string, options?: unknown): {
    rpc: (functionName: string, args?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}
