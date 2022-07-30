const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")

use(solidity)

describe("RewardRouter", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()

  let vault
  let xpcManager
  let xpc
  let usdg
  let router
  let vaultPriceFeed
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let eth
  let ethPriceFeed
  let dai
  let daiPriceFeed
  let busd
  let busdPriceFeed

  let opec
  let esOpec
  let bnOpec

  let stakedOpecTracker
  let stakedOpecDistributor
  let bonusOpecTracker
  let bonusOpecDistributor
  let feeOpecTracker
  let feeOpecDistributor

  let feeXpcTracker
  let feeXpcDistributor
  let stakedXpcTracker
  let stakedXpcDistributor

  let rewardRouter

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    busd = await deployContract("Token", [])
    busdPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    xpc = await deployContract("XPC", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    xpcManager = await deployContract("XpcManager", [vault.address, usdg.address, xpc.address, 24 * 60 * 60])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await xpc.setInPrivateTransferMode(true)
    await xpc.setMinter(xpcManager.address, true)
    await xpcManager.setInPrivateMode(true)

    opec = await deployContract("OPEC", []);
    esOpec = await deployContract("EsOpec", []);
    bnOpec = await deployContract("MintableBaseToken", ["Bonus OPEC", "bnOpec", 0]);

    // OPEC
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

    // XPC
    feeXpcTracker = await deployContract("RewardTracker", ["Fee XPC", "fXPC"])
    feeXpcDistributor = await deployContract("RewardDistributor", [eth.address, feeXpcTracker.address])
    await feeXpcTracker.initialize([xpc.address], feeXpcDistributor.address)
    await feeXpcDistributor.updateLastDistributionTime()

    stakedXpcTracker = await deployContract("RewardTracker", ["Fee + Staked XPC", "fsXPC"])
    stakedXpcDistributor = await deployContract("RewardDistributor", [esOpec.address, stakedXpcTracker.address])
    await stakedXpcTracker.initialize([feeXpcTracker.address], stakedXpcDistributor.address)
    await stakedXpcDistributor.updateLastDistributionTime()

    await stakedOpecTracker.setInPrivateTransferMode(true)
    await stakedOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateTransferMode(true)
    await bonusOpecTracker.setInPrivateStakingMode(true)
    await bonusOpecTracker.setInPrivateClaimingMode(true)
    await feeOpecTracker.setInPrivateTransferMode(true)
    await feeOpecTracker.setInPrivateStakingMode(true)

    await feeXpcTracker.setInPrivateTransferMode(true)
    await feeXpcTracker.setInPrivateStakingMode(true)
    await stakedXpcTracker.setInPrivateTransferMode(true)
    await stakedXpcTracker.setInPrivateStakingMode(true)

    rewardRouter = await deployContract("RewardRouter", [])
    await rewardRouter.initialize(
      bnb.address,
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
    // allow feeOpecTracker to stake bnOpec
    await bnOpec.setHandler(feeOpecTracker.address, true)
    // allow rewardRouter to burn bnOpec
    await bnOpec.setMinter(rewardRouter.address, true)

    // allow rewardRouter to mint in xpcManager
    await xpcManager.setHandler(rewardRouter.address, true)
    // allow rewardRouter to stake in feeXpcTracker
    await feeXpcTracker.setHandler(rewardRouter.address, true)
    // allow stakedXpcTracker to stake feeXpcTracker
    await feeXpcTracker.setHandler(stakedXpcTracker.address, true)
    // allow rewardRouter to sake in stakedXpcTracker
    await stakedXpcTracker.setHandler(rewardRouter.address, true)
    // allow feeXpcTracker to stake xpc
    await xpc.setHandler(feeXpcTracker.address, true)

    // mint esOpec for distributors
    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(stakedOpecDistributor.address, expandDecimals(50000, 18))
    await stakedOpecDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second
    await esOpec.mint(stakedXpcDistributor.address, expandDecimals(50000, 18))
    await stakedXpcDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esOpec per second

    await esOpec.setInPrivateTransferMode(true)
    await esOpec.setHandler(stakedOpecDistributor.address, true)
    await esOpec.setHandler(stakedXpcDistributor.address, true)
    await esOpec.setHandler(stakedOpecTracker.address, true)
    await esOpec.setHandler(stakedXpcTracker.address, true)
    await esOpec.setHandler(rewardRouter.address, true)

    // mint bnOpec for distributor
    await bnOpec.setMinter(wallet.address, true)
    await bnOpec.mint(bonusOpecDistributor.address, expandDecimals(1500, 18))
  })

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(bnb.address)
    expect(await rewardRouter.opec()).eq(opec.address)
    expect(await rewardRouter.esOpec()).eq(esOpec.address)
    expect(await rewardRouter.bnOpec()).eq(bnOpec.address)

    expect(await rewardRouter.xpc()).eq(xpc.address)

    expect(await rewardRouter.stakedOpecTracker()).eq(stakedOpecTracker.address)
    expect(await rewardRouter.bonusOpecTracker()).eq(bonusOpecTracker.address)
    expect(await rewardRouter.feeOpecTracker()).eq(feeOpecTracker.address)

    expect(await rewardRouter.feeXpcTracker()).eq(feeXpcTracker.address)
    expect(await rewardRouter.stakedXpcTracker()).eq(stakedXpcTracker.address)

    expect(await rewardRouter.xpcManager()).eq(xpcManager.address)

    await expect(rewardRouter.initialize(
      bnb.address,
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
    )).to.be.revertedWith("RewardRouter: already initialized")
  })

  it("stakeOpecForAccount, stakeOpec, stakeEsOpec, unstakeOpec, unstakeEsOpec, claimEsOpec, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeOpecDistributor.address, expandDecimals(100, 18))
    await feeOpecDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await opec.setMinter(wallet.address, true)
    await opec.mint(user0.address, expandDecimals(1500, 18))
    expect(await opec.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await opec.connect(user0).approve(stakedOpecTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).stakeOpecForAccount(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).stakeOpecForAccount(user1.address, expandDecimals(800, 18))
    expect(await opec.balanceOf(user0.address)).eq(expandDecimals(700, 18))

    await opec.mint(user1.address, expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await opec.connect(user1).approve(stakedOpecTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeOpec(expandDecimals(200, 18))
    expect(await opec.balanceOf(user1.address)).eq(0)

    expect(await stakedOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user0.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))

    expect(await bonusOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusOpecTracker.depositBalances(user0.address, stakedOpecTracker.address)).eq(0)
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.depositBalances(user1.address, stakedOpecTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user0.address, bonusOpecTracker.address)).eq(0)
    expect(await feeOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).eq(0)
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusOpecTracker.claimable(user0.address)).eq(0)
    expect(await bonusOpecTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusOpecTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await feeOpecTracker.claimable(user0.address)).eq(0)
    expect(await feeOpecTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeOpecTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await esOpec.setMinter(wallet.address, true)
    await esOpec.mint(user2.address, expandDecimals(500, 18))
    await rewardRouter.connect(user2).stakeEsOpec(expandDecimals(500, 18))

    expect(await stakedOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user0.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await stakedOpecTracker.depositBalances(user2.address, esOpec.address)).eq(expandDecimals(500, 18))

    expect(await bonusOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusOpecTracker.depositBalances(user0.address, stakedOpecTracker.address)).eq(0)
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.depositBalances(user1.address, stakedOpecTracker.address)).eq(expandDecimals(1000, 18))
    expect(await bonusOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await bonusOpecTracker.depositBalances(user2.address, stakedOpecTracker.address)).eq(expandDecimals(500, 18))

    expect(await feeOpecTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeOpecTracker.depositBalances(user0.address, bonusOpecTracker.address)).eq(0)
    expect(await feeOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeOpecTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeOpecTracker.depositBalances(user2.address, bonusOpecTracker.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedOpecTracker.claimable(user0.address)).eq(0)
    expect(await stakedOpecTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedOpecTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedOpecTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedOpecTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await bonusOpecTracker.claimable(user0.address)).eq(0)
    expect(await bonusOpecTracker.claimable(user1.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusOpecTracker.claimable(user1.address)).lt("5490000000000000000")
    expect(await bonusOpecTracker.claimable(user2.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusOpecTracker.claimable(user2.address)).lt("1380000000000000000")

    expect(await feeOpecTracker.claimable(user0.address)).eq(0)
    expect(await feeOpecTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeOpecTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeOpecTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeOpecTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await esOpec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsOpec()
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esOpec.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsOpec()
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(1000, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(2643, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(2645, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3657, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3659, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(3643, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(3645, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("14100000000000000000") // 14.1
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("14300000000000000000") // 14.3

    expect(await opec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).unstakeOpec(expandDecimals(300, 18))
    expect(await opec.balanceOf(user1.address)).eq(expandDecimals(300, 18))

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(2643, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(2645, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(3357, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(3359, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(3343, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(3345, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("13000000000000000000") // 13
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("13100000000000000000") // 13.1

    const esOpecBalance1 = await esOpec.balanceOf(user1.address)
    const esOpecUnstakeBalance1 = await stakedOpecTracker.depositBalances(user1.address, esOpec.address)
    await rewardRouter.connect(user1).unstakeEsOpec(esOpecUnstakeBalance1)
    expect(await esOpec.balanceOf(user1.address)).eq(esOpecBalance1.add(esOpecUnstakeBalance1))

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(expandDecimals(700, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).eq(0)

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(702, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(703, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).eq(expandDecimals(700, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("2720000000000000000") // 2.72
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("2740000000000000000") // 2.74

    await expect(rewardRouter.connect(user1).unstakeEsOpec(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")
  })

  it("mintAndStakeXpc, unstakeAndRedeemXpc, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeXpcDistributor.address, expandDecimals(100, 18))
    await feeXpcDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(1, 18))
    const tx0 = await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    await reportGasUsed(provider, tx0, "mintAndStakeXpc gas used")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXpcTracker.depositBalances(user1.address, xpc.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXpcTracker.depositBalances(user1.address, feeXpcTracker.address)).eq(expandDecimals(2991, 17))

    await bnb.mint(user1.address, expandDecimals(2, 18))
    await bnb.connect(user1).approve(xpcManager.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeXpc(
      bnb.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeXpcTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeXpcTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    expect(await stakedXpcTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedXpcTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(xpcManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeXpc(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await expect(rewardRouter.connect(user2).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address
    )).to.be.revertedWith("XpcManager: cooldown duration not yet passed")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemXpc(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemXpc gas used")

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeXpcTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeXpcTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeXpcTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeXpcTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await stakedXpcTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedXpcTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedXpcTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedXpcTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await esOpec.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsOpec()
    expect(await esOpec.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esOpec.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esOpec.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsOpec()
    expect(await esOpec.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esOpec.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, opec.address)).eq(0)
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).gt(expandDecimals(4165, 18))
    expect(await stakedOpecTracker.depositBalances(user1.address, esOpec.address)).lt(expandDecimals(4167, 18))

    expect(await bonusOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await feeOpecTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeOpecTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).gt(expandDecimals(4165, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bonusOpecTracker.address)).lt(expandDecimals(4167, 18))
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).gt("12900000000000000000") // 12.9
    expect(await feeOpecTracker.depositBalances(user1.address, bnOpec.address)).lt("13100000000000000000") // 13.1

    expect(await feeXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedXpcTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })

  it("mintAndStakeXpcETH, unstakeAndRedeemXpcETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("XpcManager: insufficient USDG output")

    await expect(rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(299, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("XpcManager: insufficient XPC output")

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect(await bnb.totalSupply()).eq(0)
    expect(await provider.getBalance(bnb.address)).eq(0)
    expect(await stakedXpcTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeXpcETH(expandDecimals(299, 18), expandDecimals(299, 18), { value: expandDecimals(1, 18) })

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(bnb.address)).eq(expandDecimals(1, 18))
    expect(await bnb.totalSupply()).eq(expandDecimals(1, 18))
    expect(await stakedXpcTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH(expandDecimals(300, 18), expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("XpcManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await expect(rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("XpcManager: insufficient output")

    await rewardRouter.connect(user0).unstakeAndRedeemXpcETH("299100000000000000000", "990000000000000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await bnb.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(bnb.address)).eq("5991000000000000")
    expect(await bnb.totalSupply()).eq("5991000000000000")
  })
})
