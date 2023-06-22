import { MailService as SendGridMail } from "@sendgrid/mail"
import { Config } from "../models/Config"

export class MailService {
	private readonly _sendGrid = new SendGridMail()

	constructor() {
		this._sendGrid.setApiKey(Config.sendGridApiKey)
	}

	async sendQrCode(path: string, imageBuffer: Buffer) {
		await this._sendGrid.send({
			to: "bradyharper11@googlemail.com",
			from: "bradyharper11@googlemail.com",
			subject: "T212Scraper",
			text: "Awaiting QR code scan",
			attachments: [{
				filename: path,
				type: "image/png",
				content: imageBuffer.toString("base64")
			}]
		})
	}
}