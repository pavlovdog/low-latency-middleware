import { PublicClient } from "viem";
import { createFeeRef } from "./utils/createFeeRef"
import { UserOperation } from "permissionless";
import { EntryPoint } from "permissionless/types";
import { createGasRef } from "./utils/createGasRef";
import { calculatePerVerificationGas } from "./utils/preVerificationGas";


const CALL_GAS_LIMIT = 80_000n;
const VERIFICATION_GAS_LIMIT = 350_000n;


export const createMiddleware = async (publicClient: PublicClient) => {
    const feeRef = await createFeeRef({
        refreshInterval: 1000,
        client: publicClient,
    });

    const gasRef = await createGasRef({
        refreshInterval: 1000,
        client: publicClient,
    })

    const chainId = await publicClient.getChainId();

    return async (args: {
        userOperation: UserOperation<'v0.7'>,
        entryPoint: EntryPoint
    }): Promise<UserOperation<'v0.7'>> => {
        const { userOperation } = args;

        // Calculate preVerificationGas, based on the l1 fees
        userOperation.preVerificationGas = calculatePerVerificationGas(
            userOperation,
            chainId,
            gasRef
        );

        // Get verificationGasLimit and callGasLimit
        // TODO: pre-load initial values instead of hardcode
        userOperation.callGasLimit = CALL_GAS_LIMIT;
        userOperation.verificationGasLimit = VERIFICATION_GAS_LIMIT;

        userOperation.maxFeePerGas = feeRef.fees.maxFeePerGas;
        userOperation.maxPriorityFeePerGas = feeRef.fees.maxPriorityFeePerGas;

        // TODO: integrate paymaster
        userOperation.paymasterVerificationGasLimit = 0n;
        userOperation.paymasterPostOpGasLimit = 0n;

        return userOperation;
    }
}