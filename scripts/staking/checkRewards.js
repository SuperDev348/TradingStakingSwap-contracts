const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function getDistributor(rewardTracker) {
  const distributorAddress = await rewardTracker.distributor()
  return await contractAt("RewardDistributor", distributorAddress)
}

async function printDistributorBalance(token, distributor, label) {
  const balance = await token.balanceOf(distributor.address)
  const pendingRewards = await distributor.pendingRewards()
  console.log(
    label,
    ethers.utils.formatUnits(balance, 18),
    ethers.utils.formatUnits(pendingRewards, 18),
    balance.gte(pendingRewards) ? "sufficient-balance" : "insufficient-balance",
    ethers.utils.formatUnits(balance.sub(pendingRewards), 18)
  )
}

async function main() {
  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esOpec = await contractAt("EsOpec", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnOpec = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const weth = await contractAt("Token", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7")

  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const stakedOpecDistributor = await getDistributor(stakedOpecTracker)

  const bonusOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const bonusOpecDistributor = await getDistributor(bonusOpecTracker)

  const feeOpecTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  const feeOpecDistributor = await getDistributor(feeOpecTracker)

  const stakedXpcTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const stakedXpcDistributor = await getDistributor(stakedXpcTracker)

  const feeXpcTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const feeXpcDistributor = await getDistributor(feeXpcTracker)

  await printDistributorBalance(esOpec, stakedOpecDistributor, "esOpec in stakedOpecDistributor:")
  await printDistributorBalance(bnOpec, bonusOpecDistributor, "bnOpec in bonusOpecDistributor:")
  await printDistributorBalance(weth, feeOpecDistributor, "weth in feeOpecDistributor:")
  await printDistributorBalance(esOpec, stakedXpcDistributor, "esOpec in stakedXpcDistributor:")
  await printDistributorBalance(weth, feeXpcDistributor, "esOpec in feeXpcDistributor:")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
