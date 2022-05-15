import { Locator, Page } from "playwright"

/** Helper class for scraping individual investments */
export default class InvestmentScraper {
	private readonly _investmentsLocator: Locator
	private _currentInvestment: Locator

	constructor(investmentsLocator: Locator) {
		this._investmentsLocator = investmentsLocator
		this._currentInvestment = investmentsLocator.nth(0)
	}
	
	public get currentInvestment(): Locator {
		return this._currentInvestment
	}

	/** Sets the current investment target, and clicks on the selector */
	public async setCurrentInvestment(index : number) {
		this._currentInvestment = this._investmentsLocator.nth(index)
		await this._currentInvestment.click()
	}

	/** Finds and parser the current investment's ticker */
	public async getTicker(selector: string, attribute: string): Promise<string> {
		const ticker = await this._currentInvestment.locator(selector).getAttribute(attribute) ?? ""
		return ticker.split("_")[0]
	}

	/** Finds and parses the current investments total return */
	public async getTotalReturn(selector: string): Promise<number> {
		const stockReturn = await this._currentInvestment.locator(selector).textContent() ?? ""
		
		const stockReturnSplit = stockReturn.split(" ")
			// only include values with currency symbols
			.filter((value) => value.includes("£") || value.includes("$"))	
			.map((value) => {
				// parse and convert values
				const parsedValue = value.replace(/[()£$]/g, "")
				return parseFloat(parsedValue)
			})

		const [totalReturn, ..._] = stockReturnSplit
		return totalReturn
	}

	/** Finds and parses the current investments percentage return */
	public async getPercentageReturn(selector: string): Promise<number> {
		const stockReturn = await this._currentInvestment.locator(selector).textContent() ?? ""

		const stockReturnSplit = stockReturn.split(" ")
			// only include values with percentage symbols
			.filter((value) => value.includes("%"))	
			.map((value) => {
				// parse and convert values
				const parsedValue = value.replace(/[()%]/g, "")
				return parseFloat(parsedValue)
			})

		const [percentageReturn, ..._] = stockReturnSplit
		return percentageReturn
	}

	/** Finds and parser the current investments dividend yield */
	public async getDividendYield(page: Page, selector: string): Promise<number> {
		// dividend info is retrieved from main details section
		const dividendYield = await page.locator(selector).textContent({ timeout: 5000 })
			.catch((error) => {
				console.log("Error extracting dividend yield. This might be due to ETFs not displaying dividend yield info:", error)
				return "0"
			}) ?? "".replace(/[%]/g, "")

		return parseFloat(dividendYield)
	}
}