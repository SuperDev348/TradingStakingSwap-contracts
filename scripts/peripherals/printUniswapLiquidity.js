const { contractAt } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")
const { Token } = require('@uniswap/sdk-core')
const { tickToPrice, Pool, Position } = require('@uniswap/v3-sdk')

const UniNftManager = require("../../artifacts/contracts/amm/UniNftManager.sol/UniNftManager.json")

async function main() {
  const MAX_UINT128 = bigNumberify(2).pow(128).sub(1)
  const nftManager = await contractAt("UniNftManager", "0xC36442b4a4522E871399CD717aBDD847Ab11FE88")

  const uniPool = await contractAt("UniPool", "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E")
  const weth = new Token(42161, "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", 18, "SYMBOL", "NAME")
  const opec = new Token(42161, "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", 18, "SYMBOL", "NAME")

  const poolInfo = await uniPool.slot0()

  const pool = new Pool(
    weth, // weth
    opec, // opec
    10000, // fee
    poolInfo.sqrtPriceX96, // sqrtRatioX96
    1, // liquidity
    poolInfo.tick, // tickCurrent
    []
  )

  const nftIds = [33985, 566, 16, 17, 18, 19, 20, 21, 22, 2726, 16797, 16809, 16810, 17079, 17080, 24729, 25035, 25921, 31374, 34143]

  console.log("NFT ID,Start (ETH),End (ETH),ETH Liquidity, OPEC Liquidity")
  for (let i = 0; i < nftIds.length; i++) {
    const nftId = nftIds[i]
    const owner = await nftManager.ownerOf(nftId)
    const positionInfo = await nftManager.positions(nftId)
    const position = new Position({ pool, liquidity: positionInfo.liquidity.toString(), tickLower: positionInfo.tickLower, tickUpper: positionInfo.tickUpper })
    const start = tickToPrice(opec, weth, positionInfo.tickUpper).toSignificant(6)
    const end = tickToPrice(opec, weth, positionInfo.tickLower).toSignificant(6)
    const ethLiquidity = position.amount0.toSignificant(6)
    const opecLiquidity = position.amount1.toSignificant(6)

    console.log(`${nftId},${start},${end},${ethLiquidity},${opecLiquidity}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
