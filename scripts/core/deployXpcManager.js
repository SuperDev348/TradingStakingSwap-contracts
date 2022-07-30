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

  const xpcManager = await deployContract("XpcManager", [vault.address, usdg.address, xpc.address, 15 * 60])

  await sendTxn(xpcManager.setInPrivateMode(true), "xpcManager.setInPrivateMode")

  await sendTxn(xpc.setMinter(xpcManager.address, true), "xpc.setMinter")
  await sendTxn(usdg.addVault(xpcManager.address), "usdg.addVault")
  await sendTxn(vault.setManager(xpcManager.address, true), "vault.setManager")

  writeTmpAddresses({
    xpcManager: xpcManager.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
