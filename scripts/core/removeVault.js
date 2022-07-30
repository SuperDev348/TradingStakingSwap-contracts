const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const usdg = await contractAt("USDG", "0x8b6AD321b1d4BCE9F25d0Ac092c3C1144c777C93")
  const vault = await contractAt("Vault", "0x050C08cdeEc2e081Eb0Bf5181AAA4D8FfC18A38f")

  await sendTxn(usdg.removeVault(vault.address), "usdg.removeVault")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
