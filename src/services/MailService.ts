import { Resend } from 'resend';
import { Config } from '../models/Config';
import { PortfolioData } from '../models/PortfolioData';

export class MailService {
	private readonly _resend = new Resend(Config.resendApiKey)

	async sendQrCode(imageBuffer: Buffer) {
		try {
			await this._resend.emails.send({
				to: "bradyharper11@googlemail.com",
				from: 'T212Scraper <onboarding@resend.dev>',
				subject: "T212Scraper QR Code",
				text: "Awaiting QR code scan",
				attachments: [{
					filename: "qrCode.png",
					content: imageBuffer
				}]
			})
		} 
		catch (error) {
			throw error
		}
	}

	async sendSuccessEmail(portfolioData: PortfolioData) {
		try {
			await this._resend.emails.send({
				to: "bradyharper11@googlemail.com",
				from: 'T212Scraper <onboarding@resend.dev>',
				subject: "T212Scraper Success",
				text: `Stock events and Google Sheets has been updated\n ${JSON.stringify(portfolioData, null, 4)}`,
			})
		}
		catch (error) {
			throw error
		}
	}

	async sendErrorEmail(error: Error) {
		try {
			await this._resend.emails.send({
				to: "bradyharper11@googlemail.com",
				from: 'T212Scraper <onboarding@resend.dev>',
				subject: "T212Scraper Error",
				text: `Error running T212Scraper ${error}`,
			})
		}
		catch (error) {
			throw error			
		}
	}
}