import type { Position } from "./Position"

export type PortfolioData = {
	totalValue: number
	totalInvested: number
	totalReturn: number
	percentageReturn: number
	dividendYield: number
	totalInvestments: number
	positions: Position[]
}