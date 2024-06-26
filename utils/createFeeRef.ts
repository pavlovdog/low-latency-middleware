import { EstimateFeesPerGasParameters, Client, EstimateFeesPerGasReturnType } from "viem";
import { estimateFeesPerGas } from "viem/actions";

export type CreateFeeRefOptions = {
  client: Client;
  refreshInterval: number;
  args?: EstimateFeesPerGasParameters;
};

export type FeeRef = {
  fees: EstimateFeesPerGasReturnType<'eip1559'>;
  lastUpdatedTimestamp: number;
};

/** Update fee values once every `refreshInterval` instead of right before every request */
export async function createFeeRef({ client, args, refreshInterval }: CreateFeeRefOptions): Promise<FeeRef> {
  // @ts-ignore
  const feeRef: FeeRef = { fees: {}, lastUpdatedTimestamp: 0 };

  async function updateFees(): Promise<void> {
    const fees = await estimateFeesPerGas(client, args);
    // @ts-ignore
    feeRef.fees = fees;
    feeRef.lastUpdatedTimestamp = Date.now();
  }

  setInterval(updateFees, refreshInterval);
  await updateFees();

  return feeRef;
}
