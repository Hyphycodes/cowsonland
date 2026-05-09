import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
      "Plaid-Version": "2020-09-14",
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS ?? "transactions")
  .split(",")
  .map((s) => s.trim());

export const PLAID_COUNTRY_CODES = (process.env.PLAID_COUNTRY_CODES ?? "US")
  .split(",")
  .map((s) => s.trim());

export const PLAID_DAYS_REQUESTED = Number(
  process.env.PLAID_DAYS_REQUESTED ?? 730,
);
