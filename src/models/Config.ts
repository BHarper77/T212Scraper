import dotenv from "dotenv"
import { join } from "path"

export class Config {
	static sendGridApiKey: string
	static t212Credentials: { 
		username: string
		password: string 
	// initialise with empty strings to avoid undefined references in `init()`
	} = { username: "", password: "" }

	static init() {
		dotenv.config({ path: join(__dirname, "..", "..", "config.env") })

		if (process.env.SENDGRID_API_KEY === undefined) {
			throw new Error("SENDGRID_API_KEY_undefined")
		}
		else {
			this.sendGridApiKey = process.env.SENDGRID_API_KEY
		}

		if (process.env.T212USERNAME === undefined) {
			throw new Error("T212USERNAME_undefined")
		}
		else {
			this.t212Credentials.username = process.env.T212USERNAME
		}

		if (process.env.T212PASSWORD === undefined) {
			throw new Error("T212PASSWORD_undefined")
		}
		else {
			this.t212Credentials.password = process.env.T212PASSWORD
		}
	}
}