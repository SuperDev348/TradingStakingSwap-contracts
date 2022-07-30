const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { nativeToken } = tokens

    const xpcManager = await contractAt("XpcManager", "0x9f03a788eFC7f88918Db0Ce2B9B2D84Eb1455d66")
    const xpc = await contractAt("XPC", "0x036EF092eF4152459A33e67252B185CAD6108D4a")

    const opec = await contractAt("OPEC", "0x472217f5089CF69C52773Bd95B346EA0439E577e");
    const esOpec = await contractAt("EsOpec", "0xFfa05E4B6017466ac3ad10bC488725eF3BC7591B");
    const bnOpec = await contractAt("MintableBaseToken", "0x96D12281Fa5189E0A9A26491B972270819515326");

    const stakedOpecTracker = await contractAt("RewardTracker", "0x5773C6F966876a23d35a191B699E50869Dd74ED8");
    const bonusOpecTracker = await contractAt("RewardTracker", "0x9792c409D6E42f10e06D05881350c38D64Fa02b4");
    const feeOpecTracker = await contractAt("RewardTracker", "0x941b621Cd10A3aFA4CE9e6da04df7409dfeb8A71");

    const stakedXpcTracker = await contractAt("RewardTracker", "0x825aA9531456bCA3Bdc6Db77fF14619f112Dc35F");
    const feeXpcTracker = await contractAt("RewardTracker", "0x022F201B80Ecb605e9dE60143603bF0f29774118");

    const bonusOpecDistributor = await contractAt("RewardDistributor", "0x94f30C17057899aD864f97BC7C21369766563554");
    const stakedXpcDistributor = await contractAt("BonusDistributor", "0x9b914dC0f3c1d781795D0F786C37eAcd87c0cfeC");

    const vestingDuration = 365 * 24 * 60 * 60
    const opecVester = await contractAt("Vester", "0xE9F480Ce9552dAE4e960787464Db23bd9a29e15D");
    const xpcVester = await contractAt("Vester", "0x1C9ad722BBfb270d306B1805d4C99CfC2fFbE703");
    const rewardRouter = await contractAt("RewardRouterV2", "0x4eBD500438E42588a5B1A489c187aE1dF8Aa9D7f");

    await sendTxn(xpcManager.setHandler(rewardRouter.address, true), "xpcManager.setHandler(rewardRouter)")

    await sendTxn(stakedOpecTracker.setHandler(rewardRouter.address, true), "stakedOpecTracker.setHandler(rewardRouter)")
    // allow bonusOpecTracker to stake stakedOpecTracker
    await sendTxn(stakedOpecTracker.setHandler(bonusOpecTracker.address, true), "stakedOpecTracker.setHandler(bonusOpecTracker)")
    // allow rewardRouter to stake in bonusOpecTracker
    await sendTxn(bonusOpecTracker.setHandler(rewardRouter.address, true), "bonusOpecTracker.setHandler(rewardRouter)")
    // allow bonusOpecTracker to stake feeOpecTracker
    await sendTxn(bonusOpecTracker.setHandler(feeOpecTracker.address, true), "bonusOpecTracker.setHandler(feeOpecTracker)")
    await sendTxn(bonusOpecDistributor.setBonusMultiplier(10000), "bonusOpecDistributor.setBonusMultiplier")
    // allow rewardRouter to stake in feeOpecTracker
    await sendTxn(feeOpecTracker.setHandler(rewardRouter.address, true), "feeOpecTracker.setHandler(rewardRouter)")
    // allow stakedOpecTracker to stake esOpec
    await sendTxn(esOpec.setHandler(stakedOpecTracker.address, true), "esOpec.setHandler(stakedOpecTracker)")
    // allow feeOpecTracker to stake bnOpec
    await sendTxn(bnOpec.setHandler(feeOpecTracker.address, true), "bnOpec.setHandler(feeOpecTracker")
    // allow rewardRouter to burn bnOpec
    await sendTxn(bnOpec.setMinter(rewardRouter.address, true), "bnOpec.setMinter(rewardRouter")
  
    // allow stakedXpcTracker to stake feeXpcTracker
    await sendTxn(feeXpcTracker.setHandler(stakedXpcTracker.address, true), "feeXpcTracker.setHandler(stakedXpcTracker)")
    // allow feeXpcTracker to stake xpc
    await sendTxn(xpc.setHandler(feeXpcTracker.address, true), "xpc.setHandler(feeXpcTracker)")
  
    // allow rewardRouter to stake in feeXpcTracker
    await sendTxn(feeXpcTracker.setHandler(rewardRouter.address, true), "feeXpcTracker.setHandler(rewardRouter)")
    // allow rewardRouter to stake in stakedXpcTracker
    await sendTxn(stakedXpcTracker.setHandler(rewardRouter.address, true), "stakedXpcTracker.setHandler(rewardRouter)")
  
    await sendTxn(esOpec.setHandler(rewardRouter.address, true), "esOpec.setHandler(rewardRouter)")
    await sendTxn(esOpec.setHandler(stakedOpecDistributor.address, true), "esOpec.setHandler(stakedOpecDistributor)")
    await sendTxn(esOpec.setHandler(stakedXpcDistributor.address, true), "esOpec.setHandler(stakedXpcDistributor)")
    await sendTxn(esOpec.setHandler(stakedXpcTracker.address, true), "esOpec.setHandler(stakedXpcTracker)")
    await sendTxn(esOpec.setHandler(opecVester.address, true), "esOpec.setHandler(opecVester)")
    await sendTxn(esOpec.setHandler(xpcVester.address, true), "esOpec.setHandler(xpcVester)")
  
    await sendTxn(esOpec.setMinter(opecVester.address, true), "esOpec.setMinter(opecVester)")
    await sendTxn(esOpec.setMinter(xpcVester.address, true), "esOpec.setMinter(xpcVester)")
  
    await sendTxn(opecVester.setHandler(rewardRouter.address, true), "opecVester.setHandler(rewardRouter)")
    await sendTxn(xpcVester.setHandler(rewardRouter.address, true), "xpcVester.setHandler(rewardRouter)")
  
    await sendTxn(feeOpecTracker.setHandler(opecVester.address, true), "feeOpecTracker.setHandler(opecVester)")
    await sendTxn(stakedXpcTracker.setHandler(xpcVester.address, true), "stakedXpcTracker.setHandler(xpcVester)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
