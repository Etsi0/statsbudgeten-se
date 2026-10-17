import z from "zod"
import { ExpenseGroupSchema, ExpenseRowSchema, RevenueGroupSchema, RevenueRowSchema } from "./BudgetRowSchema";


export const BudgetJsonSchema = z.object({
    expenses: z.array(ExpenseGroupSchema),
    revenues : z.array(RevenueGroupSchema),
    expensesTotal: z.number(),
    revenuesTotal: z.number(),

})

export type BudgetJson = z.infer<typeof BudgetJsonSchema>