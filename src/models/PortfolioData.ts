import { Positions } from "./Positions"

export interface PortfolioData {
	TotalValue: number
	TotalInvested: number
	TotalReturn: number
	PercentageReturn: number
	DividendYield: number
	TotalInvestments: number
	Positions: Array<Positions>
}