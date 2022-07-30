const { deployContract, contractAt , sendTxn, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const { nativeToken } = tokens

  const orderBook = await deployContract("OrderBook", []);

  // Arbitrum mainnet addresses
  await sendTxn(orderBook.initialize(
    "0x2ae13Ffb89d904968993A2bbA67c1Ae558176BFB", // router
    "0x4ee1Eeb3672Fa40aea2d139Fd035DC2A9C2a3247", // vault
    nativeToken.address, // weth
    "0xc2512D2D48d67436D843443607C1F59856F24731", // usdg
    "10000000000000000", // 0.01 AVAX
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");

  writeTmpAddresses({
    orderBook: orderBook.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
