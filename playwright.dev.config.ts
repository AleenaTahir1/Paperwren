import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Local browser checks against Vite dev: does not run a production build. */
export default defineConfig({
    ...base,
    use: {...base.use,baseURL:"http://127.0.0.1:1420"},
    webServer:{command:"npm run dev -- --host 127.0.0.1",url:"http://127.0.0.1:1420",reuseExistingServer:true,timeout:60000},
});
