const { deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'testnet');
const tokens = require('./tokens')[network];
async function main() {
  const { nativeToken } = tokens
  const vault = await deployContract("Vault", [])
  // const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const usdg = await deployContract("USDG", [vault.address])
  // const usdg = await contractAt("USDG", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93")
  const router = await deployContract("Router", [vault.address, usdg.address, nativeToken.address])
  // const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064")
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x30333ce00ac3025276927672aaefd80f22e89e54")
  // const secondaryPriceFeed = await deployContract("FastPriceFeed", [5 * 60])

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  const xpc = await deployContract("XPC", [])
  await sendTxn(xpc.setInPrivateTransferMode(true), "xpc.setInPrivateTransferMode")
  // const xpc = await contractAt("XPC", "0xDE7A1DC9a73f22F9B628636539E2b8d2FE866069")
  const xpcManager = await deployContract("XpcManager", [vault.address, usdg.address, xpc.address, 15 * 60])
  await sendTxn(xpcManager.setInPrivateMode(true), "xpcManager.setInPrivateMode")

  await sendTxn(xpc.setMinter(xpcManager.address, true), "xpc.setMinter")
  await sendTxn(usdg.addVault(xpcManager.address), "usdg.addVault(xpcManager)")

  await sendTxn(vault.initialize(
    router.address, // router
    usdg.address, // usdg
    vaultPriceFeed.address, // priceFeed
    toUsd(2), // liquidationFeeUsd
    100, // fundingRateFactor
    100 // stableFundingRateFactor
  ), "vault.initialize")

  await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")

  await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
  await sendTxn(vault.setManager(xpcManager.address, true), "vault.setManager")

  await sendTxn(vault.setFees(
    10, // _taxBasisPoints
    5, // _stableTaxBasisPoints
    20, // _mintBurnFeeBasisPoints
    20, // _swapFeeBasisPoints
    1, // _stableSwapFeeBasisPoints
    10, // _marginFeeBasisPoints
    toUsd(2), // _liquidationFeeUsd
    24 * 60 * 60, // _minProfitTime
    true // _hasDynamicFees
  ), "vault.setFees")

  const vaultErrorController = await deployContract("VaultErrorController", [])
  await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
  await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")

  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
