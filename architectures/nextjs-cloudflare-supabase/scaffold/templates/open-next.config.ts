import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The adapter compiles the Next.js server build into a Worker bundle under
// .open-next. Incremental cache and tag revalidation are opt-in and are left
// unconfigured until the application needs them.
export default defineCloudflareConfig();
