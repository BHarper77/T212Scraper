import dotenv from "dotenv"
import { join } from "path"
import { handler } from "./lambda";

(async () => {
	dotenv.config({ path: join(__dirname, "..", "config.env") })

	if (process.env.NODE_ENV === "local") {
		await handler()
	}
})();