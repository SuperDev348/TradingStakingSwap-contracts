const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }

  const account = "0x6eA748d14f28778495A3fBa3550a6CdfBbE555f9"
  const unstakeAmount = "79170000000000000000"

  const rewardRouter = await contractAt("RewardRouter", "0x1b8911995ee36F4F95311D1D9C1845fA18c56Ec6")
  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnOpec = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeOpecTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  // const gasLimit = 30000000

  // await sendTxn(feeOpecTracker.setHandler(wallet.address, true, { gasLimit }), "feeOpecTracker.setHandler")
  // await sendTxn(bonusOpecTracker.setHandler(wallet.address, true, { gasLimit }), "bonusOpecTracker.setHandler")
  // await sendTxn(stakedOpecTracker.setHandler(wallet.address, true, { gasLimit }), "stakedOpecTracker.setHandler")

  const stakedAmount = await stakedOpecTracker.stakedAmounts(account)
  console.log(`${account} staked: ${stakedAmount.toString()}`)
  console.log(`unstakeAmount: ${unstakeAmount.toString()}`)

  await sendTxn(feeOpecTracker.unstakeForAccount(account, bonusOpecTracker.address, unstakeAmount, account), "feeOpecTracker.unstakeForAccount")
  await sendTxn(bonusOpecTracker.unstakeForAccount(account, stakedOpecTracker.address, unstakeAmount, account), "bonusOpecTracker.unstakeForAccount")
  await sendTxn(stakedOpecTracker.unstakeForAccount(account, opec.address, unstakeAmount, account), "stakedOpecTracker.unstakeForAccount")

  await sendTxn(bonusOpecTracker.claimForAccount(account, account), "bonusOpecTracker.claimForAccount")

  const bnOpecAmount = await bnOpec.balanceOf(account)
  console.log(`bnOpecAmount: ${bnOpecAmount.toString()}`)

  await sendTxn(feeOpecTracker.stakeForAccount(account, account, bnOpec.address, bnOpecAmount), "feeOpecTracker.stakeForAccount")

  const stakedBnOpec = await feeOpecTracker.depositBalances(account, bnOpec.address)
  console.log(`stakedBnOpec: ${stakedBnOpec.toString()}`)

  const reductionAmount = stakedBnOpec.mul(unstakeAmount).div(stakedAmount)
  console.log(`reductionAmount: ${reductionAmount.toString()}`)
  await sendTxn(feeOpecTracker.unstakeForAccount(account, bnOpec.address, reductionAmount, account), "feeOpecTracker.unstakeForAccount")
  await sendTxn(bnOpec.burn(account, reductionAmount), "bnOpec.burn")

  const opecAmount = await opec.balanceOf(account)
  console.log(`opecAmount: ${opecAmount.toString()}`)

  await sendTxn(opec.burn(account, unstakeAmount), "opec.burn")
  const nextOpecAmount = await opec.balanceOf(account)
  console.log(`nextOpecAmount: ${nextOpecAmount.toString()}`)

  const nextStakedAmount = await stakedOpecTracker.stakedAmounts(account)
  console.log(`nextStakedAmount: ${nextStakedAmount.toString()}`)

  const nextStakedBnOpec = await feeOpecTracker.depositBalances(account, bnOpec.address)
  console.log(`nextStakedBnOpec: ${nextStakedBnOpec.toString()}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
