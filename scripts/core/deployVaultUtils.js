const { getFrameSigner, deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const signer = await getFrameSigner()
  const vault = await contractAt("Vault", "0x050C08cdeEc2e081Eb0Bf5181AAA4D8FfC18A38f")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await sendTxn(timelock.setVaultUtils(vault.address, vaultUtils.address), "timelock.setVaultUtils")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
