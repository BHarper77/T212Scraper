import dotenv from "dotenv"
import { join } from "path"
import { chromium } from "playwright"
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

	await scrapeData(username, password)
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

	await page.click(".submit-button_input__3s_QD")

	await page.close()
	await browser.close()

	// loop through portfolio holdings
	const investments = page.locator(".investments-section .highlight-container")
	
	const elements = await investments.evaluateAll((elements) => elements)
	const positions: Array<Positions> = []

	for (const [index, element] of elements.entries()) {
		// TODO: check if current ticker is in skip list

		// return metrics displayed in format "+£363.57 (15.26%)", need to parse
		const stockReturn = element.querySelector(".return")?.textContent
		const stockReturnSplit = stockReturn?.split(" ") ?? [null, null]
		const [totalReturn, percentageReturn] = stockReturnSplit.map((value) => parseFloat(value ?? ""))

		// have to click on each element to get dividend yield
		await investments.nth(index).click()
		const dividendYield = parseFloat(await page.locator(".company-details [data-qa-key-ratios='dividendYield']").textContent() ?? "")

		positions.push({
			Name: element.querySelector(".instrument-name")?.textContent ?? "",
			Ticker: element.querySelector(".investment-item")?.getAttribute("data-qa-item") ?? "",
			TotalValue: parseFloat(element.querySelector(".total-value")?.textContent ?? ""),
			TotalShares: parseFloat(element.querySelector(".quantity")?.textContent ?? ""),
			TotalReturn: totalReturn ?? 0,
			PercentageReturn: percentageReturn ?? 0,
			DividendYield: dividendYield ?? 0
		})
	}	

	// return metrics displayed in format "+£363.57 (15.26%)", need to parse
	const portfolioSummary = page.locator(".portfolio-summary")
	const portfolioReturn = await portfolioSummary.locator("data-qa-portfolio-return='portfolio -return'").textContent()
	const portfolioReturnSplit = portfolioReturn?.split(" ") ?? [null, null]
	const [totalReturn, percentageReturn] = portfolioReturnSplit.map((value) => parseFloat(value ?? ""))

	const totalValue = parseFloat(await portfolioSummary.locator(".formatted-price-part").nth(1).textContent() ?? "")

	const portfolioData: PortfolioData = {
		TotalValue: totalValue,
		TotalInvested: parseFloat(await portfolioSummary.locator("[data-qa-portfolio-invested='portfolio - invested']").textContent() ?? ""),
		TotalReturn: totalReturn,
		PercentageReturn: percentageReturn,
		DividendYield: (staticData.AnnualDividendIncome / totalValue) * 100,
		Positions: positions
	}

	return portfolioData
}