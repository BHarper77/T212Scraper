import dotenv from "dotenv"
import { join } from "path"
import { chromium, ElementHandle } from "playwright"
import { PortfolioData } from "./models/PortfolioData"
import { Positions } from "./models/Positions"
import staticData from "./static.json"

(async () => {
	// retrieve login details from config.env
	// login to t212 using Playwright
	// scrape portfolio data (names, tickers, number of shares, position value)
	// perform calculations on data (dividend yield)

	dotenv.config({ path: join(__dirname, "..", "config.env") })

	const username = process.env.T212USERNAME
	const password = process.env.T212PASSWORD

	if (username === undefined || password === undefined) {
		throw new Error("Username or password is undefined")
	}

	const portfolioData = await scrapeData(username, password)
		.catch((error) => console.log(error))
})()

async function scrapeData(username: string, password: string): Promise<PortfolioData> {
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

	const positions: Array<Positions> = []

	for (let i = 0; i < investmentsCount; i++) {
		const currentInvestment = investments.nth(i)
		
		// need to click on each investment to get details
		await currentInvestment.click()

		// parse return metrics, displayed in format "+£363.57 (15.26%)"
		const stockReturn = await currentInvestment.locator(".return").textContent() ?? ""
		const stockReturnSplit = stockReturn.split(" ").map((value) => {
			// parse and convert values
			const parsedValue = value.replace(/[()%£$]/g, "")
			return parseFloat(parsedValue)
		})

		// handle negative returns, percentage isn't displayed as negative
		let [totalReturn, percentageReturn] = stockReturnSplit
		totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn

		// dividend info is retrieved from details section
		const dividendYield = parseFloat(await page.locator(".company-details [data-qa-key-ratios='dividendYield']").textContent({ timeout: 5000 })
			.catch((error) => {
				console.log("Error extracting dividend yield. This might be due to ETFs not displaying dividend yield info:", error)
				return "0"
			}) ?? "".replace(/[%]/g, ""))

		positions.push({
			Name: await currentInvestment.locator(".instrument-name").textContent() ?? "",
			Ticker: await currentInvestment.locator(".investment-item").getAttribute("data-qa-item") ?? "",
			TotalValue: parseFloat(await currentInvestment.locator(".total-value").textContent() ?? ""),
			TotalShares: parseFloat(await currentInvestment.locator(".quantity").textContent() ?? ""),
			TotalReturn: totalReturn,
			PercentageReturn: percentageReturn,
			DividendYield: dividendYield
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

	const portfolioData: PortfolioData = {
		TotalValue: parsedTotalValue,
		TotalInvested: parsedTotalInvested,
		TotalReturn: totalReturn,
		PercentageReturn: percentageReturn,
		DividendYield: parseFloat(((staticData.AnnualDividendIncome / parsedTotalValue) * 100).toFixed(2)),
		Positions: positions,
		TotalInvestments: investmentsCount
	}

	console.log({ portfolioData })
	
	await page.close()
	await browser.close()

	return portfolioData
}