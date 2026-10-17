import z from "zod"

export const BudgetRowSchema = z.object({
    title : z.string(),
})

export const BudgetGroupSchema = z.object({
    total: z.number(),
    title: z.string(),
})

export const ExpenseRowSchema = BudgetRowSchema.extend({
    id: z.number(),
    expense: z.number(), 
})

export const ExpenseGroupSchema = BudgetGroupSchema.extend({
    rows: z.array(ExpenseRowSchema),
    total: z.number(),
    title: z.string(),
    uo: z.number(),
})

export const RevenueRowSchema = BudgetRowSchema.extend({
    id: z.number(),
    revenue: z.number(),
})

export const RevenueGroupSchema = z.object({
    rows: z.array(RevenueRowSchema),
    total: z.number(),
    title: z.string(),
    id_start: z.number(),
    id_end:z.number(),
})

export type BudgetRow = z.infer<typeof BudgetRowSchema>
export type BudgetGroup = z.infer<typeof BudgetGroupSchema>
export type ExpenseRow = z.infer<typeof ExpenseRowSchema>
export type ExpenseGroup = z.infer<typeof ExpenseGroupSchema>
export type RevenueRow = z.infer<typeof RevenueRowSchema>
export type RevenueGroup = z.infer<typeof RevenueGroupSchema>

