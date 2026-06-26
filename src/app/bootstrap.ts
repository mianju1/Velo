import { createPinia } from "pinia";
import type { App } from "vue";
import { router } from "./router";

export function registerAppPlugins(app: App) {
  app.use(createPinia());
  app.use(router);
}
