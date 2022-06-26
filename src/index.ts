import dotenv from "dotenv"
import { join } from "path"
import { chromium } from "playwright"
import { IPortfolioData } from "./models/IPortfolioData"
import { IPosition } from "./models/IPosition"
import staticData from "./static.json"
import { writeFile } from "fs/promises"
import { google } from "googleapis"
import credentials from "../credentials.json"

(async () => {
	// retrieve login details from config.env
	dotenv.config({ path: join(__dirname, "..", "config.env") })

	const { T212USERNAME: username, T212PASSWORD: password } = process.env

	if (username === undefined || password === undefined) {
		throw new Error("Username or password is undefined")
	}

	const portfolioData = await scrapeData(username, password)
		.catch((error) => console.log(`Error scraping portfolio data: ${error}`))

	if (portfolioData == null) return

	await writeOutput(portfolioData)
})()

async function scrapeData(username: string, password: string): Promise<IPortfolioData> {
	const browser = await chromium.launch({ 
		headless: false,
		slowMo: 100 
	})

	const page = await browser.newPage()

	await page.goto("https://www.trading212.com", {
		waitUntil: "networkidle"
	})
	
	// handle cookie pop up
	if (await page.locator(".cookies-notice_cookies-notice__33EUa").isVisible()) {
		await page.click(".cookies-notice_button__3K8cT.cookies-notice_button-accent__2rm8R")
	}

	await page.click(".header_login-button__daXsh")
	await page.type("[name='email']", username)
	await page.type("[name='password']", password)

	await Promise.all([
		page.click(".submit-button_input__3s_QD"),
		page.waitForNavigation({ waitUntil: "networkidle" })
	])

	// ensure holdings tab is selected
	const currentTabText = await page.locator(".investment-tab.selected").innerText()
	if (currentTabText.toLowerCase() === "Pies".toLowerCase()) {
		await page.click("[data-qa-tab='orders']")
	}

	// loop through portfolio holdings
	const investments = page.locator(".investments-section .highlight-container")
	const investmentsCount = await investments.count()

	const positions: IPosition[] = []

	for (let i = 0; i < investmentsCount; i++) {
		const currentInvestment = investments.nth(i)
		await currentInvestment.click()
		
		// ticker
		const tickerText = await currentInvestment.locator(".investment-item").getAttribute("data-qa-item") ?? ""
		let ticker = tickerText.split("_")[0]

		if (ticker.charAt(ticker.length - 1) === "l") {
			ticker = ticker.slice(0, ticker.length - 1)
		}

		if (staticData.excludedTickers.includes(ticker)) continue

		const stockReturn = await currentInvestment.locator(".return").textContent() ?? ""
		
		const stockReturnSplit = stockReturn.split(" ")
			// only include values with currency symbols
			.map((value) => {
				// parse and convert values
				const parsedValue = value.replace(/[()£$]/g, "")
				return parseFloat(parsedValue)
			})

		let [totalReturn, percentageReturn] = stockReturnSplit

		// handle negative returns, percentage isn't displayed as negative
		totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn

		const totalValue = await currentInvestment.locator(".total-value").textContent() ?? ""
		const parsedTotalValue = parseFloat(totalValue.replace(/[$£]/g, ""))

		// average price
		const averagePrice = await page.locator("[data-qa-average-price='average-price'] .value").textContent() ?? ""
		const averagePriceParsed = averagePrice.split(" ").at(-1)?.match(/[0-9.]+/g) ?? []

		positions.push({
			name: await currentInvestment.locator(".instrument-name").textContent() ?? "",
			ticker,
			totalValue: parsedTotalValue,
			totalShares: parseFloat(await currentInvestment.locator(".quantity").textContent() ?? ""),
			totalReturn,
			percentageReturn,
			averagePrice: parseFloat(averagePriceParsed[0])
		})
	}

	const portfolioSummary = page.locator(".portfolio-summary")
	
	// parse return metrics, displayed in format "+£363.57 (15.26%)"
	const portfolioReturn = await portfolioSummary.locator("[data-qa-portfolio-return='portfolio-return'] .value").textContent() ?? ""
	const portfolioReturnSplit = portfolioReturn.split(" ").map((value) => {
		// parse and convert values
		const parsedValue = value.replace(/[()%£$]/g, "")
		return parseFloat(parsedValue)
	})

	// handle negative returns, percentage isn't displayed as negative
	let [totalReturn, percentageReturn] = portfolioReturnSplit
	totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn

	const totalValue = await portfolioSummary.locator(".formatted-price").textContent() ?? ""
	const parsedTotalValue = parseFloat(totalValue.replace(/[£%,]/g, ""))

	const totalInvested = await portfolioSummary.locator("[data-qa-portfolio-invested='portfolio-invested'] .value").textContent() ?? ""
	const parsedTotalInvested = parseFloat(totalInvested.replace(/[£%,]/g, ""))

	const portfolioData: IPortfolioData = {
		totalValue: parsedTotalValue,
		totalInvested: parsedTotalInvested,
		totalReturn: totalReturn,
		percentageReturn: percentageReturn,
		dividendYield: parseFloat(((staticData.annualDividendIncome / parsedTotalValue) * 100).toFixed(2)),
		totalInvestments: investmentsCount - staticData.excludedTickers.length,
		positions: positions
	}

	await page.close()
	await browser.close()

	return portfolioData
}

async function writeOutput(portfolioData: IPortfolioData) {
	// write to JSON
	await writeFile(join(__dirname, "..", "portfolioData.json"), JSON.stringify(portfolioData, null, 4), "utf8")
		.catch((error) => console.log("Error writing output to JSON file:", error))

	// write to Google Sheets
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

	if (tickersResponse.values === undefined) {
		console.log("No tickers retrieved from Sheets. Response:", tickersResponse)
		return
	}

	const values = tickersResponse.values![0]

	for (const [index, ticker] of values.entries()) {
		const row = index + 1

		const currentStockData = portfolioData.positions.find((position) => position.ticker === ticker.split(":").at(-1))

		if (currentStockData === undefined) {
			console.log("Error finding current stock data on ticker:", ticker)
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
		valueInputOption: "USER_ENTERED",
		requestBody: {
			values: [[portfolioData.dividendYield]]
		}
	})
}