import { createApp } from "vue";
import App from "./App.vue";
import { registerAppPlugins } from "./app/bootstrap";

const app = createApp(App);
registerAppPlugins(app);
app.mount("#app");
