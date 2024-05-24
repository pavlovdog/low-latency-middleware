import { EstimateFeesPerGasParameters, Client, EstimateFeesPerGasReturnType, getContract, encodeAbiParameters, getAddress, Hex, Hash, toBytes, concat, pad, toHex, bytesToHex, getAbiItem, toFunctionSelector, serializeTransaction, maxUint64 } from "viem";
import { estimateFeesPerGas } from "viem/actions";
import { GAS_PRICE_ORACLE } from "./addresses";
import { ENTRYPOINT_V07_ABI, GAS_PRICE_ORACLE_ABI } from "./abis";
import { ENTRYPOINT_ADDRESS_V07, UserOperation } from "permissionless";
import { z } from "zod"
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";
import { GasRef } from "./createGasRef";


const hexDataPattern = /^0x[0-9A-Fa-f]*$/
const addressPattern = /^0x[0-9,a-f,A-F]{40}$/
export const hexData32Pattern = /^0x([0-9a-fA-F][0-9a-fA-F]){0,32}$/
export const commaSeperatedAddressPattern =
    /^(0x[0-9a-fA-F]{40})(,\s*(0x[0-9a-fA-F]{40}))*$/

const addressSchema = z
    .string()
    .regex(addressPattern, { message: "not a valid hex address" })
    .transform((val) => getAddress(val))
export const hexNumberSchema = z
    .string()
    .regex(hexDataPattern)
    .or(z.number())
    .or(z.bigint())
    .transform((val) => BigInt(val))
const hexDataSchema = z
    .string()
    .regex(hexDataPattern, { message: "not valid hex data" })
    .transform((val) => val as Hex)
const hexData32Schema = z
    .string()
    .regex(hexData32Pattern, { message: "not valid 32-byte hex data" })
    .transform((val) => val as Hash)

const packerUserOperationSchema = z
    .object({
        sender: addressSchema,
        nonce: hexNumberSchema,
        initCode: hexDataSchema,
        callData: hexDataSchema,
        accountGasLimits: hexData32Schema,
        preVerificationGas: hexNumberSchema,
        gasFees: hexData32Schema,
        paymasterAndData: hexDataSchema,
        signature: hexDataSchema
    })
    .strict()
    .transform((val) => val)

export type PackedUserOperation = z.infer<typeof packerUserOperationSchema>

const ov = {
    fixed: 21000,
    perUserOp: 18300,
    perUserOpWord: 4,
    zeroByte: 4,
    nonZeroByte: 16,
    bundleSize: 1,
    sigSize: 65
};

export function calculatePerVerificationGas(
    userOperation: UserOperation<'v0.7'>,
    chainId: number,
    gasRef: GasRef
): bigint {
    const defaultPreVerificationGas = calcDefaultPreVerificationGas(userOperation);

    const preVerificationGas = calcOptimismPreVerificationGas(
        userOperation,
        chainId,
        gasRef,
        defaultPreVerificationGas
    );

    return preVerificationGas * 120n / 100n;
}



export function calcOptimismPreVerificationGas(
    userOperation: UserOperation<'v0.7'>,
    chainId: number,
    gasRef: GasRef,
    defaultPreVerificationGas: bigint
): bigint {
    const randomDataUserOp: PackedUserOperation = removeZeroBytesFromUserOp(userOperation)

    const handleOpsAbi = getAbiItem({
        abi: ENTRYPOINT_V07_ABI,
        name: "handleOps"
    })

    const selector = toFunctionSelector(handleOpsAbi)
    const paramData = encodeAbiParameters(handleOpsAbi.inputs, [
        [randomDataUserOp],
        ENTRYPOINT_ADDRESS_V07
    ])

    const data = concat([selector, paramData])

    const serializedTx = serializeTransaction(
        {
            to: ENTRYPOINT_ADDRESS_V07,
            chainId,
            nonce: 999999,
            gasLimit: maxUint64,
            gasPrice: maxUint64,
            data
        },
        {
            r: "0x123451234512345123451234512345123451234512345123451234512345",
            s: "0x123451234512345123451234512345123451234512345123451234512345",
            v: 28n
        }
    )

    // function _getL1FeeEcotone(bytes memory _data) internal view returns (uint256) {
    //     uint256 l1GasUsed = _getCalldataGas(_data);
    //     uint256 scaledBaseFee = baseFeeScalar() * 16 * l1BaseFee();
    //     uint256 scaledBlobBaseFee = blobBaseFeeScalar() * blobBaseFee();
    //     uint256 fee = l1GasUsed * (scaledBaseFee + scaledBlobBaseFee);
    //     return fee / (16 * 10 ** DECIMALS);
    // }
    // function _getCalldataGas(bytes memory _data) internal pure returns (uint256) {
    //     uint256 total = 0;
    //     uint256 length = _data.length;
    //     for (uint256 i = 0; i < length; i++) {
    //         if (_data[i] == 0) {
    //             total += 4;
    //         } else {
    //             total += 16;
    //         }
    //     }
    //     return total + (68 * 16);
    // }

    const l1GasUsed = toBytes(serializedTx)
        .map((x) => (x === 0 ? 4 : 16))
        .reduce((sum, x) => sum + x) + 68 * 16;
    const scaledBaseFee = gasRef.baseFeeScalar * 16n * gasRef.baseFee;
    const scaledBlobBaseFee = gasRef.blobBaseFeeScalar * gasRef.blobBaseFee;
    const l1DataFee = BigInt(l1GasUsed) * (scaledBaseFee + scaledBlobBaseFee) / (16n * 10n ** 6n);

    const l2price: bigint = userOperation.maxFeePerGas

    return defaultPreVerificationGas + l1DataFee / l2price
}


export function calcDefaultPreVerificationGas(
    userOperation: UserOperation<'v0.7'>,
): bigint {
    const p: PackedUserOperation = removeZeroBytesFromUserOp(userOperation)

    const packed = toBytes(packUserOpV07(p as PackedUserOperation))

    const lengthInWord = (packed.length + 31) / 32
    const callDataCost = packed
        .map((x) => (x === 0 ? ov.zeroByte : ov.nonZeroByte))
        .reduce((sum, x) => sum + x)
    const ret = Math.round(
        callDataCost +
            ov.fixed / ov.bundleSize +
            ov.perUserOp +
            ov.perUserOpWord * lengthInWord
    )

    return BigInt(ret)
}

export function getInitCode(unpackedUserOperation: UserOperation<'v0.7'>) {
    return unpackedUserOperation.factory
        ? concat([
              unpackedUserOperation.factory,
              unpackedUserOperation.factoryData || ("0x" as Hex)
          ])
        : "0x"
}

export function getAccountGasLimits(unpackedUserOperation: UserOperation<'v0.7'>) {
    return concat([
        pad(toHex(unpackedUserOperation.verificationGasLimit), {
            size: 16
        }),
        pad(toHex(unpackedUserOperation.callGasLimit), { size: 16 })
    ])
}

export function getGasLimits(unpackedUserOperation: UserOperation<'v0.7'>) {
    return concat([
        pad(toHex(unpackedUserOperation.maxPriorityFeePerGas), {
            size: 16
        }),
        pad(toHex(unpackedUserOperation.maxFeePerGas), { size: 16 })
    ])
}

export function getPaymasterAndData(unpackedUserOperation: UserOperation<'v0.7'>) {
    return unpackedUserOperation.paymaster
        ? concat([
              unpackedUserOperation.paymaster,
              pad(
                  toHex(
                      unpackedUserOperation.paymasterVerificationGasLimit || 0n
                  ),
                  {
                      size: 16
                  }
              ),
              pad(toHex(unpackedUserOperation.paymasterPostOpGasLimit || 0n), {
                  size: 16
              }),
              unpackedUserOperation.paymasterData || ("0x" as Hex)
          ])
        : "0x"
}



export function toPackedUserOperation(
    unpackedUserOperation: UserOperation<'v0.7'>
): PackedUserOperation {
    return {
        sender: unpackedUserOperation.sender,
        nonce: unpackedUserOperation.nonce,
        initCode: getInitCode(unpackedUserOperation),
        callData: unpackedUserOperation.callData,
        accountGasLimits: getAccountGasLimits(unpackedUserOperation),
        preVerificationGas: unpackedUserOperation.preVerificationGas,
        gasFees: getGasLimits(unpackedUserOperation),
        paymasterAndData: getPaymasterAndData(unpackedUserOperation),
        signature: unpackedUserOperation.signature
    }
}


export function removeZeroBytesFromUserOp(
    userOpearation: UserOperation<'v0.7'>
): PackedUserOperation {
    const packedUserOperation: PackedUserOperation = toPackedUserOperation(userOpearation)

    return {
        sender: packedUserOperation.sender,
        nonce: BigInt(
            "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
        ),
        initCode: packedUserOperation.initCode,
        callData: packedUserOperation.callData,
        accountGasLimits: bytesToHex(new Uint8Array(32).fill(255)),
        preVerificationGas: BigInt(
            "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
        ),
        gasFees: bytesToHex(new Uint8Array(32).fill(255)),
        paymasterAndData: bytesToHex(
            new Uint8Array(packedUserOperation.paymasterAndData.length).fill(
                255
            )
        ),
        signature: bytesToHex(
            new Uint8Array(packedUserOperation.signature.length).fill(255)
        )
    }
}


export function packUserOpV07(op: PackedUserOperation): `0x${string}` {
    return encodeAbiParameters(
        [
            {
                internalType: "address",
                name: "sender",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "nonce",
                type: "uint256"
            },
            {
                internalType: "bytes",
                name: "initCode",
                type: "bytes"
            },
            {
                internalType: "bytes",
                name: "callData",
                type: "bytes"
            },
            {
                internalType: "uint256",
                name: "accountGasLimits",
                type: "bytes32"
            },
            {
                internalType: "uint256",
                name: "preVerificationGas",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "gasFees",
                type: "bytes32"
            },
            {
                internalType: "bytes",
                name: "paymasterAndData",
                type: "bytes"
            },
            {
                internalType: "bytes",
                name: "signature",
                type: "bytes"
            }
        ],
        [
            op.sender,
            op.nonce, // need non zero bytes to get better estimations for preVerificationGas
            op.initCode,
            op.callData,
            op.accountGasLimits, // need non zero bytes to get better estimations for preVerificationGas
            op.preVerificationGas, // need non zero bytes to get better estimations for preVerificationGas
            op.gasFees, // need non zero bytes to get better estimations for preVerificationGas
            op.paymasterAndData,
            op.signature
        ]
    )
}