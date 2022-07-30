const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const shouldSendTxn = true

async function getArbValues(signer) {
  const opecRewardTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const xpcRewardTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const tokenDecimals = 18
  const monthlyEsOpecForXpc = expandDecimals(50 * 1000, 18)

  return { tokenDecimals, opecRewardTracker, xpcRewardTracker, monthlyEsOpecForXpc }
}

async function getAvaxValues(signer) {
  const opecRewardTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const xpcRewardTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660")
  const tokenDecimals = 18
  const monthlyEsOpecForXpc = expandDecimals(0, 18)

  return { tokenDecimals, opecRewardTracker, xpcRewardTracker, monthlyEsOpecForXpc }
}

function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

function toInt(value) {
  return parseInt(value.replaceAll(",", ""))
}

async function main() {
  const { tokenDecimals, opecRewardTracker, xpcRewardTracker, monthlyEsOpecForXpc } = await getValues()

  const stakedAmounts = {
    arbitrum: {
      opec: toInt("6,147,470"),
      esOpec: toInt("1,277,087")
    },
    avax: {
      opec: toInt("417,802"),
      esOpec: toInt("195,478")
    }
  }

  let totalStaked = 0
  for (const net in stakedAmounts) {
    stakedAmounts[net].total = stakedAmounts[net].opec + stakedAmounts[net].esOpec
    totalStaked += stakedAmounts[net].total
  }

  const totalEsOpecRewards = expandDecimals(100000, tokenDecimals)
  const secondsPerMonth = 28 * 24 * 60 * 60

  const opecRewardDistributor = await contractAt("RewardDistributor", await opecRewardTracker.distributor())

  const opecCurrentTokensPerInterval = await opecRewardDistributor.tokensPerInterval()
  const opecNextTokensPerInterval = totalEsOpecRewards.mul(stakedAmounts[network].total).div(totalStaked).div(secondsPerMonth)
  const opecDelta = opecNextTokensPerInterval.sub(opecCurrentTokensPerInterval).mul(10000).div(opecCurrentTokensPerInterval)

  console.log("opecCurrentTokensPerInterval", opecCurrentTokensPerInterval.toString())
  console.log("opecNextTokensPerInterval", opecNextTokensPerInterval.toString(), `${opecDelta.toNumber() / 100.00}%`)

  const xpcRewardDistributor = await contractAt("RewardDistributor", await xpcRewardTracker.distributor())

  const xpcCurrentTokensPerInterval = await xpcRewardDistributor.tokensPerInterval()
  const xpcNextTokensPerInterval = monthlyEsOpecForXpc.div(secondsPerMonth)

  console.log("xpcCurrentTokensPerInterval", xpcCurrentTokensPerInterval.toString())
  console.log("xpcNextTokensPerInterval", xpcNextTokensPerInterval.toString())

  if (shouldSendTxn) {
    await sendTxn(opecRewardDistributor.setTokensPerInterval(opecNextTokensPerInterval), "opecRewardDistributor.setTokensPerInterval")
    await sendTxn(xpcRewardDistributor.setTokensPerInterval(xpcNextTokensPerInterval), "xpcRewardDistributor.setTokensPerInterval")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
