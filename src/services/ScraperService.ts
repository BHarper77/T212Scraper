import chromium from "@sparticuz/chromium";
import { Browser, Page, chromium as playwright } from "playwright";
import { Config } from "../models/Config";
import type { PortfolioData } from "../models/PortfolioData";
import type { Position } from "../models/Position";
import staticData from "../static.json";
import type { MailService } from "./MailService";

export class ScraperService {
	constructor(
		private readonly _mailService: MailService
	) {}

	/** Scrapes T212 and updates Stock events */
	async scrape() {
		const browser = await playwright.launch({ 
			headless: Config.getEnv() === "local" ? false : true,
			// only set on prod
			executablePath: Config.getEnv() === "local" ? undefined : await chromium.executablePath(),
			slowMo: 100,
		})

		const page = await browser.newPage()

		let portfolioData: PortfolioData

		try {
			const partialPortfolioData = await this._scrapeT212(page)
			portfolioData = await this._scrapeStockEvents(page, partialPortfolioData)
		}
		catch (error) {
			await this._mailService.sendErrorEmail(error as Error)
		}
		
		// TODO: if response contains errors, write trace to s3 and send email report

		await this._cleanup(page, browser)

		// @ts-ignore
		return portfolioData
	}

	private async _scrapeT212(page: Page): Promise<PartialPortfolioData> {
		console.log("Scraping T212")
	
		const { username, password } = Config.t212Credentials
	
		if (username === undefined || password === undefined) {
			throw new Error("Username or password is undefined")
		}
	
		await page.goto("https://www.trading212.com", {
			waitUntil: "networkidle"
		})
		
		const cookiePopup = page.locator("div[class^='CookiesNotice_cookies-notice__']")
		if (await cookiePopup.isVisible() === true) {
			await page.click("div[class*='CookiesNotice_button-accent__']")
		}
	
		await page.click("[class^='Header_login-button__']")
		await page.type("[name='email']", username)
		await page.type("[name='password']", password)
	
		await Promise.all([
			page.click("[value='Log in']"),
			page.waitForNavigation({ waitUntil: "networkidle" })
		])
	
		// ensure holdings tab is selected so all stocks are displayed
		const currentTabText = await page.locator(".investment-tab.selected").innerText()
		if (currentTabText.toLowerCase() === "pies") {
			await page.click("[data-qa-tab='orders']")
		}
	
		const investments = await page.locator(".investments-section .highlight-container").all()
	
		const positions: Position[] = []
	
		// scrape each position in portfolio
		for (const investment of investments) {
			// show current investment info
			await investment.click()
			
			const tickerText = await investment.locator(".investment-item").getAttribute("data-qa-item") ?? ""
			let ticker = tickerText.split("_")[0]
	
			// parse any exchange specific tickers
			if (ticker.charAt(ticker.length - 1) === "l") {
				ticker = ticker.slice(0, ticker.length - 1)
			}
	
			if (staticData.excludedTickers.includes(ticker)) continue
	
			const stockReturn = await investment.locator(".return").textContent() ?? ""
	
			// parse return metrics, displayed in format "+£20 (5%)"
			const stockReturnSplit = stockReturn.split(" ")
			// only include values with currency symbols (no percentages)
				.map((value) => {
					const parsedValue = value.replace(/[()£$]/g, "")
					return parseFloat(parsedValue)
				})
	
			const [totalReturn,] = stockReturnSplit
			let [, percentageReturn] = stockReturnSplit
	
			// handle negative returns, percentage is coloured red rather than containing negative symbol
			totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn
	
			const totalValue = await investment.locator(".total-value").textContent() ?? ""
			const parsedTotalValue = parseFloat(totalValue.replace(/[$£]/g, ""))
	
			const averagePrice = await page.locator("[data-qa-average-price='average-price'] .value").textContent() ?? ""
			const averagePriceParsed = averagePrice.split(" ").at(-1)?.match(/[0-9.]+/g) ?? ["1"]
	
			const countryCode = await page.locator(".country-code").textContent() ?? ""
		
			positions.push({
				name: await investment.locator(".instrument-name").textContent() ?? "",
				ticker,
				totalValue: parsedTotalValue,
				totalShares: parseFloat(await investment.locator(".quantity").textContent() ?? ""),
				totalReturn,
				percentageReturn,
				averagePrice: parseFloat(averagePriceParsed[0]),
				countryCode
			})
		}
	
		// scrape general portfolio data
		const portfolioSummary = page.locator(".portfolio-summary")
	
		// parse return metrics, displayed in format "+£363.57 (15.26%)"
		const portfolioReturn = await portfolioSummary.locator("[data-qa-portfolio-return='portfolio-return'] .value").textContent() ?? ""
		const portfolioReturnSplit = portfolioReturn.split(" ").map((value) => {
			// parse and convert values
			const parsedValue = value.replace(/[()%£$]/g, "")
			return parseFloat(parsedValue)
		})
	
		// handle negative returns, percentage is coloured red rather than containing negative symbol
		const [totalReturn,] = portfolioReturnSplit
		let [, percentageReturn] = portfolioReturnSplit
		totalReturn < 0 ? percentageReturn = 0 - percentageReturn : percentageReturn
	
		const totalValue = await portfolioSummary.locator(".formatted-price").textContent() ?? ""
		const parsedTotalValue = parseFloat(totalValue.replace(/[£%,]/g, ""))
	
		const totalInvested = await portfolioSummary.locator("[data-qa-portfolio-invested='portfolio-invested'] .value").textContent() ?? ""
		const parsedTotalInvested = parseFloat(totalInvested.replace(/[£%,]/g, ""))
		
		// dividendYield is scraped from Stock Events so omit from typing for now
		const portfolioData: Omit<PortfolioData, "dividendYield"> = {
			totalValue: parsedTotalValue,
			totalInvested: parsedTotalInvested,
			totalReturn: totalReturn,
			percentageReturn: percentageReturn,
			totalInvestments: investments.length - staticData.excludedTickers.length,
			positions: positions
		}
	
		return portfolioData
	}

	private async _scrapeStockEvents(page: Page, portfolioData: PartialPortfolioData): Promise<PortfolioData> {
		console.log("Scraping Stock Events")
	
		await page.goto("https://stockevents.app/for-you", {
			waitUntil: "domcontentloaded"
		})
	
		// scroll QR code into view and wait for user input
		await page.locator(".bg-white.p-4.shadow-card.rounded-md").scrollIntoViewIfNeeded()
	
		const imageBuffer = await page.screenshot()
		await this._mailService.sendQrCode(imageBuffer)
	
		console.log("Waiting for QR code to be scanned")
	
		await page.waitForFunction(() => window.location.href === "https://stockevents.app/for-you", null, {
			// 2 minute timeout waiting for QR code to be scanned via email
			timeout: 120000
		}).catch(async (stockEventsError) => {
			console.log({ stockEventsError })
			await page.reload({
				waitUntil: "networkidle"
			})
		})
	
		console.log("Successfully logged in")

		const dividendYieldLocator = page.locator(".text-xs.font-semibold.inline-block", {
			hasText: /Yield$/g
		})
	
		// wait for dividend yield element to be populated with non 0
		// waiting for networkidle etc didn't work for some reason
		await page.waitForTimeout(3000)
		const dividendYield = await dividendYieldLocator.textContent()
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
	
				// remove existing value to be replaced
				for (let i = 0; i < currentTotalShares.length; i++) {
					await page.keyboard.press("Backspace")
				}
	
				await inputField.type(position.totalShares.toString())
				await page.locator("button", { hasText: "Save" }).click()
			}
			catch (error) {
				// TODO: proper error handling?
				console.log("Error updating ticker:", position.ticker, error)
			}
		}
	
		return {
			...portfolioData,
			dividendYield: parsedDividendYield
		}
	}

	/** Cleanup browser artifacts */
	private async _cleanup(page: Page, browser: Browser) {
		console.log("Cleaning up")
		await page.close()
		await browser.close()
	}
}

type PartialPortfolioData = Omit<PortfolioData, "dividendYield">