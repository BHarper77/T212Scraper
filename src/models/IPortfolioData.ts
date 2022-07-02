import { IPosition } from "./IPosition"

export interface IPortfolioData {
	totalValue: number
	totalInvested: number
	totalReturn: number
	percentageReturn: number
	dividendYield: number
	totalInvestments: number
	positions: IPosition[]
}