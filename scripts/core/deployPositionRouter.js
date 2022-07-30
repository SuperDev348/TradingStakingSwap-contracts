const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function deployOnArb() {
  // const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x4ee1Eeb3672Fa40aea2d139Fd035DC2A9C2a3247")
  const timelock = await contractAt("Timelock", await vault.gov()) //, signer
  const router = await contractAt("Router", "0x2ae13Ffb89d904968993A2bbA67c1Ae558176BFB") //, signer
  const weth = await contractAt("WETH", "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3")
  const referralStorage = await contractAt("ReferralStorage", "0xC3D18bABe73F1234A59783A5ca7FdEc43E2b2370")
  const depositFee = "30" // 0.3%
  const minExecutionFee = "300000000000000" // 0.0003 ETH

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, weth.address, depositFee, minExecutionFee], "PositionRouter", { gasLimit: 125000000 })
  // const positionRouter = await contractAt("PositionRouter", "0x338fF5b9d64484c8890704a76FE7166Ed7d3AEAd")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
}

async function deployOnAvax() {
  // const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x4ee1Eeb3672Fa40aea2d139Fd035DC2A9C2a3247")
  const timelock = await contractAt("Timelock", await vault.gov())
  const router = await contractAt("Router", "0x2ae13Ffb89d904968993A2bbA67c1Ae558176BFB") //, signer
  const weth = await contractAt("WETH", "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3")
  const referralStorage = await contractAt("ReferralStorage", "0xC3D18bABe73F1234A59783A5ca7FdEc43E2b2370")
  const depositFee = "30" // 0.3%
  const minExecutionFee = "17000000000000000" // 0.017 AVAX

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, weth.address, depositFee, minExecutionFee])
  // const positionRouter = await contractAt("PositionRouter", "0xc5BBc613f4617eE4F7E89320081182024F86bd6B")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
}

async function main() {
  if (network === "avax") {
    await deployOnAvax()
    return
  }

  await deployOnArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
