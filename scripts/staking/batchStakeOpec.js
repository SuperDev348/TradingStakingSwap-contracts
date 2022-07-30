const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const stakeOpecList = require("../../data/opecMigration/stakeOpecList6.json")

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const rewardRouter = await contractAt("RewardRouter", "0xc73d553473dC65CE56db96c58e6a091c20980fbA")
  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const shouldStake = false

  console.log("processing list", stakeOpecList.length)

  // await sendTxn(opec.setMinter(wallet.address, true), "opec.setMinter")
  // await sendTxn(opec.mint(wallet.address, expandDecimals(5500000, 18)), "opec.mint")
  // await sendTxn(opec.approve(stakedOpecTracker.address, expandDecimals(5500000, 18)), "opec.approve(stakedOpecTracker)")
  // await sendTxn(rewardRouter.batchStakeOpecForAccount(["0x937B52690883994B0549b6a3093356b83a1F59a0"], [1], { gasLimit: 30000000 }), "rewardRouter.batchStakeOpecForAccount")

  if (!shouldStake) {
    for (let i = 0; i < stakeOpecList.length; i++) {
      const item = stakeOpecList[i]
      const account = item.address
      const stakedAmount = await stakedOpecTracker.stakedAmounts(account)
      console.log(`${account} : ${stakedAmount.toString()}`)
    }
    return
  }

  const batchSize = 30
  let accounts = []
  let amounts = []

  for (let i = 0; i < stakeOpecList.length; i++) {
    const item = stakeOpecList[i]
    accounts.push(item.address)
    amounts.push(item.balance)

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("amounts", amounts)
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(rewardRouter.batchStakeOpecForAccount(accounts, amounts), "rewardRouter.batchStakeOpecForAccount")

      const account = accounts[0]
      const amount = amounts[0]
      const stakedAmount = await stakedOpecTracker.stakedAmounts(account)
      console.log(`${account}: ${amount.toString()}, ${stakedAmount.toString()}`)

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", stakeOpecList.length, accounts.length, amounts.length)
    await sendTxn(rewardRouter.batchStakeOpecForAccount(accounts, amounts), "rewardRouter.batchStakeOpecForAccount")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
