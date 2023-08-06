import dotenv from "dotenv"
import { join } from "path"

export class Config {
	static resendApiKey: string
	static t212Credentials: { 
		username: string
		password: string 
	// initialise with empty strings to avoid undefined references in `init()`
	} = { username: "", password: "" }

	static init() {
		dotenv.config({ path: join(__dirname, "..", "..", "config.env") })

		if (process.env.RESEND_API_KEY === undefined) {
			throw new Error("`RESEND_API_KEY` undefined")
		}
		else {
			this.resendApiKey = process.env.RESEND_API_KEY
		}

		if (process.env.T212USERNAME === undefined) {
			throw new Error("`T212USERNAME` undefined")
		}
		else {
			this.t212Credentials.username = process.env.T212USERNAME
		}

		if (process.env.T212PASSWORD === undefined) {
			throw new Error("`T212PASSWORD` undefined")
		}
		else {
			this.t212Credentials.password = process.env.T212PASSWORD
		}
	}

	static getEnv() {
		return process.env.NODE_ENV === "local" ? "local" : "prod"
	}
}