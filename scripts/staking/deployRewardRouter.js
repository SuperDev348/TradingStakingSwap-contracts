const { deployContract, contractAt, sendTxn, readTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const weth = await contractAt("Token", nativeToken.address)
  const opec = await contractAt("OPEC", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esOpec = await contractAt("EsOpec", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnOpec = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")

  const stakedOpecTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusOpecTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeOpecTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeXpcTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedXpcTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  const xpc = await contractAt("XPC", "0xDE7A1DC9a73f22F9B628636539E2b8d2FE866069")
  const xpcManager = await contractAt("XpcManager", "0x321F653eED006AD1C29D174e17d96351BDe22649")

  console.log("xpcManager", xpcManager.address)

  const rewardRouter = await deployContract("RewardRouter", [])

  await sendTxn(rewardRouter.initialize(
    weth.address,
    opec.address,
    esOpec.address,
    bnOpec.address,
    xpc.address,
    stakedOpecTracker.address,
    bonusOpecTracker.address,
    feeOpecTracker.address,
    feeXpcTracker.address,
    stakedXpcTracker.address,
    xpcManager.address
  ), "rewardRouter.initialize")

  // allow rewardRouter to stake in stakedOpecTracker
  await sendTxn(stakedOpecTracker.setHandler(rewardRouter.address, true), "stakedOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusOpecTracker
  await sendTxn(bonusOpecTracker.setHandler(rewardRouter.address, true), "bonusOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeOpecTracker
  await sendTxn(feeOpecTracker.setHandler(rewardRouter.address, true), "feeOpecTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnOpec
  await sendTxn(bnOpec.setMinter(rewardRouter.address, true), "bnOpec.setMinter(rewardRouter)")

  // allow rewardRouter to mint in xpcManager
  await sendTxn(xpcManager.setHandler(rewardRouter.address, true), "xpcManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeXpcTracker
  await sendTxn(feeXpcTracker.setHandler(rewardRouter.address, true), "feeXpcTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedXpcTracker
  await sendTxn(stakedXpcTracker.setHandler(rewardRouter.address, true), "stakedXpcTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
