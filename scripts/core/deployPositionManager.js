const { getFrameSigner, deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

const depositFee = 30 // 0.3%

// TODO: set referral storage
async function getArbValues() {
  // const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x4ee1Eeb3672Fa40aea2d139Fd035DC2A9C2a3247")
  // const timelock = await contractAt("Timelock", await vault.gov(), signer)
  // const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", signer)
  const timelock = await contractAt("Timelock", await vault.gov())
  const router = await contractAt("Router", "0x2ae13Ffb89d904968993A2bbA67c1Ae558176BFB")
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const orderBook = await contractAt("OrderBook", "0xEC72821Fe300A2E2C1C60E50f7db6f4A5C029f55")

  const orderKeeper = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const liquidator = { address: "0xAF4d9dB0A5BfB5a6BF9c72906d24612B53f3D0c2" }

  // const partnerContracts = [
  //   "0x9ba57a1D3f6C61Ff500f598F16b97007EB02E346", // Vovo ETH up vault
  //   "0x5D8a5599D781CC50A234D73ac94F4da62c001D8B", // Vovo ETH down vault
  //   "0xE40bEb54BA00838aBE076f6448b27528Dd45E4F0", // Vovo BTC up vault
  //   "0x1704A75bc723A018D176Dc603b0D1a361040dF16", // Vovo BTC down vault
  // ]

  // const partnerContracts = [
  //   "0xbFbEe90E2A96614ACe83139F41Fa16a2079e8408", // Vovo XPC ETH up vault
  //   "0x0FAE768Ef2191fDfCb2c698f691C49035A53eF0f", // Vovo XPC ETH down vault
  //   "0x2b8E28667A29A5Ab698b82e121F2b9Edd9271e93", // Vovo XPC BTC up vault
  //   "0x46d6dEE922f1d2C6421895Ba182120C784d986d3", // Vovo XPC BTC down vault
  // ]

  const partnerContracts = [
    "0xC8d6d21995E00e17c5aaF07bBCde43f0ccd12725", // Jones ETH Hedging
    "0xe36fA7dC99658C9B7E247471261b65A88077D349", // Jones gOHM Hedging
    "0xB9bd050747357ce1fF4eFD314012ca94C07543E6", // Jones DPX Hedging
    "0xe98f68F3380c990D3045B4ae29f3BCa0F3D02939", // Jones rDPX Hedging
  ]

  return { vault, timelock, router, weth, depositFee, orderBook, orderKeeper, liquidator, partnerContracts }
}

async function getAvaxValues() {
  // const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x4ee1Eeb3672Fa40aea2d139Fd035DC2A9C2a3247")
  // const timelock = await contractAt("Timelock", await vault.gov(), signer)
  // const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", signer)
  const timelock = await contractAt("Timelock", await vault.gov())
  const router = await contractAt("Router", "0x2ae13Ffb89d904968993A2bbA67c1Ae558176BFB")
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const orderBook = await contractAt("OrderBook", "0xEC72821Fe300A2E2C1C60E50f7db6f4A5C029f55")

  const orderKeeper = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const liquidator = { address: "0xAF4d9dB0A5BfB5a6BF9c72906d24612B53f3D0c2" }

  const partnerContracts = []

  return { vault, timelock, router, weth, depositFee, orderBook, orderKeeper, liquidator, partnerContracts }
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
  const { vault, timelock, router, weth, depositFee, orderBook, orderKeeper, liquidator, partnerContracts } = await getValues()

  const positionManager = await deployContract("PositionManager", [vault.address, router.address, weth.address, depositFee, orderBook.address])
  // const positionManager = await contractAt("PositionManager", "0x87a4088Bd721F83b6c2E5102e2FA47022Cb1c831")
  // await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)")
  // await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)")
  // await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionRouter)")
  // await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
  // await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")

  for (let i = 0; i < partnerContracts.length; i++) {
    const partnerContract = partnerContracts[i]
    await sendTxn(positionManager.setPartner(partnerContract, true), "positionManager.setPartner(partnerContract)")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
