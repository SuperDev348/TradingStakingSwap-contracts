const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const rewardRouter = await contractAt("RewardRouter", "0xEa7fCb85802713Cb03291311C66d6012b23402ea")

  const account = "0x937B52690883994B0549b6a3093356b83a1F59a0"
  const amount = "1000000000000000000"

  await sendTxn(rewardRouter.stakeOpecForAccount(account, amount), `Stake for ${account}: ${amount}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
