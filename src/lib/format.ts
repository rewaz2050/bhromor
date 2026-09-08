/**
 * Money + formatting helpers.
 * Per the PROSANTI blueprint (§69) all amounts are integer minor units (paisa)
 * to avoid unsafe floating-point arithmetic. 149000 = ৳1,490.
 */

export type Bdt = number; // amount in paisa (৳1 = 100)

export const formatBdt = (amount: Bdt): string =>
  `৳${(amount / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

export const formatPaisa = (amount: Bdt): string => {
  const taka = amount / 100;
  if (Number.isInteger(taka)) {
    return `৳${taka.toLocaleString("en-IN")}`;
  }
  return `৳${taka.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const bdt = (taka: number): Bdt => Math.round(taka * 100);

export const totalInPaisa = (amounts: Bdt[]): Bdt =>
  amounts.reduce((sum, value) => sum + value, 0);
