const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

describe("BonusDistributor", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let opec
  let esOpec
  let bnOpec
  let stakedOpecTracker
  let stakedOpecDistributor
  let bonusOpecTracker
  let bonusOpecDistributor

  beforeEach(async () => {
    opec = await deployContract("OPEC", []);
    esOpec = await deployContract("EsOpec", []);
    bnOpec = await deployContract("MintableBaseToken", ["Bonus OPEC", "bnOpec", 0]);

    stakedOpecTracker = await deployContract("RewardTracker", ["Staked OPEC", "stOpec"])
    stakedOpecDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedOpecTracker.address])
    await stakedOpecDistributor.updateLastDistributionTime()

    bonusOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus OPEC", "sbOpec"])
    bonusOpecDistributor = await deployContract("BonusDistributor", [bnOpec.address, bonusOpecTracker.address])
    await bonusOpecDistributor.updateLastDistributionTime()

    await stakedOpecTracker.initialize([opec.address, esOpec.address], stakedOpecDistributor.address)
    await bonusOpecTracker.initialize([stakedOpecTracker.address], bonusOpecDistributor.address)

    await stakedOpecTracker.setInPrivateTransferMode(true)
    await stakedOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateTransferMode(true)
    await bonusOpecTracker.setInPrivateStakingMode(true)

    await stakedOpecTracker.setHandler(rewardRouter.address, true)
    await stakedOpecTracker.setHandler(bonusOpecTracker.address, true)
    await bonusOpecTracker.setHandler(rewardRouter.address, true)
    await bonusOpecDistributor.setBonusMultiplier(10000)
  })

  it("distributes bonus", async () => {
    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000, 18))
    await bnOpec.setMinter(wallet.address, true)
    await bnOpec.mint(bonusOpecDistributor.address, expandDecimals(1500, 18))
    await stakedOpecDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second
    await opec.setMinter(wallet.address, true)
    await opec.mint(user0.address, expandDecimals(1000, 18))

    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(1001, 18))
    await expect(stakedOpecTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, opec.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")
    await stakedOpecTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, opec.address, expandDecimals(1000, 18))
    await expect(bonusOpecTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedOpecTracker.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")
    await bonusOpecTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedOpecTracker.address, expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedOpecTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))
    expect(await bonusOpecTracker.claimable(user0.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusOpecTracker.claimable(user0.address)).lt("2750000000000000000") // 2.75

    await esOpec.mint(user1.address, expandDecimals(500, 18))
    await esOpec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(500, 18))
    await stakedOpecTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, esOpec.address, expandDecimals(500, 18))
    await bonusOpecTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, stakedOpecTracker.address, expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedOpecTracker.claimable(user0.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(595, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await bonusOpecTracker.claimable(user0.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusOpecTracker.claimable(user0.address)).lt("5490000000000000000") // 5.49

    expect(await bonusOpecTracker.claimable(user1.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusOpecTracker.claimable(user1.address)).lt("1380000000000000000") // 1.38
  })
})
