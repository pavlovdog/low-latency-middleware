import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient } from "permissionless"
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico"
import { privateKeyToAccount } from "viem/accounts"
import { optimismSepolia } from "viem/chains"
import { createPublicClient, http } from "viem"

import { signerToSimpleSmartAccount } from "./account"
import { createMiddleware } from "./middleware"

import "dotenv/config"


const BUNDLER_URL = process.env.BUNDLER_URL as string;
const RPC_URL = process.env.RPC_URL as string;


export const publicClient = createPublicClient({
	transport: http(RPC_URL),
})

export const pimlicoBundlerClient = createPimlicoBundlerClient({
	transport: http(BUNDLER_URL),
	entryPoint: ENTRYPOINT_ADDRESS_V07,
})


const main = async () => {
    const simpleAccount = await signerToSimpleSmartAccount(publicClient, {
        signer: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    })

    const middleware = await createMiddleware(publicClient);

    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        chain: optimismSepolia,
        bundlerTransport: http(BUNDLER_URL),
        middleware,
    })

    console.log(`Smart account address: ${simpleAccount.address}`)

    const balance = await publicClient.getBalance({ address: simpleAccount.address });
    console.log(`Balance: ${balance} OP ETH`)

    const txHash = await smartAccountClient.sendTransaction({
        to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
    })

    console.log(`Transaction hash: ${txHash}`);
}


main()
