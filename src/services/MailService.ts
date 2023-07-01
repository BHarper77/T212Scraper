import { Resend } from 'resend';
import { Config } from '../models/Config';

export class MailService {
	private readonly _resend = new Resend(Config.resendApiKey)

	async sendQrCode(imageBuffer: Buffer) {
		try {
			const data = await this._resend.emails.send({
				to: "bradyharper11@googlemail.com",
				from: 'T212Scraper <onboarding@resend.dev>',
				subject: "T212Scraper QR Code",
				text: "Awaiting QR code scan",
				attachments: [{
					filename: "qrCode.png",
					content: imageBuffer
				}]
			})
	
			console.log({ data })
		} 
		catch (error) {
			console.log({ error })
		}
	}
}