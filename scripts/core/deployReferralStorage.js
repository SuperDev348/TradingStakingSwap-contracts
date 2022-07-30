const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const positionRouter = await contractAt("PositionRouter", "0x170A4C49928779b7E1096444a31db4D01993047a")
  const positionManager = await contractAt("PositionManager", "0x63EA88cA6941Cdd430322F48c342e08601e49BAE")

  return { positionRouter, positionManager }
}

async function getAvaxValues() {
  const positionRouter = await contractAt("PositionRouter", "0x170A4C49928779b7E1096444a31db4D01993047a")
  const positionManager = await contractAt("PositionManager", "0x63EA88cA6941Cdd430322F48c342e08601e49BAE")

  return { positionRouter, positionManager }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { positionRouter, positionManager } = await getValues()
  // const referralStorage = await deployContract("ReferralStorage", [])
  const referralStorage = await contractAt("ReferralStorage", await positionRouter.referralStorage())

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(positionManager.setReferralStorage(referralStorage.address), "positionManager.setReferralStorage")

  // await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
