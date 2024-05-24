import { EstimateFeesPerGasParameters, Client, EstimateFeesPerGasReturnType, getContract, encodeAbiParameters, getAddress, Hex, Hash, toBytes, concat, pad, toHex, bytesToHex, getAbiItem, toFunctionSelector, serializeTransaction, maxUint64 } from "viem";
import { estimateFeesPerGas } from "viem/actions";
import { GAS_PRICE_ORACLE } from "./addresses";
import { ENTRYPOINT_V07_ABI, GAS_PRICE_ORACLE_ABI } from "./abis";
import { ENTRYPOINT_ADDRESS_V07, UserOperation } from "permissionless";
import { z } from "zod"
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";

export type CreateGasRefOptions = {
  client: Client;
  refreshInterval: number;
};

export type GasRef = {
    baseFeeScalar: bigint;
    baseFee: bigint;
    blobBaseFeeScalar: bigint;
    blobBaseFee: bigint;
    lastUpdatedTimestamp: number;
};



/** Update fee values once every `refreshInterval` instead of right before every request */
export async function createGasRef({ client, refreshInterval }: CreateGasRefOptions): Promise<GasRef> {
    const gasRef: GasRef = {
        baseFeeScalar: 0n,
        baseFee: 0n,
        blobBaseFeeScalar: 0n,
        blobBaseFee: 0n,
        lastUpdatedTimestamp: 0
    };

    const gasPriceOracle = getContract({
        address: GAS_PRICE_ORACLE,
        abi: GAS_PRICE_ORACLE_ABI,
        client
    })

    async function updateGas(): Promise<void> {
        // TODO: implement multicall
        const [
            baseFeeScalar,
            baseFee,
            blobBaseFeeScalar,
            blobBaseFee,
        ] = await Promise.all([
            gasPriceOracle.read.baseFeeScalar(),
            gasPriceOracle.read.baseFee(),
            gasPriceOracle.read.blobBaseFeeScalar(),
            gasPriceOracle.read.blobBaseFee(),
        ])

        gasRef.baseFeeScalar = BigInt(baseFeeScalar as number);
        gasRef.baseFee = BigInt(baseFee as number);
        gasRef.blobBaseFeeScalar = BigInt(blobBaseFeeScalar as number);
        gasRef.blobBaseFee = BigInt(blobBaseFee as number);

        gasRef.lastUpdatedTimestamp = Date.now();
    }

    setInterval(updateGas, refreshInterval);
    await updateGas();

    return gasRef;
}


