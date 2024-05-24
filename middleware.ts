import { PublicClient } from "viem";
import { createFeeRef } from "./utils/createFeeRef"
import { ENTRYPOINT_ADDRESS_V07, UserOperation, estimateUserOperationGas } from "permissionless";
import { ENTRYPOINT_ADDRESS_V07_TYPE, EntryPoint } from "permissionless/types";
import { createGasRef } from "./utils/createGasRef";
import { calculatePerVerificationGas } from "./utils/preVerificationGas";
import { getAction } from "viem/utils";
import { PimlicoBundlerClient } from "permissionless/clients/pimlico";



export const createMiddleware = async (
    publicClient: PublicClient,
    bundlerClient: PimlicoBundlerClient<ENTRYPOINT_ADDRESS_V07_TYPE>
) => {
    const feeRef = await createFeeRef({
        refreshInterval: 1000,
        client: publicClient,
    });

    const gasRef = await createGasRef({
        refreshInterval: 1000,
        client: publicClient,
    })

    const chainId = await publicClient.getChainId();

    let callGasLimit = 0n;
    let verificationGasLimit = 0n;

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

        // Get verificationGasLimit and callGasLimit once
        if (verificationGasLimit === 0n || callGasLimit === 0n) {
            const gasParameters = await getAction(
                bundlerClient,
                estimateUserOperationGas<ENTRYPOINT_ADDRESS_V07_TYPE>,
                "estimateUserOperationGas"
            )(
                {
                    userOperation,
                    entryPoint: ENTRYPOINT_ADDRESS_V07
                },
            )
    
            verificationGasLimit = gasParameters.verificationGasLimit;
            callGasLimit = gasParameters.callGasLimit;
        }

        userOperation.callGasLimit = callGasLimit;
        userOperation.verificationGasLimit = verificationGasLimit;

        userOperation.maxFeePerGas = feeRef.fees.maxFeePerGas;
        userOperation.maxPriorityFeePerGas = feeRef.fees.maxPriorityFeePerGas;

        // TODO: integrate paymaster if necessary
        userOperation.paymasterVerificationGasLimit = 0n;
        userOperation.paymasterPostOpGasLimit = 0n;

        return userOperation;
    }
}