const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const vault = await contractAt("Vault", "0x050C08cdeEc2e081Eb0Bf5181AAA4D8FfC18A38f")
  const usdg = await contractAt("USDG", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93")
  const xpc = await contractAt("XPC", "0xDE7A1DC9a73f22F9B628636539E2b8d2FE866069")

  const xpcManager = await contractAt("XpcManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  await sendTxn(xpc.setMinter(xpcManager.address, false), "xpc.setMinter")
  await sendTxn(usdg.removeVault(xpcManager.address), "usdg.removeVault")
  await sendTxn(vault.setManager(xpcManager.address, false), "vault.setManager")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
