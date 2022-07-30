const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const { AddressZero } = ethers.constants

  const weth = { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" }
  const opec = await deployContract("OPEC", []);
  const esOpec = await deployContract("EsOpec", []);
  const bnOpec = await deployContract("MintableBaseToken", ["Bonus OPEC", "bnOpec", 0]);
  const bnAlp = { address: AddressZero }
  const alp = { address: AddressZero }

  const stakedOpecTracker = await deployContract("RewardTracker", ["Staked OPEC", "sOpec"])
  const stakedOpecDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedOpecTracker.address])
  await sendTxn(stakedOpecTracker.initialize([opec.address, esOpec.address], stakedOpecDistributor.address), "stakedOpecTracker.initialize")
  await sendTxn(stakedOpecDistributor.updateLastDistributionTime(), "stakedOpecDistributor.updateLastDistributionTime")

  const bonusOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus OPEC", "sbOpec"])
  const bonusOpecDistributor = await deployContract("BonusDistributor", [bnOpec.address, bonusOpecTracker.address])
  await sendTxn(bonusOpecTracker.initialize([stakedOpecTracker.address], bonusOpecDistributor.address), "bonusOpecTracker.initialize")
  await sendTxn(bonusOpecDistributor.updateLastDistributionTime(), "bonusOpecDistributor.updateLastDistributionTime")

  const feeOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee OPEC", "sbfOpec"])
  const feeOpecDistributor = await deployContract("RewardDistributor", [weth.address, feeOpecTracker.address])
  await sendTxn(feeOpecTracker.initialize([bonusOpecTracker.address, bnOpec.address], feeOpecDistributor.address), "feeOpecTracker.initialize")
  await sendTxn(feeOpecDistributor.updateLastDistributionTime(), "feeOpecDistributor.updateLastDistributionTime")

  const feeXpcTracker = { address: AddressZero }
  const stakedXpcTracker = { address: AddressZero }

  const stakedAlpTracker = { address: AddressZero }
  const bonusAlpTracker = { address: AddressZero }
  const feeAlpTracker = { address: AddressZero }

  const xpcManager = { address: AddressZero }
  const xpc = { address: AddressZero }

  await sendTxn(stakedOpecTracker.setInPrivateTransferMode(true), "stakedOpecTracker.setInPrivateTransferMode")
  await sendTxn(stakedOpecTracker.setInPrivateStakingMode(true), "stakedOpecTracker.setInPrivateStakingMode")
  await sendTxn(bonusOpecTracker.setInPrivateTransferMode(true), "bonusOpecTracker.setInPrivateTransferMode")
  await sendTxn(bonusOpecTracker.setInPrivateStakingMode(true), "bonusOpecTracker.setInPrivateStakingMode")
  await sendTxn(bonusOpecTracker.setInPrivateClaimingMode(true), "bonusOpecTracker.setInPrivateClaimingMode")
  await sendTxn(feeOpecTracker.setInPrivateTransferMode(true), "feeOpecTracker.setInPrivateTransferMode")
  await sendTxn(feeOpecTracker.setInPrivateStakingMode(true), "feeOpecTracker.setInPrivateStakingMode")

  const rewardRouter = await deployContract("RewardRouter", [])

  await sendTxn(rewardRouter.initialize(
    opec.address,
    esOpec.address,
    bnOpec.address,
    bnAlp.address,
    xpc.address,
    alp.address,
    stakedOpecTracker.address,
    bonusOpecTracker.address,
    feeOpecTracker.address,
    feeXpcTracker.address,
    stakedXpcTracker.address,
    stakedAlpTracker.address,
    bonusAlpTracker.address,
    feeAlpTracker.address,
    xpcManager.address
  ), "rewardRouter.initialize")

  // allow rewardRouter to stake in stakedOpecTracker
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

  // mint esOpec for distributors
  await sendTxn(esOpec.setMinter(wallet.address, true), "esOpec.setMinter(wallet)")
  await sendTxn(esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000 * 12, 18)), "esOpec.mint(stakedOpecDistributor") // ~50,000 OPEC per month
  await sendTxn(stakedOpecDistributor.setTokensPerInterval("20667989410000000"), "stakedOpecDistributor.setTokensPerInterval") // 0.02066798941 esOpec per second

  // mint bnOpec for distributor
  await sendTxn(bnOpec.setMinter(wallet.address, true), "bnOpec.setMinter")
  await sendTxn(bnOpec.mint(bonusOpecDistributor.address, expandDecimals(15 * 1000 * 1000, 18)), "bnOpec.mint(bonusOpecDistributor)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
