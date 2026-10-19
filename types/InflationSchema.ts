import z from "zod";

/**
 * data/inflation.json: annual inflation per year, in percent.
 *
 * `rates[Y]` is the change in the consumer price index (KPI) from year Y−1
 * to year Y. To express year A in year B's prices (A < B) the parser chains
 * the rates for A+1 … B, so the base year itself needs no rate.
 */
export const InflationSchema = z.object({
    description: z.string().optional(),
    source: z.string().optional(),
    rates: z.record(z.string().regex(/^\d{4}$/), z.number()),
});

export type Inflation = z.infer<typeof InflationSchema>;
