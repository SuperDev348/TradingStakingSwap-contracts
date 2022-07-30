const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const secondsPerYear = 365 * 24 * 60 * 60
const { AddressZero } = ethers.constants

describe("Vester", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4] = provider.getWallets()
  let opec
  let esOpec
  let bnOpec
  let eth

  beforeEach(async () => {
    opec = await deployContract("OPEC", []);
    esOpec = await deployContract("EsOpec", []);
    bnOpec = await deployContract("MintableBaseToken", ["Bonus OPEC", "bnOpec", 0]);
    eth = await deployContract("Token", [])

    await esOpec.setMinter(wallet.address, true)
    await opec.setMinter(wallet.address, true)
  })

  it("inits", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])

    expect(await vester.name()).eq("Vested OPEC")
    expect(await vester.symbol()).eq("veOpec")
    expect(await vester.vestingDuration()).eq(secondsPerYear)
    expect(await vester.esToken()).eq(esOpec.address)
    expect(await vester.pairToken()).eq(AddressZero)
    expect(await vester.claimableToken()).eq(opec.address)
    expect(await vester.rewardTracker()).eq(AddressZero)
    expect(await vester.hasPairToken()).eq(false)
    expect(await vester.hasRewardTracker()).eq(false)
    expect(await vester.hasMaxVestableAmount()).eq(false)
  })

  it("setTransferredAverageStakedAmounts", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])

    await expect(vester.setTransferredAverageStakedAmounts(user0.address, 200))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(wallet.address, true)

    expect(await vester.transferredAverageStakedAmounts(user0.address)).eq(0)
    await vester.setTransferredAverageStakedAmounts(user0.address, 200)
    expect(await vester.transferredAverageStakedAmounts(user0.address)).eq(200)
  })

  it("setTransferredCumulativeRewards", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])

    await expect(vester.setTransferredCumulativeRewards(user0.address, 200))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(wallet.address, true)

    expect(await vester.transferredCumulativeRewards(user0.address)).eq(0)
    await vester.setTransferredCumulativeRewards(user0.address, 200)
    expect(await vester.transferredCumulativeRewards(user0.address)).eq(200)
  })

  it("setCumulativeRewardDeductions", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])

    await expect(vester.setCumulativeRewardDeductions(user0.address, 200))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(wallet.address, true)

    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(0)
    await vester.setCumulativeRewardDeductions(user0.address, 200)
    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(200)
  })

  it("setBonusRewards", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])

    await expect(vester.setBonusRewards(user0.address, 200))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(wallet.address, true)

    expect(await vester.bonusRewards(user0.address)).eq(0)
    await vester.setBonusRewards(user0.address, 200)
    expect(await vester.bonusRewards(user0.address)).eq(200)
  })

  it("deposit, claim, withdraw", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])
    await esOpec.setMinter(vester.address, true)

    await expect(vester.connect(user0).deposit(0))
      .to.be.revertedWith("Vester: invalid _amount")

    await expect(vester.connect(user0).deposit(expandDecimals(1000, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await esOpec.connect(user0).approve(vester.address, expandDecimals(1000, 18))

    await expect(vester.connect(user0).deposit(expandDecimals(1000, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    expect(await vester.balanceOf(user0.address)).eq(0)
    expect(await vester.getTotalVested(user0.address)).eq(0)
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(0)

    await esOpec.mint(user0.address, expandDecimals(1000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    let blockTime = await getBlockTime(provider)

    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).eq(0)
    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).gt("2730000000000000000") // 1000 / 365 => ~2.739
    expect(await vester.claimable(user0.address)).lt("2750000000000000000")
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await expect(vester.connect(user0).claim())
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await opec.mint(vester.address, expandDecimals(2000, 18))

    await vester.connect(user0).claim()
    blockTime = await getBlockTime(provider)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).gt("2730000000000000000")
    expect(await opec.balanceOf(user0.address)).lt("2750000000000000000")

    let opecAmount = await opec.balanceOf(user0.address)
    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18).sub(opecAmount))

    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimedAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimedAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimable(user0.address)).gt("5478000000000000000") // 1000 / 365 * 2 => ~5.479
    expect(await vester.claimable(user0.address)).lt("5480000000000000000")

    await increaseTime(provider, (parseInt(365 / 2 - 1)) * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimedAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimable(user0.address)).gt(expandDecimals(500, 18)) // 1000 / 2 => 500
    expect(await vester.claimable(user0.address)).lt(expandDecimals(502, 18))

    await vester.connect(user0).claim()
    blockTime = await getBlockTime(provider)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).gt(expandDecimals(503, 18))
    expect(await opec.balanceOf(user0.address)).lt(expandDecimals(505, 18))

    opecAmount = await opec.balanceOf(user0.address)
    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18).sub(opecAmount))

    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimedAmounts(user0.address)).eq(opecAmount)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    // vesting rate should be the same even after claiming
    expect(await vester.claimable(user0.address)).gt("2730000000000000000") // 1000 / 365 => ~2.739
    expect(await vester.claimable(user0.address)).lt("2750000000000000000")

    await esOpec.mint(user0.address, expandDecimals(500, 18))
    await esOpec.connect(user0).approve(vester.address, expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.claimable(user0.address)).gt("6840000000000000000") // 1000 / 365 + 1500 / 365 => 6.849
    expect(await vester.claimable(user0.address)).lt("6860000000000000000")

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).eq(opecAmount)

    await vester.connect(user0).withdraw()

    expect(await esOpec.balanceOf(user0.address)).gt(expandDecimals(989, 18))
    expect(await esOpec.balanceOf(user0.address)).lt(expandDecimals(990, 18))
    expect(await opec.balanceOf(user0.address)).gt(expandDecimals(510, 18))
    expect(await opec.balanceOf(user0.address)).lt(expandDecimals(512, 18))

    expect(await vester.balanceOf(user0.address)).eq(0)
    expect(await vester.getTotalVested(user0.address)).eq(0)
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(0)

    await esOpec.connect(user0).approve(vester.address, expandDecimals(1000, 18))
    await esOpec.mint(user0.address, expandDecimals(1000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))
    blockTime = await getBlockTime(provider)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).gt("2730000000000000000") // 1000 / 365 => ~2.739
    expect(await vester.claimable(user0.address)).lt("2750000000000000000")
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await vester.connect(user0).claim()
  })

  it("depositForAccount, claimForAccount", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])
    await esOpec.setMinter(vester.address, true)
    await vester.setHandler(wallet.address, true)

    await esOpec.connect(user0).approve(vester.address, expandDecimals(1000, 18))

    expect(await vester.balanceOf(user0.address)).eq(0)
    expect(await vester.getTotalVested(user0.address)).eq(0)
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(0)

    await esOpec.mint(user0.address, expandDecimals(1000, 18))

    await expect(vester.connect(user2).depositForAccount(user0.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(user2.address, true)
    await vester.connect(user2).depositForAccount(user0.address, expandDecimals(1000, 18))

    let blockTime = await getBlockTime(provider)

    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).eq(0)
    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).gt("2730000000000000000") // 1000 / 365 => ~2.739
    expect(await vester.claimable(user0.address)).lt("2750000000000000000")
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await expect(vester.connect(user0).claim())
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await opec.mint(vester.address, expandDecimals(2000, 18))

    await expect(vester.connect(user3).claimForAccount(user0.address, user4.address))
      .to.be.revertedWith("Vester: forbidden")

    await vester.setHandler(user3.address, true)

    await vester.connect(user3).claimForAccount(user0.address, user4.address)
    blockTime = await getBlockTime(provider)

    expect(await esOpec.balanceOf(user4.address)).eq(0)
    expect(await opec.balanceOf(user4.address)).gt("2730000000000000000")
    expect(await opec.balanceOf(user4.address)).lt("2750000000000000000")

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).eq(0)
    expect(await vester.balanceOf(user0.address)).gt(expandDecimals(996, 18))
    expect(await vester.balanceOf(user0.address)).lt(expandDecimals(998, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).gt("2730000000000000000")
    expect(await vester.cumulativeClaimAmounts(user0.address)).lt("2750000000000000000")
    expect(await vester.claimedAmounts(user0.address)).gt("2730000000000000000")
    expect(await vester.claimedAmounts(user0.address)).lt("2750000000000000000")
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)
  })

  it("handles multiple deposits", async () => {
    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      AddressZero,
      opec.address,
      AddressZero
    ])
    await esOpec.setMinter(vester.address, true)
    await vester.setHandler(wallet.address, true)

    await esOpec.connect(user0).approve(vester.address, expandDecimals(1000, 18))

    expect(await vester.balanceOf(user0.address)).eq(0)
    expect(await vester.getTotalVested(user0.address)).eq(0)
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(0)

    await esOpec.mint(user0.address, expandDecimals(1000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    let blockTime = await getBlockTime(provider)

    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(user0.address)).eq(0)
    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0)
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).gt("2730000000000000000") // 1000 / 365 => ~2.739
    expect(await vester.claimable(user0.address)).lt("2750000000000000000")
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await expect(vester.connect(user0).claim())
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await opec.mint(vester.address, expandDecimals(2000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.balanceOf(user0.address)).eq(expandDecimals(1000, 18))

    await esOpec.mint(user0.address, expandDecimals(500, 18))
    await esOpec.connect(user0).approve(vester.address, expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(500, 18))
    blockTime = await getBlockTime(provider)

    expect(await vester.balanceOf(user0.address)).gt(expandDecimals(1494, 18))
    expect(await vester.balanceOf(user0.address)).lt(expandDecimals(1496, 18))
    expect(await vester.getTotalVested(user0.address)).eq(expandDecimals(1500, 18))
    expect(await vester.cumulativeClaimAmounts(user0.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await vester.cumulativeClaimAmounts(user0.address)).lt("5490000000000000000") // 5.49
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).gt("5470000000000000000")
    expect(await vester.claimable(user0.address)).lt("5490000000000000000")
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(blockTime)

    await vester.connect(user0).withdraw()

    expect(await esOpec.balanceOf(user0.address)).gt(expandDecimals(1494, 18))
    expect(await esOpec.balanceOf(user0.address)).lt(expandDecimals(1496, 18))
    expect(await opec.balanceOf(user0.address)).gt("5470000000000000000")
    expect(await opec.balanceOf(user0.address)).lt("5490000000000000000")
    expect(await vester.balanceOf(user0.address)).eq(0)
    expect(await vester.getTotalVested(user0.address)).eq(0)
    expect(await vester.cumulativeClaimAmounts(user0.address)).eq(0) // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await vester.claimedAmounts(user0.address)).eq(0)
    expect(await vester.claimable(user0.address)).eq(0)
    expect(await vester.pairAmounts(user0.address)).eq(0)
    expect(await vester.lastVestingTimes(user0.address)).eq(0)
  })

  it("handles pairing", async () => {
    stakedOpecTracker = await deployContract("RewardTracker", ["Staked OPEC", "sOpec"])
    stakedOpecDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedOpecTracker.address])
    await stakedOpecTracker.initialize([opec.address, esOpec.address], stakedOpecDistributor.address)
    await stakedOpecDistributor.updateLastDistributionTime()

    bonusOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus OPEC", "sbOpec"])
    bonusOpecDistributor = await deployContract("BonusDistributor", [bnOpec.address, bonusOpecTracker.address])
    await bonusOpecTracker.initialize([stakedOpecTracker.address], bonusOpecDistributor.address)
    await bonusOpecDistributor.updateLastDistributionTime()

    feeOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee OPEC", "sbfOpec"])
    feeOpecDistributor = await deployContract("RewardDistributor", [eth.address, feeOpecTracker.address])
    await feeOpecTracker.initialize([bonusOpecTracker.address, bnOpec.address], feeOpecDistributor.address)
    await feeOpecDistributor.updateLastDistributionTime()

    await stakedOpecTracker.setInPrivateTransferMode(true)
    await stakedOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateTransferMode(true)
    await bonusOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateClaimingMode(true)
    await feeOpecTracker.setInPrivateTransferMode(true)
    await feeOpecTracker.setInPrivateStakingMode(true)

    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000 * 12, 18))
    await stakedOpecDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second

    const rewardRouter = await deployContract("RewardRouter", [])
    await rewardRouter.initialize(
      eth.address,
      opec.address,
      esOpec.address,
      bnOpec.address,
      AddressZero,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      AddressZero,
      AddressZero,
      AddressZero
    )

    // allow rewardRouter to stake in stakedOpecTracker
    await stakedOpecTracker.setHandler(rewardRouter.address, true)
    // allow bonusOpecTracker to stake stakedOpecTracker
    await stakedOpecTracker.setHandler(bonusOpecTracker.address, true)
    // allow rewardRouter to stake in bonusOpecTracker
    await bonusOpecTracker.setHandler(rewardRouter.address, true)
    // allow bonusOpecTracker to stake feeOpecTracker
    await bonusOpecTracker.setHandler(feeOpecTracker.address, true)
    await bonusOpecDistributor.setBonusMultiplier(10000)
    // allow rewardRouter to stake in feeOpecTracker
    await feeOpecTracker.setHandler(rewardRouter.address, true)
    // allow stakedOpecTracker to stake esOpec
    await esOpec.setHandler(stakedOpecTracker.address, true)
    // allow feeOpecTracker to stake bnOpec
    await bnOpec.setHandler(feeOpecTracker.address, true)
    // allow rewardRouter to burn bnOpec
    await bnOpec.setMinter(rewardRouter.address, true)

    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      feeOpecTracker.address,
      opec.address,
      stakedOpecTracker.address
    ])
    await esOpec.setMinter(vester.address, true)
    await vester.setHandler(wallet.address, true)

    expect(await vester.name()).eq("Vested OPEC")
    expect(await vester.symbol()).eq("veOpec")
    expect(await vester.vestingDuration()).eq(secondsPerYear)
    expect(await vester.esToken()).eq(esOpec.address)
    expect(await vester.pairToken()).eq(feeOpecTracker.address)
    expect(await vester.claimableToken()).eq(opec.address)
    expect(await vester.rewardTracker()).eq(stakedOpecTracker.address)
    expect(await vester.hasPairToken()).eq(true)
    expect(await vester.hasRewardTracker()).eq(true)
    expect(await vester.hasMaxVestableAmount()).eq(true)

    // allow vester to transfer feeOpecTracker tokens
    await feeOpecTracker.setHandler(vester.address, true)
    // allow vester to transfer esOpec tokens
    await esOpec.setHandler(vester.address, true)

    await opec.mint(vester.address, expandDecimals(2000, 18))

    await opec.mint(user0.address, expandDecimals(1000, 18))
    await opec.mint(user1.address, expandDecimals(500, 18))
    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(1000, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(500, 18))

    await rewardRouter.connect(user0).stakeOpec(expandDecimals(1000, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).gt(expandDecimals(1190, 18))
    expect(await stakedOpecTracker.claimable(user0.address)).lt(expandDecimals(1191, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(594, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user1.address)).eq(0)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user2.address)).eq(0)
    expect(await esOpec.balanceOf(user3.address)).eq(0)

    await stakedOpecTracker.connect(user0).claim(user2.address)
    await stakedOpecTracker.connect(user1).claim(user3.address)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(1190, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(1191, 18))
    expect(await esOpec.balanceOf(user3.address)).gt(expandDecimals(594, 18))
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(596, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(1190, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(1191, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).gt(expandDecimals(594, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).lt(expandDecimals(596, 18))
    expect(await vester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user3.address)).eq(0)

    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).gt("830000000000000000") // 0.83, 1000 / 1190 => ~0.84
    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).lt("850000000000000000") // 0.85
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).gt("830000000000000000") // 0.83, 500 / 595 => ~0.84
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).lt("850000000000000000") // 0.85
    expect(await vester.getPairAmount(user2.address, expandDecimals(1, 18))).eq(0)
    expect(await vester.getPairAmount(user3.address, expandDecimals(1, 18))).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await stakedOpecTracker.connect(user0).claim(user2.address)
    await stakedOpecTracker.connect(user1).claim(user3.address)

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(2380, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(2382, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1189, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1191, 18))

    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).gt("410000000000000000") // 0.41, 1000 / 2380 => ~0.42
    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).lt("430000000000000000") // 0.43
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).gt("410000000000000000") // 0.41, 1000 / 2380 => ~0.42
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).lt("430000000000000000") // 0.43

    await esOpec.mint(user0.address, expandDecimals(2385, 18))
    await expect(vester.connect(user0).deposit(expandDecimals(2385, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")

    await opec.mint(user0.address, expandDecimals(500, 18))
    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(500, 18))
    await rewardRouter.connect(user0).stakeOpec(expandDecimals(500, 18))

    await expect(vester.connect(user0).deposit(expandDecimals(2385, 18)))
      .to.be.revertedWith("Vester: max vestable amount exceeded")

    await opec.mint(user2.address, expandDecimals(1, 18))
    await expect(vester.connect(user2).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("Vester: max vestable amount exceeded")

    expect(await esOpec.balanceOf(user0.address)).eq(expandDecimals(2385, 18))
    expect(await esOpec.balanceOf(vester.address)).eq(0)
    expect(await feeOpecTracker.balanceOf(user0.address)).eq(expandDecimals(1500, 18))
    expect(await feeOpecTracker.balanceOf(vester.address)).eq(0)

    await vester.connect(user0).deposit(expandDecimals(2380, 18))

    expect(await esOpec.balanceOf(user0.address)).eq(expandDecimals(5, 18))
    expect(await esOpec.balanceOf(vester.address)).eq(expandDecimals(2380, 18))
    expect(await feeOpecTracker.balanceOf(user0.address)).gt(expandDecimals(499, 18))
    expect(await feeOpecTracker.balanceOf(user0.address)).lt(expandDecimals(501, 18))
    expect(await feeOpecTracker.balanceOf(vester.address)).gt(expandDecimals(999, 18))
    expect(await feeOpecTracker.balanceOf(vester.address)).lt(expandDecimals(1001, 18))

    await rewardRouter.connect(user1).unstakeOpec(expandDecimals(499, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await stakedOpecTracker.connect(user0).claim(user2.address)
    await stakedOpecTracker.connect(user1).claim(user3.address)

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(4164, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(4166, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1190, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1192, 18))

    // (1000 * 2380 / 4164) + (1500 * 1784 / 4164) => 1214.21709894
    // 1214.21709894 / 4164 => ~0.29

    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).gt("280000000000000000") // 0.28
    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).lt("300000000000000000") // 0.30
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).gt("410000000000000000") // 0.41, 1000 / 2380 => ~0.42
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).lt("430000000000000000") // 0.43

    await increaseTime(provider, 30 * 24 * 60 * 60)
    await mineBlock(provider)

    await vester.connect(user0).withdraw()

    expect(await feeOpecTracker.balanceOf(user0.address)).eq(expandDecimals(1500, 18))
    expect(await opec.balanceOf(user0.address)).gt(expandDecimals(201, 18)) // 2380 / 12 = ~198
    expect(await opec.balanceOf(user0.address)).lt(expandDecimals(203, 18))
    expect(await esOpec.balanceOf(user0.address)).gt(expandDecimals(2182, 18)) // 5 + 2380 - 202  = 2183
    expect(await esOpec.balanceOf(user0.address)).lt(expandDecimals(2183, 18))
  })

  it("handles existing pair tokens", async () => {
    stakedOpecTracker = await deployContract("RewardTracker", ["Staked OPEC", "sOpec"])
    stakedOpecDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedOpecTracker.address])
    await stakedOpecTracker.initialize([opec.address, esOpec.address], stakedOpecDistributor.address)
    await stakedOpecDistributor.updateLastDistributionTime()

    bonusOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus OPEC", "sbOpec"])
    bonusOpecDistributor = await deployContract("BonusDistributor", [bnOpec.address, bonusOpecTracker.address])
    await bonusOpecTracker.initialize([stakedOpecTracker.address], bonusOpecDistributor.address)
    await bonusOpecDistributor.updateLastDistributionTime()

    feeOpecTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee OPEC", "sbfOpec"])
    feeOpecDistributor = await deployContract("RewardDistributor", [eth.address, feeOpecTracker.address])
    await feeOpecTracker.initialize([bonusOpecTracker.address, bnOpec.address], feeOpecDistributor.address)
    await feeOpecDistributor.updateLastDistributionTime()

    await stakedOpecTracker.setInPrivateTransferMode(true)
    await stakedOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateTransferMode(true)
    await bonusOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateClaimingMode(true)
    await feeOpecTracker.setInPrivateTransferMode(true)
    await feeOpecTracker.setInPrivateStakingMode(true)

    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000 * 12, 18))
    await stakedOpecDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second

    const rewardRouter = await deployContract("RewardRouter", [])
    await rewardRouter.initialize(
      eth.address,
      opec.address,
      esOpec.address,
      bnOpec.address,
      AddressZero,
      stakedOpecTracker.address,
      bonusOpecTracker.address,
      feeOpecTracker.address,
      AddressZero,
      AddressZero,
      AddressZero
    )

    // allow rewardRouter to stake in stakedOpecTracker
    await stakedOpecTracker.setHandler(rewardRouter.address, true)
    // allow bonusOpecTracker to stake stakedOpecTracker
    await stakedOpecTracker.setHandler(bonusOpecTracker.address, true)
    // allow rewardRouter to stake in bonusOpecTracker
    await bonusOpecTracker.setHandler(rewardRouter.address, true)
    // allow bonusOpecTracker to stake feeOpecTracker
    await bonusOpecTracker.setHandler(feeOpecTracker.address, true)
    await bonusOpecDistributor.setBonusMultiplier(10000)
    // allow rewardRouter to stake in feeOpecTracker
    await feeOpecTracker.setHandler(rewardRouter.address, true)
    // allow stakedOpecTracker to stake esOpec
    await esOpec.setHandler(stakedOpecTracker.address, true)
    // allow feeOpecTracker to stake bnOpec
    await bnOpec.setHandler(feeOpecTracker.address, true)
    // allow rewardRouter to burn bnOpec
    await bnOpec.setMinter(rewardRouter.address, true)

    const vester = await deployContract("Vester", [
      "Vested OPEC",
      "veOpec",
      secondsPerYear,
      esOpec.address,
      feeOpecTracker.address,
      opec.address,
      stakedOpecTracker.address
    ])
    await esOpec.setMinter(vester.address, true)
    await vester.setHandler(wallet.address, true)

    expect(await vester.name()).eq("Vested OPEC")
    expect(await vester.symbol()).eq("veOpec")
    expect(await vester.vestingDuration()).eq(secondsPerYear)
    expect(await vester.esToken()).eq(esOpec.address)
    expect(await vester.pairToken()).eq(feeOpecTracker.address)
    expect(await vester.claimableToken()).eq(opec.address)
    expect(await vester.rewardTracker()).eq(stakedOpecTracker.address)
    expect(await vester.hasPairToken()).eq(true)
    expect(await vester.hasRewardTracker()).eq(true)
    expect(await vester.hasMaxVestableAmount()).eq(true)

    // allow vester to transfer feeOpecTracker tokens
    await feeOpecTracker.setHandler(vester.address, true)
    // allow vester to transfer esOpec tokens
    await esOpec.setHandler(vester.address, true)

    await opec.mint(vester.address, expandDecimals(2000, 18))

    await opec.mint(user0.address, expandDecimals(1000, 18))
    await opec.mint(user1.address, expandDecimals(500, 18))
    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(1000, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(500, 18))

    await rewardRouter.connect(user0).stakeOpec(expandDecimals(1000, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).gt(expandDecimals(1190, 18))
    expect(await stakedOpecTracker.claimable(user0.address)).lt(expandDecimals(1191, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(594, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user1.address)).eq(0)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user2.address)).eq(0)
    expect(await esOpec.balanceOf(user3.address)).eq(0)

    await stakedOpecTracker.connect(user0).claim(user2.address)
    await stakedOpecTracker.connect(user1).claim(user3.address)

    expect(await esOpec.balanceOf(user0.address)).eq(0)
    expect(await esOpec.balanceOf(user1.address)).eq(0)
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(1190, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(1191, 18))
    expect(await esOpec.balanceOf(user3.address)).gt(expandDecimals(594, 18))
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(596, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(1190, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(1191, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).gt(expandDecimals(594, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).lt(expandDecimals(596, 18))
    expect(await vester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user3.address)).eq(0)

    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).gt("830000000000000000") // 0.83, 1000 / 1190 => ~0.84
    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).lt("850000000000000000") // 0.85
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).gt("830000000000000000") // 0.83, 500 / 595 => ~0.84
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).lt("850000000000000000") // 0.85
    expect(await vester.getPairAmount(user2.address, expandDecimals(1, 18))).eq(0)
    expect(await vester.getPairAmount(user3.address, expandDecimals(1, 18))).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await stakedOpecTracker.connect(user0).claim(user2.address)
    await stakedOpecTracker.connect(user1).claim(user3.address)

    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(2380, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(2382, 18))
    expect(await esOpec.balanceOf(user3.address)).gt(expandDecimals(1189, 18))
    expect(await esOpec.balanceOf(user3.address)).lt(expandDecimals(1191, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(2380, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(2382, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1189, 18))
    expect(await vester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1191, 18))

    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).gt("410000000000000000") // 0.41, 1000 / 2380 => ~0.42
    expect(await vester.getPairAmount(user0.address, expandDecimals(1, 18))).lt("430000000000000000") // 0.43
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).gt("410000000000000000") // 0.41, 1000 / 2380 => ~0.42
    expect(await vester.getPairAmount(user1.address, expandDecimals(1, 18))).lt("430000000000000000") // 0.43

    expect(await vester.getPairAmount(user0.address, expandDecimals(2380, 18))).gt(expandDecimals(999, 18))
    expect(await vester.getPairAmount(user0.address, expandDecimals(2380, 18))).lt(expandDecimals(1000, 18))
    expect(await vester.getPairAmount(user1.address, expandDecimals(1189, 18))).gt(expandDecimals(499, 18))
    expect(await vester.getPairAmount(user1.address, expandDecimals(1189, 18))).lt(expandDecimals(500, 18))

    expect(await feeOpecTracker.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    await esOpec.mint(user0.address, expandDecimals(2380, 18))
    await vester.connect(user0).deposit(expandDecimals(2380, 18))

    expect(await feeOpecTracker.balanceOf(user0.address)).gt(0)
    expect(await feeOpecTracker.balanceOf(user0.address)).lt(expandDecimals(1, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).gt(expandDecimals(1190, 18))
    expect(await stakedOpecTracker.claimable(user0.address)).lt(expandDecimals(1191, 18))

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(2380, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(2382, 18))

    await stakedOpecTracker.connect(user0).claim(user2.address)

    expect(await vester.getMaxVestableAmount(user0.address)).gt(expandDecimals(3571, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).lt(expandDecimals(3572, 18))

    expect(await vester.getPairAmount(user0.address, expandDecimals(3570, 18))).gt(expandDecimals(999, 18))
    expect(await vester.getPairAmount(user0.address, expandDecimals(3570, 18))).lt(expandDecimals(1000, 18))

    const feeOpecTrackerBalance = await feeOpecTracker.balanceOf(user0.address)

    await esOpec.mint(user0.address, expandDecimals(1190, 18))
    await vester.connect(user0).deposit(expandDecimals(1190, 18))

    expect(feeOpecTrackerBalance).eq(await feeOpecTracker.balanceOf(user0.address))

    await expect(rewardRouter.connect(user0).unstakeOpec(expandDecimals(2, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await vester.connect(user0).withdraw()

    await rewardRouter.connect(user0).unstakeOpec(expandDecimals(2, 18))
  })
})
