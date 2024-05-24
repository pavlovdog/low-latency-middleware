import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient } from "permissionless"
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico"
import { privateKeyToAccount } from "viem/accounts"
import { optimismSepolia } from "viem/chains"
import { createPublicClient, http } from "viem"

import { signerToSimpleSmartAccount } from "./account"
import { createMiddleware } from "./middleware"


const BUNDLER_URL = "http://0.0.0.0:3000"
const RPC_URL = "https://sepolia.optimism.io"


export const publicClient = createPublicClient({
	transport: http(RPC_URL),
})

export const pimlicoBundlerClient = createPimlicoBundlerClient({
	transport: http(BUNDLER_URL),
	entryPoint: ENTRYPOINT_ADDRESS_V07,
})

const main = async () => {
    const simpleAccount = await signerToSimpleSmartAccount(publicClient, {
        signer: privateKeyToAccount("0x99f41c42cb720b667a0ea93093c20ce315da41e1b21cc301b56fd35f859c1fa6"),
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    })

    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        chain: optimismSepolia,
        bundlerTransport: http(BUNDLER_URL),
        middleware: {
            gasPrice: async () => (await pimlicoBundlerClient.getUserOperationGasPrice()).fast, // if using pimlico bundler
        }
    })

    console.log(`Smart account address: ${simpleAccount.address}`)

    const balance = await publicClient.getBalance({ address: simpleAccount.address });
    console.log(`Balance: ${balance} OP ETH`)

    // await delay(10000);

    const txHash = await smartAccountClient.sendTransaction({
        to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    })

    console.log(`Transaction hash: ${txHash}`);
}

main().catch(console.error)