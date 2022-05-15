import dotenv from "dotenv"
import { join } from "path"
import { chromium } from "playwright"
import InvestmentScraper from "./lib/scraper/Scraper"
import { PortfolioData } from "./models/PortfolioData"
import { Positions } from "./models/Positions"
import staticData from "./static.json"
import { writeFile } from "fs/promises"

(async () => {
	// retrieve login details from config.env
	dotenv.config({ path: join(__dirname, "..", "config.env") })

	const { T212USERNAME: username, T212PASSWORD: password } = process.env

	if (username === undefined || password === undefined) {
		throw new Error("Username or password is undefined")
	}

	const portfolioData = await scrapeData(username, password)
		.catch((error) => console.log(error))

	// write portfolio data to JSON file
	await writeFile(join(__dirname, "..", "portfolioData.json"), JSON.stringify(portfolioData), "utf8")
		.catch((error) => console.log("Error writing output to JSON file:", error))
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

	const investmentScraper = new InvestmentScraper(investments)

	for (let i = 0; i < investmentsCount; i++) {
		await investmentScraper.setCurrentInvestment(i)

		const totalReturn = await investmentScraper.getTotalReturn(".return")
		let percentageReturn = await investmentScraper.getPercentageReturn(".return")

		// handle negative returns, percentage isn't displayed as negative
		totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn

		const currentInvestment = investmentScraper.currentInvestment

		const totalValue = await currentInvestment.locator(".total-value").textContent() ?? ""
		const parsedTotalValue = parseFloat(totalValue.replace(/[$£]/g, ""))

		positions.push({
			Name: await currentInvestment.locator(".instrument-name").textContent() ?? "",
			Ticker: await investmentScraper.getTicker(".investment-item", "data-qa-item"),
			TotalValue: parsedTotalValue,
			TotalShares: parseFloat(await currentInvestment.locator(".quantity").textContent() ?? ""),
			TotalReturn: totalReturn,
			PercentageReturn: percentageReturn,
			DividendYield: await investmentScraper.getDividendYield(page, ".company-details [data-qa-key-ratios='dividendYield'] .value")
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
		TotalInvestments: investmentsCount,
		Positions: positions
	}

	await page.close()
	await browser.close()

	return portfolioData
}