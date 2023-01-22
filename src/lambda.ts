import dotenv from "dotenv"
import { writeFile } from "fs/promises"
import { google } from "googleapis"
import { join } from "path"
import { chromium, Page } from "playwright"
import credentials from "../credentials.json"
import { IPortfolioData } from "./models/IPortfolioData"
import { IPosition } from "./models/IPosition"
import staticData from "./static.json"

export async function handler() {
	// if running in Lambda, load env vars here
	if (process.env.NODE_ENV !== "local") {
		dotenv.config({ path: join(__dirname, "..", "config.env") })
	}

	const { T212USERNAME: username, T212PASSWORD: password } = process.env

	if (username === undefined || password === undefined) {
		throw new Error("Username or password is undefined")
	}

	const portfolioData = await scrapeData(username, password)
		.catch((error) => console.log(`Error scraping portfolio data: ${error}`))

	if (portfolioData == null) return

	await writeOutput(portfolioData)
}

async function scrapeData(username: string, password: string): Promise<IPortfolioData> {
	console.log("Scraping T212")
	const browser = await chromium.launch({ 
		headless: false,
		slowMo: 100 
	})

	const page = await browser.newPage()

	await page.goto("https://www.trading212.com", {
		waitUntil: "networkidle"
	})
	
	// handle cookie pop up
	const cookiePopup = page.locator(".CookiesNotice_cookies-notice__2Hdlb")
	if (await cookiePopup.isVisible() === true) {
		await page.click(".Button_button__27xhw.Button_accent__oV2pE.CookiesNotice_button__35b5K.CookiesNotice_button-accent__3Qvh7")
	}

	await page.click(".Header_login-button__1CUw0")
	await page.type("[name='email']", username)
	await page.type("[name='password']", password)

	await Promise.all([
		page.click("[value='Log in']"),
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
		const averagePriceParsed = averagePrice.split(" ").at(-1)?.match(/[0-9.]+/g) ?? ["1"]

		const countryCode = await page.locator(".country-code").textContent() ?? ""
			
		positions.push({
			name: await currentInvestment.locator(".instrument-name").textContent() ?? "",
			ticker,
			totalValue: parsedTotalValue,
			totalShares: parseFloat(await currentInvestment.locator(".quantity").textContent() ?? ""),
			totalReturn,
			percentageReturn,
			averagePrice: parseFloat(averagePriceParsed[0]),
			countryCode
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

	const dividendYield = await updateStockEvents(page, portfolioData)
	portfolioData.dividendYield = dividendYield

	await page.close()
	await browser.close()

	return portfolioData
}

async function updateStockEvents(page: Page, portfolioData: IPortfolioData): Promise<number> {
	console.log("Scraping Stock Events")
	await page.goto("https://stockevents.app/for-you", {
		waitUntil: "domcontentloaded"
	})

	// scroll QR code into view and wait for user input
	await page.locator(".bg-white.p-4.shadow-card.rounded-md").scrollIntoViewIfNeeded()
	console.log("Waiting for user input. Scan QR code with Stock Events app")

	await page.waitForFunction(() => window.location.href === "https://stockevents.app/for-you", null, {
		timeout: 30000
	})

	const dividendYield = await page.locator(".text-xs.font-semibold.inline-block").nth(2).textContent()
	const parsedDividendYield = parseFloat(dividendYield?.match(/[0-9.]+/g)?.at(0) ?? "")

	for (const position of portfolioData.positions) {
		try {
			// non US tickers have stock exchange appended to end
			let urlTicker = position.ticker

			if (position.countryCode === "IE" || position.countryCode === "UK") {
				urlTicker = urlTicker + ".LSE"
			}

			await page.goto(`https://stockevents.app/stock/${urlTicker}`, {
				waitUntil: "networkidle"
			})
	
			// make sure position exists in StockEvents portfolio
			const addButton = await page.locator("button", { hasText: "Add to Watchlist" }).count()
			if (addButton > 0) {
				await page.locator("button", { hasText: "Add to Watchlist" }).click()
			}

			await page.locator("button", { hasText: "Edit Holdings" }).click()

			const inputField = page.locator("#first-name")
			const currentTotalShares = await inputField.getAttribute("value") ?? null

			if (currentTotalShares === null) {
				console.log("Error getting current total shares value for ticker:", position.ticker)
				continue
			}

			await inputField.click()

			for (const char of currentTotalShares) {
				await page.keyboard.press("Backspace")
			}

			await inputField.type(position.totalShares.toString())
			await page.locator("button", { hasText: "Save" }).click()
		}
		catch (error) {
			console.log("Error updating ticker:", position.ticker, error)
		}
	}

	return parsedDividendYield
}

async function writeOutput(portfolioData: IPortfolioData) {
	if (process.env.NODE_ENV === "local") {
		// write to JSON if running locally
		console.log("Writing to JSON file")
		await writeFile(join(__dirname, "..", "portfolioData.json"), JSON.stringify(portfolioData, null, 4), "utf8")
			.catch((error) => console.log("Error writing output to JSON file:", error))
	}

	// write to Google Sheets
	await writeToSheets(portfolioData)
}

async function writeToSheets(portfolioData: IPortfolioData) {
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