import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

createApp(config).listen(config.PORT, () => {
  console.log(
    `api listening on http://localhost:${config.PORT} (${config.GATE_MODE}, ${config.STELLAR_NETWORK})`,
  );
});
