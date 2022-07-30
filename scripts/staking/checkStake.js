const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }

  const account = "0x9f169c2189A2d975C18965DE985936361b4a9De9"

  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnOpec = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeOpecTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  console.log("stakedOpecTracker.claimable", (await stakedOpecTracker.claimable(account)).toString())
  console.log("bonusOpecTracker.claimable", (await bonusOpecTracker.claimable(account)).toString())
  console.log("feeOpecTracker.claimable", (await feeOpecTracker.claimable(account)).toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
