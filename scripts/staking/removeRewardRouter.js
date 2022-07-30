const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const rewardRouter = await contractAt("RewardRouter", "0xEa7fCb85802713Cb03291311C66d6012b23402ea")
  const bnOpec = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const xpcManager = await contractAt("XpcManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeOpecTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeXpcTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedXpcTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  // allow rewardRouter to stake in stakedOpecTracker
  await sendTxn(stakedOpecTracker.setHandler(rewardRouter.address, false), "stakedOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusOpecTracker
  await sendTxn(bonusOpecTracker.setHandler(rewardRouter.address, false), "bonusOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeOpecTracker
  await sendTxn(feeOpecTracker.setHandler(rewardRouter.address, false), "feeOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnOpec
  await sendTxn(bnOpec.setMinter(rewardRouter.address, false), "bnOpec.setMinter(rewardRouter)")

  // allow rewardRouter to mint in xpcManager
  await sendTxn(xpcManager.setHandler(rewardRouter.address, false), "xpcManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeXpcTracker
  await sendTxn(feeXpcTracker.setHandler(rewardRouter.address, false), "feeXpcTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedXpcTracker
  await sendTxn(stakedXpcTracker.setHandler(rewardRouter.address, false), "stakedXpcTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
