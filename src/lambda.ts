import { google } from "googleapis"
import credentials from "../credentials.json"
import { Config } from "./models/Config"
import type { PortfolioData } from "./models/PortfolioData"
import { MailService } from "./services/MailService"
import { ScraperService } from "./services/ScraperService"

export class Handler {
	private readonly _mailService: MailService
	private readonly _scraper: ScraperService
	// TODO: implement report
	// send email including current portfolio state and errors
	// use https://react.email/ to build email
	// use https://resend.com/ to send email
	// private readonly _report: any

	constructor() {
		Config.init()
		this._mailService = new MailService()
		this._scraper = new ScraperService(this._mailService)
	}
	
	async wrapper() {
		const portfolioData = await this._scraper.scrape()
		console.log({ portfolioData })
	
		await this.writeToSheets(portfolioData)
	}

	async writeToSheets(portfolioData: PortfolioData) {
		console.log("Updating Google Sheets")
		const { client_email, private_key } = credentials
	
		const jwtClient = new google.auth.JWT({
			email: client_email,
			key: private_key,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"]
		})
		
		// Acquire an auth client, and bind it to all future calls
		await jwtClient.authorize()
		google.options({ auth: jwtClient })
	
		const { spreadsheets } = google.sheets({ version: "v4" })
		const { SPREADSHEETID: spreadsheetId } = process.env
	
		// check if any updates have been made to PIE
		// get list of existing tickers in sheet
		const tickersResponse = await spreadsheets.values.get({
			spreadsheetId,
			range: "A:A",
			majorDimension: "COLUMNS",
		}).then((response) => response.data).catch((error) => {
			console.log("Error retrieving tickers:", error)
			throw error
		})
	
		if (tickersResponse.values == undefined) {
			// TODO: error handling
			console.log("No tickers retrieved from Sheets. Response:", tickersResponse)
			return
		}
	
		const values = tickersResponse.values[0]
	
		for (const [index, ticker] of values.entries()) {
			const row = index + 1
	
			const currentStockData = portfolioData.positions.find((position) => position.ticker === ticker.split(":").at(-1))
	
			// skip cells including non ticker values e.g. "Symbol", "Total" etc
			if (currentStockData === undefined) {
				continue
			}
	
			// update specific cells with new scraped values
			await spreadsheets.values.batchUpdate({
				spreadsheetId,
				requestBody: {
					valueInputOption: "USER_ENTERED",
					data: [
						{
							range: `H${row}`,
							values: [
								[currentStockData.averagePrice]
							]
						},
						{
							range: `G${row}`,
							values: [
								[currentStockData.totalShares]
							]
						}
					]
				}
			})
		}
	
		// update portfolio dividend yield
		await spreadsheets.values.update({
			spreadsheetId,
			range: "B16",
			valueInputOption: "RAW",
			requestBody: {
				values: [[portfolioData.dividendYield]]
			}
		})
	}
}

// bind class instance to handler function to preserve `this` keyword
const handlerInstance = new Handler()
export const handler = handlerInstance.wrapper.bind(handlerInstance)