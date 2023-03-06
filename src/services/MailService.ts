import { MailService as SendGridMail } from "@sendgrid/mail"

export class MailService {
	private readonly _sendGrid: SendGridMail = new SendGridMail()

	constructor(apiKey: string) {
		this._sendGrid.setApiKey(apiKey)
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