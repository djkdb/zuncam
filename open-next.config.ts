import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 이 앱은 ISR/캐시를 쓰지 않으므로 기본 설정으로 충분하다.
export default defineCloudflareConfig();
