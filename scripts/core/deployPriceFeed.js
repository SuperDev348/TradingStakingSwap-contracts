const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

// TODO: call setSpreadBasisPoints for tokens
async function deployPriceFeedArb() {
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]
  const fastPriceTokens = [btc, eth, link, uni]
  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  // const signer = await getFrameSigner()

  const timelock = { address: "0x1e0FD2CC7329Ddf6bDA35f85579E1bC2996dB0d9" }
  const fastPriceFeedGov = { address: "0x99286B99f68f54e7797cB9C10133768e687DCcFF" }

  const updater1 = { address: "0x99286B99f68f54e7797cB9C10133768e687DCcFF" }
  const keeper1 = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const updaters = [updater1.address, keeper1.address]

  const signers = ["0x99286B99f68f54e7797cB9C10133768e687DCcFF"]
  const tokenManager = { address: "0x86ea5b808035cDfc6aD992ea51Fb7FAAdeDAeC2E" }

  const positionRouter = await contractAt("PositionRouter", "0x170A4C49928779b7E1096444a31db4D01993047a")

  // const fastPriceEvents = await contractAt("FastPriceEvents", "0x4530b7DE1958270A2376be192a24175D795e1b07", signer)
  const fastPriceEvents = await deployContract("FastPriceEvents", [])

  const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const secondaryPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    0, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    tokenManager.address, // _tokenManager
    positionRouter.address // _positionRouter
  ])

  await sendTxn(secondaryPriceFeed.initialize(1, signers, updaters), "secondaryPriceFeed.initialize")
  await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")

  await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")

  await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")
  await sendTxn(vaultPriceFeed.setChainlinkFlags(chainlinkFlags.address), "vaultPriceFeed.setChainlinkFlags")

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
}

async function deployPriceFeedAvax() {
  const { avax, btc, eth, mim, usdce, usdc } = tokens
  const tokenArr = [avax, btc, eth, mim, usdce, usdc]
  const fastPriceTokens = [avax, btc, eth]
  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  // const signer = await getFrameSigner()

  const timelock = { address: "0xfec6FA94aF7BF1Ec917550426F6785aeee898814" }
  const fastPriceFeedGov = { address: "0x99286B99f68f54e7797cB9C10133768e687DCcFF" }

  const updater1 = { address: "0x99286B99f68f54e7797cB9C10133768e687DCcFF" }
  const keeper1 = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const updaters = [updater1.address, keeper1.address]

  const signers = ["0x99286B99f68f54e7797cB9C10133768e687DCcFF"]
  const tokenManager = { address: "0x86ea5b808035cDfc6aD992ea51Fb7FAAdeDAeC2E" }

  const positionRouter = await contractAt("PositionRouter", "0x170A4C49928779b7E1096444a31db4D01993047a")

  const fastPriceEvents = await deployContract("FastPriceEvents", [])

  const secondaryPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    0, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    tokenManager.address, // _tokenManager
    positionRouter.address
  ])

  await sendTxn(secondaryPriceFeed.initialize(1, signers, updaters), "secondaryPriceFeed.initialize")
  await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")

  await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")

  await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
}

async function main() {
  if (network === "avax") {
    await deployPriceFeedAvax()
    return
  }

  await deployPriceFeedArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
