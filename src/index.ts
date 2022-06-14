import dotenv from "dotenv"
import { join } from "path"
import { chromium } from "playwright"
import { IPortfolioData } from "./models/PortfolioData"
import { IPositions } from "./models/Positions"
import staticData from "./static.json"
import { writeFile } from "fs/promises"

(async () => {
	// TODO: test login with invalid credentials
	// try logging in with 2FA
	// abstract major functionality to libs
	// add more metric calculations
	// output as CSV and JSON

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

	// loop through portfolio holdings
	const investments = page.locator(".investments-section .highlight-container")
	const investmentsCount = await investments.count()

	const positions: IPositions[] = []

	for (let i = 0; i < investmentsCount; i++) {
		const currentInvestment = investments.nth(i)
		await currentInvestment.click()
		
		// ticker
		const tickerText = await currentInvestment.locator(".investment-item").getAttribute("data-qa-item") ?? ""
		const ticker = tickerText.split("_")[0]

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

		// dividend yield
		const dividendYield = await page.locator(".company-details [data-qa-key-ratios='dividendYield'] .value").textContent({ timeout: 3000 })
			.catch((error) => {
				console.log("Error extracting dividend yield. This might be due to ETFs not displaying dividend yield info:", error)
				return "0"
			}) ?? "".replace(/[%]/g, "")

		positions.push({
			name: await currentInvestment.locator(".instrument-name").textContent() ?? "",
			ticker: ticker,
			totalValue: parsedTotalValue,
			totalShares: parseFloat(await currentInvestment.locator(".quantity").textContent() ?? ""),
			totalReturn: totalReturn,
			percentageReturn: percentageReturn,
			dividendYield: parseFloat(dividendYield),
			averagePrice: 0
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
	
	// check if any updates have been made to PIE
		// get list of existing tickers in sheet
		// compare with tickers in scraped data
		// add any missing tickers with data
		// how to copy over formulas etc?

	// iterate through each ticker row and update data
		// number of shares owned: row G
		// average price: row H
		// total portfolio dividend yield: cell L16
}